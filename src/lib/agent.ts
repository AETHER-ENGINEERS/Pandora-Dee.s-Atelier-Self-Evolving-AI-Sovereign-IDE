// Runs the room: who answers, in what order, through which connection, with which tools.

import type { Character } from "./characters.ts";
import { desk } from "./store.ts";
import { explainError, listModels, pickModel, scopeOf, streamOnce, type Connection, type Turn } from "./model.ts";
import { allowed, blockedBecause } from "./privacy.ts";
import {
  TURN_NUDGE,
  isPass,
  scopedPrompt,
  loopCheck,
  loopNotice,
  responders,
  streakOf,
  systemPrompt,
  tidyReply,
  transcriptFor,
  type Message,
  type Source,
} from "./room.ts";
import { addJournal, describeCall, runTool, toolsFor, type Scope } from "./tools.ts";
import { speak, stopSpeaking } from "./voice.ts";
import { aiFor, voiceFor } from "./prefs.ts";
import type { TurnCtx } from "./tools.ts";
import { bridge } from "./xdc.ts";
import { fileInInbox, joinedApps } from "./messengers.ts";
import { gameScreen } from "./bus.ts";
import type { Role } from "./flood.ts";
import { currentChat } from "./chats.ts";
import { compact, shouldCompact } from "./context.ts";
import { record } from "./trajectories.ts";
import { isImage, type Attachment } from "./room.ts";

let controller: AbortController | null = null;
let running = false;

export function isRunning() {
  return running;
}

export function stopAll() {
  controller?.abort();
  controller = null;
  stopSpeaking();
}

function setBusy(id: string, what: string | null) {
  const busy = { ...desk().busy };
  if (what) busy[id] = what;
  else delete busy[id];
  desk().set({ busy });
}

function keyFor(c: Connection) {
  return c.keyName ? desk().env[c.keyName] ?? "" : "";
}

/** Connections to try for this character, in order, with the reason any were skipped. */
export function chainFor(charId: string): { list: { conn: Connection; model: string }[]; skipped: string[] } {
  const s = desk();
  const pref = s.charPrefs[charId];
  const conns = s.model.connections;
  const picked: { conn: Connection; model: string }[] = [];
  if (pref?.connection) {
    const c = conns.find((x) => x.id === pref.connection && x.enabled);
    if (c) picked.push({ conn: c, model: pref.model || c.model });
  }
  if (!picked.length) {
    for (const id of s.model.order) {
      const c = conns.find((x) => x.id === id && x.enabled);
      if (c) picked.push({ conn: c, model: c.model });
    }
    for (const c of conns) if (c.enabled && !picked.some((p) => p.conn.id === c.id)) picked.push({ conn: c, model: c.model });
  }
  const skipped: string[] = [];
  const list = picked.filter(({ conn }) => {
    const scope = scopeOf(conn.baseUrl);
    if (scope === "device") return true;
    const feature = scope === "network" ? "network-models" : "online-models";
    if (allowed(s.privacy, feature)) return true;
    skipped.push(`${conn.label}: ${blockedBecause(s.privacy, feature)}`);
    return false;
  });
  return { list, skipped };
}

async function ensureModel(conn: Connection, model: string, signal: AbortSignal) {
  if (model) return model;
  const found = pickModel(await listModels(conn, keyFor(conn), signal));
  if (!found) throw new Error(`${conn.label} has no models yet.${conn.kind === "ollama" ? " Try: ollama pull qwen3:8b" : ""}`);
  const s = desk();
  s.set({ model: { ...s.model, connections: s.model.connections.map((c) => (c.id === conn.id ? { ...c, model: found } : c)) } });
  return found;
}

type TurnResult = { text: string; ok: boolean };

/**
 * One character takes one turn: builds its prompt, streams the reply into a new room
 * message, runs any tools it asks for, and falls back to the next connection on failure.
 */
type TurnOpts = {
  nudge?: boolean;
  scope: Scope;
  replyTo?: Message;
  instruction?: string;
  silent?: boolean;
  /** Pictures that came with the message being answered (vision models only). */
  images?: { data: string; mime: string }[];
  /** Answer from this conversation instead of the open one (journaling a chat that ended). */
  history?: Message[];
  /** Runs alongside the room with its own stop signal. */
  signal?: AbortSignal;
};

async function takeTurn(me: Character, opts: TurnOpts): Promise<TurnResult> {
  const s = desk();
  const room = s.roomCharacters();
  const signal = opts.signal ?? controller!.signal;
  const history = opts.history ?? s.messages;
  // A compacted chat sends its summary instead of the messages it covers (not for bridge chats or ended chats).
  const meta = !opts.history ? currentChat() : undefined;
  const people = [s.session ?? (s.accounts.length ? "a guest" : "")].filter(Boolean);
  const g = s.game;
  const playing = Boolean(g && g.players.includes(me.id));
  const screen = playing ? await gameScreen.read() : "";
  const bridge = opts.replyTo?.bridge && opts.replyTo.source !== "desk" ? { ...opts.replyTo.bridge, source: opts.replyTo.source as "discord" | "vector" } : undefined;
  const ctx: TurnCtx = {
    charId: me.id,
    scope: opts.scope,
    source: bridge?.source ?? "desk",
    chatId: bridge?.chatId,
    msgId: bridge?.msgId,
    isGroup: bridge?.isGroup,
    senderName: opts.replyTo?.name,
    loaded: new Set(),
  };
  const sys = bridge && opts.scope !== "locksmith"
    ? scopedPrompt({
        me,
        files: s.filesOf(me.id),
        via: bridge.source === "vector" ? "Vector" : "Discord",
        locksmithName: s.bridges[bridge.source].ownerName,
        who: opts.replyTo?.name ?? "someone",
        role: opts.scope === "admin" ? "admin" : "public",
        archive: bridge.source === "discord" ? s.bridges.discord.archiveName : undefined,
        now: new Date(),
      })
    : systemPrompt({
    me,
    files: s.filesOf(me.id),
    room: room.some((c) => c.id === me.id) ? room : [...room, me],
    people,
    game: g && playing ? { title: g.title, players: g.players.map((p) => s.character(p)?.short ?? p), screen, xdc: g.kind === "xdc" } : undefined,
    now: new Date(),
    length: aiFor(me.id).length,
    summary: meta?.summary,
    skillRouter: s.chat.skillRouter,
  });
  const base: Turn[] = [
    { role: "system", content: sys },
    ...transcriptFor(me, history, s.chat.historyLimit, bridge?.chatId, { stamp: s.chat.stampTimes, after: bridge ? undefined : meta?.summaryUpTo }),
  ];
  if (opts.images?.length) {
    const lastUser = [...base].reverse().find((t) => t.role === "user");
    if (lastUser && lastUser.role === "user") lastUser.images = opts.images;
  }
  if (bridge) {
    // Attached to the message being answered, so it stays the last thing the model reads.
    const note = `\n\n(Your plain-text answer is sent to this ${bridge.source === "vector" ? "Vector" : "Discord"} chat as a reply. Answer NO_REPLY to stay silent.${opts.scope === "locksmith" ? " This is your locksmith: you have every tool." : " Pass anything your locksmith should know on with notify_locksmith."})`;
    const lastUser = [...base].reverse().find((t) => t.role === "user");
    if (lastUser && lastUser.role === "user") lastUser.content += note;
    else base.push({ role: "user", content: note.trim() });
  }
  if (opts.nudge) base.push({ role: "user", content: TURN_NUDGE });
  if (opts.instruction) base.push({ role: "user", content: opts.instruction });

  const { list, skipped } = chainFor(me.id);
  if (!list.length) {
    const why = skipped.length ? skipped.join(" ") : "No AI connection is set up yet. Open Settings → AI.";
    if (!opts.silent) s.post({ kind: "notice", who: "desk", name: "Desk", text: `${me.short} can't answer. ${why}`, source: "desk", error: true });
    return { text: "", ok: false };
  }

  const msgId = opts.silent ? "" : s.post({ kind: "character", who: me.id, name: me.short, text: "", source: opts.replyTo?.source ?? "desk", bridge: opts.replyTo?.bridge });
  const patch = (p: Partial<Message>) => msgId && desk().patchMessage(msgId, p);
  setBusy(me.id, "thinking");
  let lastErr = "";

  for (const { conn, model: wanted } of list) {
    let shown = "";
    const used: NonNullable<Message["tools"]> = [];
    try {
      const model = await ensureModel(conn, wanted, signal);
      const ai = aiFor(me.id);
      let tools = ai.tools ? toolsFor(ctx) : [];
      const turns = [...base];
      let final = "";
      for (let step = 0; step <= ai.maxSteps; step++) {
        let streamed = "";
        let result;
        try {
          result = await streamOnce(conn, model, keyFor(conn), turns, step < ai.maxSteps ? tools : [], ai.temperature, (piece) => {
            streamed += piece;
            setBusy(me.id, "typing");
            patch({ text: tidyReply(me, shown + streamed, room) });
          }, signal, { numCtx: s.chat.numCtx || undefined });
        } catch (e) {
          if ((e as { noTools?: boolean }).noTools && tools.length) {
            tools = [];
            step--;
            continue;
          }
          throw e;
        }
        if (!result.toolCalls.length) {
          final = shown + result.text;
          turns.push({ role: "assistant", content: result.text });
          break;
        }
        turns.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
        if (result.text.trim()) shown += `${result.text.trim()}\n\n`;
        for (const call of result.toolCalls) {
          setBusy(me.id, describeCall(call.name, call.args));
          const out = await runTool(tools, ctx, call.name, call.args);
          used.push({ name: call.name, ok: out.ok, note: describeCall(call.name, call.args) });
          patch({ tools: [...used] });
          turns.push({ role: "tool", content: out.text.slice(0, 12000), callId: call.id, name: call.name });
        }
        // tool_search may have loaded more tools for the next step.
        if (ai.tools && result.toolCalls.some((c) => c.name === "tool_search")) tools = toolsFor(ctx);
      }
      const text = tidyReply(me, final, room);
      const pass = isPass(text) || (!text && !used.length);
      patch({ text: pass ? "" : text, pass, via: `${conn.label} · ${model}`, tools: used.length ? used : undefined });
      setBusy(me.id, null);
      if (msgId && !pass)
        record({
          id: msgId,
          at: Date.now(),
          chat: desk().chatId,
          character: me.id,
          model: `${conn.label} · ${model}`,
          tools: tools.map(({ name, description, parameters }) => ({ name, description, parameters })),
          messages: turns,
        });
      if (!pass && !opts.silent && opts.replyTo?.source !== "discord" && opts.replyTo?.source !== "vector") {
        const v = voiceFor(me.id);
        speak(me.id, text, v.prefs, v.shift);
      }
      return { text: pass ? "" : text, ok: true };
    } catch (e) {
      lastErr = explainError(e, conn);
      if (signal.aborted) break;
      if (shown || used.length) break; // already said something; don't repeat it elsewhere
    }
  }
  setBusy(me.id, null);
  if (msgId) {
    const cur = desk().messages.find((m) => m.id === msgId);
    if (cur && !cur.text && signal.aborted) patch({ pass: true });
    else if (cur && !cur.text) patch({ kind: "notice", who: "desk", name: "Desk", text: `${me.short} couldn't answer. ${lastErr}`, error: true });
    else patch({ via: "stopped" });
  }
  return { text: "", ok: false };
}

async function withRun(fn: () => Promise<void>) {
  if (running) stopAll();
  running = true;
  controller = new AbortController();
  try {
    await fn();
  } finally {
    running = false;
    desk().set({ busy: {} });
  }
}

/** A round where each other character may add something, governed by the loop breaker. */
async function rounds(lastSpeaker: string) {
  let last = lastSpeaker;
  for (let round = 0; round < 8; round++) {
    const s = desk();
    const room = s.roomCharacters();
    const order = [...room.filter((c) => c.id !== last)];
    let anyone = false;
    for (const c of order) {
      if (controller?.signal.aborted || desk().flood.shut) return;
      const r = await takeTurn(c, { nudge: true, scope: "locksmith" });
      if (!r.ok) return;
      if (!r.text) continue;
      anyone = true;
      last = c.id;
      const st = desk();
      const prior = st.messages.slice(0, -1);
      const v = loopCheck(prior, r.text, streakOf(st.messages), st.loopBreak);
      if (v !== "ok") {
        st.notice(loopNotice(v));
        return;
      }
    }
    if (!anyone || !desk().freeTalk) return;
  }
}

/** Pictures sent with a message, read back from the vault for vision models. */
async function picturesOf(files?: Attachment[]) {
  const out: { data: string; mime: string }[] = [];
  for (const f of files ?? []) {
    if (!isImage(f)) continue;
    try {
      const res = await fetch(`/api/vault/file?path=${encodeURIComponent(f.path)}`);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      out.push({ data: btoa(bin), mime: f.mime });
    } catch {
      /* skip a picture that can't be read */
    }
  }
  return out;
}

/** Compact the open chat first when the context guard says so. */
async function guard(focus: string) {
  if (!shouldCompact()) return;
  const { list } = chainFor(focus);
  desk().post({ kind: "notice", who: "desk", name: "Desk", text: await compact(list, keyFor), source: "desk", quiet: true });
}

/** The characters answer a human message that's already in the room. */
async function respond(msg: Message, instruction?: string) {
  const s = desk();
  const room = s.roomCharacters();
  if (!room.length) {
    s.notice("Nobody's in the room yet. Open Characters and invite someone.");
    return;
  }
  const who = responders(msg.text, room, s.focus);
  const images = await picturesOf(msg.files);
  await withRun(async () => {
    await guard(who[0]?.id ?? s.focus);
    let last = "";
    for (const c of who) {
      if (controller?.signal.aborted) return;
      const r = await takeTurn(c, { scope: "locksmith", instruction, images: images.length ? images : undefined });
      if (!r.ok) return;
      if (r.text) last = c.id;
    }
    if (desk().freeTalk && last) await rounds(last);
  });
}

/** Someone at this computer said something in the room (or a program, through the inbound API, as `from`). */
export async function say(text: string, from?: string, extra: { files?: Attachment[]; instruction?: string } = {}) {
  const s = desk();
  const clean = text.trim();
  if (!clean && !extra.files?.length) return;
  const role = from ? "keyholder" : s.role();
  const blocked = s.weigh(clean || "(files)", "desk", role);
  const name = from ?? s.session ?? "You";
  const id = s.post({ kind: "human", who: from ? `api:${from}` : s.session ?? "you", name, text: clean, source: "desk", files: extra.files?.length ? extra.files : undefined });
  if (blocked) {
    s.notice(blocked);
    return;
  }
  const msg = desk().messages.find((m) => m.id === id);
  if (msg) await respond(msg, extra.instruction);
}

/** The latest reply again: drop what the characters said since your last message and ask once more. */
export async function retry(): Promise<string> {
  if (running) return "Wait for the characters to finish, or press Stop first.";
  const s = desk();
  let i = s.messages.length - 1;
  while (i >= 0 && !(s.messages[i].kind === "human" && s.messages[i].source === "desk")) i--;
  if (i < 0) return "There's nothing to retry yet.";
  const msg = s.messages[i];
  s.set({ messages: s.messages.slice(0, i + 1) });
  await respond(msg);
  return "";
}

/** Change something you said and send it again; everything after it is dropped. */
export async function editAndResend(id: string, text: string): Promise<string> {
  if (running) return "Wait for the characters to finish, or press Stop first.";
  const s = desk();
  const i = s.messages.findIndex((m) => m.id === id);
  if (i < 0 || s.messages[i].kind !== "human") return "That message is gone.";
  const old = s.messages[i];
  s.set({ messages: s.messages.slice(0, i) });
  await say(text, old.who.startsWith("api:") ? old.name : undefined, { files: old.files });
  return "";
}

export async function letThemTalk() {
  const s = desk();
  if (s.flood.shut) {
    s.notice("The flood gate is shut, so the characters are resting. The keyholder can reopen it in Sentry.");
    return;
  }
  const lastChar = [...s.messages].reverse().find((m) => m.kind === "character" && !m.pass);
  await withRun(() => rounds(lastChar?.who ?? ""));
}

/** The characters playing the open game each react to what's on the screen. */
// When a person makes a move in an app with "answer when you make a move" on, the players answer.
let wakeTimer = 0;
bridge.watch((scope, row) => {
  const s = desk();
  const g = s.game;
  if (!g || g.kind !== "xdc" || g.scope !== scope || !row.from.startsWith("you:")) return;
  const prefs = s.appPrefs[`xdc:${g.slug}`] ?? {};
  if (!(prefs.wake ?? g.slug === "jade-link") || !g.players.length) return;
  window.clearTimeout(wakeTimer);
  wakeTimer = window.setTimeout(() => {
    if (!running) void gameTurn();
  }, 1500);
});

export async function gameTurn() {
  const s = desk();
  const g = s.game;
  if (!g) return;
  if (s.flood.shut) return s.notice("The flood gate is shut, so the characters are resting.");
  const players = g.players.map((id) => s.character(id)).filter((c): c is Character => Boolean(c));
  if (!players.length) return s.notice("No characters are playing. Tap their names above the game to add them.");
  await withRun(async () => {
    for (const c of players) {
      if (controller?.signal.aborted) return;
      await takeTurn(c, {
        scope: "locksmith",
        instruction:
          g.kind === "xdc"
            ? `[Game] You're playing the Vector app "${g.title}" together, as a real player. Check app_updates to see the state, and if it's your turn make your move with app_send_update. Then say a short, playful line about it.`
            : `[Game] You're playing "${g.title}" together. The game screen is described in your context. Say what you'd do next, or react to what's happening. Short and playful; the human has the controls.`,
      });
    }
  });
}

/**
 * Ask one character to do something privately (journal, memory). The reply isn't posted in the room.
 * With `history` (a chat that has ended) it runs alongside the room instead of taking it over.
 */
export async function privately(charId: string, instruction: string, history?: Message[]): Promise<string> {
  const c = desk().character(charId);
  if (!c) return "";
  if (history) {
    const r = await takeTurn(c, { scope: "locksmith", instruction, silent: true, history, signal: new AbortController().signal });
    return r.text;
  }
  let out = "";
  await withRun(async () => {
    const r = await takeTurn(c, { scope: "locksmith", instruction, silent: true });
    out = r.text;
  });
  return out;
}

export async function writeJournal(charId: string, history?: Message[]) {
  const s = desk();
  const before = JSON.stringify(s.filesOf(charId));
  const text = await privately(
    charId,
    "[Desk] Write today's quest-journal entry about this conversation, in your own voice: what happened with the people you were with, the humour that fit, and the clear next step. Use the journal_write tool if you have it. If you don't, reply with the title on the first line, then the story, then a final line starting with Next:",
    history,
  );
  const after = JSON.stringify(desk().filesOf(charId));
  if (before !== after) return "Journal entry written.";
  if (!text.trim()) return "No entry was written. Is an AI connection set up?";
  const lines = text.trim().split("\n");
  const title = lines[0].replace(/^#+\s*/, "").replace(/\*\*/g, "");
  const nextIdx = lines.findIndex((l) => /^\**next:?\**/i.test(l.trim()));
  const story = lines.slice(1, nextIdx > 0 ? nextIdx : undefined).join("\n");
  const next = nextIdx > 0 ? lines[nextIdx].replace(/^\**next:?\**:?\s*/i, "") : "";
  addJournal(charId, title, story, next);
  return "Journal entry written.";
}

export async function reflect(charId: string, history?: Message[]) {
  const s = desk();
  const before = s.filesOf(charId)["MEMORY.md"];
  const text = await privately(
    charId,
    "[Desk] Look back over this conversation. If anything changed how you work or what you've learned about yourself, keep up to three short lines with the remember tool. People appear only inside the observation, never as the subject. If nothing is worth keeping, say so in one line.",
    history,
  );
  if (desk().filesOf(charId)["MEMORY.md"] !== before) return "Memory updated.";
  return text ? `Nothing kept. ${text.slice(0, 160)}` : "Nothing kept.";
}

let endings: Promise<unknown> = Promise.resolve();

/** A chat ended (new chat, or switched away): journal it and keep what was learned, when those are on. */
export function endOfChat(history: Message[]) {
  const s = desk();
  if (!s.chat.autoJournal && !s.chat.learnFacts) return;
  const spoke = [...new Set(history.filter((m) => m.kind === "character" && !m.pass && m.text).map((m) => m.who))].filter((id) => s.character(id));
  if (!spoke.length || !history.some((m) => m.kind === "human")) return;
  endings = endings
    .then(async () => {
      for (const id of spoke) {
        const name = desk().character(id)?.short ?? id;
        const done: string[] = [];
        if (desk().chat.autoJournal && (await writeJournal(id, history)) === "Journal entry written.") done.push("journal");
        if (desk().chat.learnFacts && (await reflect(id, history)) === "Memory updated.") done.push("memory");
        if (done.length) desk().log(`${name} wrote up the last chat (${done.join(" and ")}).`);
      }
    })
    .catch(() => undefined);
}

// ---------- bridges ----------

export type Incoming = {
  source: Exclude<Source, "desk">;
  chatId: string;
  msgId?: string;
  author: string;
  authorId: string;
  text: string;
  isGroup: boolean;
  /** Mentioned the bot, or replied to one of its messages. */
  mentionsMe: boolean;
  channelName?: string;
  /** Pictures attached to the message, by index (fetched only if the bridge allows images). */
  imageIndexes?: number[];
};

export type BridgeIO = {
  send: (chatId: string, text: string, replyTo?: string) => Promise<void>;
  typing: (chatId: string) => Promise<void>;
  image: (msgId: string, index: number) => Promise<{ data: string; mime: string } | null>;
};

function listOf(text: string) {
  return text
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function bridgeRole(source: Exclude<Source, "desk">, authorId: string): Role {
  const b = desk().bridges[source];
  if (b.owner && authorId === b.owner.trim()) return "keyholder";
  if (listOf(b.residents).includes(authorId)) return "resident";
  return "general";
}

/** Trigger words: the ones set for the bridge plus every character's names, matched as whole words. */
function triggered(m: Incoming) {
  const s = desk();
  const b = s.bridges[m.source];
  if (b.trigger === "all" || m.mentionsMe) return true;
  if (b.trigger === "mention") return false;
  const words = [...listOf(b.words), ...s.visibleCharacters().flatMap((c) => [c.short, c.name])].map((w) => w.toLowerCase()).filter(Boolean);
  const t = m.text.toLowerCase();
  return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}_])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}_])`, "u").test(t));
}

/** Should a character answer this message? (Classic's rules.) Returns the reason when not. */
export function answerRule(m: Incoming): { answer: boolean; why: string } {
  const b = desk().bridges[m.source];
  const role = bridgeRole(m.source, m.authorId);
  if (!m.isGroup) {
    const ok = b.dms === "anyone" || role === "keyholder" || (b.dms === "residents" && role === "resident");
    return { answer: ok && b.dms !== "off" ? true : role === "keyholder", why: ok ? "" : "DM policy" };
  }
  const channels = listOf(b.channels);
  const inChannel = channels.some((c) => c === m.chatId || c.replace(/^#/, "").toLowerCase() === (m.channelName ?? "").toLowerCase());
  return { answer: (role === "keyholder" || inChannel) && triggered(m), why: "" };
}

export const wantsAnswer = (m: Incoming) => answerRule(m).answer;

type Job = { m: Incoming; lines: string[]; io: BridgeIO };
const queue: Job[] = [];
let pumping = false;

/** One conversation at a time: bridge messages wait for whatever is running, never interrupt it. */
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      while (running) await new Promise((r) => setTimeout(r, 1200));
      const job = queue.shift()!;
      await answerJob(job);
    }
  } finally {
    pumping = false;
  }
}

async function answerJob({ m, io }: Job) {
  const s = desk();
  const b = s.bridges[m.source];
  const role = bridgeRole(m.source, m.authorId);
  const scope: Scope = role === "keyholder" ? "locksmith" : role === "resident" ? "admin" : "public";
  const pool = s.visibleCharacters();
  const named = pool.filter((c) => new RegExp(`\\b${c.short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(m.text));
  const fallback = pool.find((c) => c.id === b.answerAs) ?? pool[0];
  const who = named.length ? named.slice(0, 2) : fallback ? [fallback] : [];
  const replyTo = [...desk().messages].reverse().find((x) => x.bridge?.chatId === m.chatId && x.kind === "human");
  let images: { data: string; mime: string }[] = [];
  if (b.images && m.msgId && m.imageIndexes?.length) {
    for (const i of m.imageIndexes.slice(0, 4)) {
      const img = await io.image(m.msgId, i).catch(() => null);
      if (img) images.push(img);
    }
  }
  if (scope !== "locksmith") images = images.slice(0, 2);
  await withRun(async () => {
    for (const c of who) {
      await io.typing(m.chatId).catch(() => {});
      const r = await takeTurn(c, { scope, replyTo, images });
      if (r.text) await io.send(m.chatId, r.text, m.msgId).catch((e) => desk().notice(`Couldn't post ${c.short}'s reply to ${m.source === "vector" ? "Vector" : "Discord"}: ${e instanceof Error ? e.message : e}`));
    }
  });
}

/** A message arrived from Discord or Vector. It shows in the room; a character may answer back there. */
export async function receive(m: Incoming, io: BridgeIO) {
  const s = desk();
  const role = bridgeRole(m.source, m.authorId);
  const blocked = s.weigh(m.text, m.source, role);
  s.post({ kind: "human", who: m.author, name: m.author, text: m.text, source: m.source, bridge: { chatId: m.chatId, msgId: m.msgId, author: m.authorId, isGroup: m.isGroup } });
  if (blocked) {
    s.notice(blocked);
    return;
  }
  const rule = answerRule(m);
  if (!rule.answer) {
    if (rule.why && s.bridges[m.source].inboxUnanswered) {
      void fileInInbox({ from: m.author, where: "a DM", via: m.source, text: m.text, note: `not answered: ${rule.why}` });
    }
    return;
  }
  const last = queue[queue.length - 1];
  if (last && last.m.chatId === m.chatId && last.m.authorId === m.authorId) {
    last.m = { ...m, text: `${last.m.text}\n${m.text}` };
    return;
  }
  queue.push({ m, lines: [m.text], io });
  void pump();
}

/** A Mini App on Vector got new moves: the character who joined it takes a turn to answer. */
export async function wakeForApp(topic: string, frames: string, chatId: string) {
  const s = desk();
  const joined = joinedApps.get(topic);
  const c = joined ? s.character(joined.charId) : undefined;
  if (!c) return;
  while (running) await new Promise((r) => setTimeout(r, 1200));
  await withRun(async () => {
    await takeTurn(c, {
      scope: joined!.role,
      instruction: `[Mini App] New moves in the app you joined (topic ${topic}, chat ${chatId}):\n${frames.slice(0, 4000)}\nIf it's your turn, answer with vector action=xdc_send topic=${topic} frame=<your move in the app's format>. Otherwise reply NO_REPLY.`,
      silent: true,
    });
  });
}
