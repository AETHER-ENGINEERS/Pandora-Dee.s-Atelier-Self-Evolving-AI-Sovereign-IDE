// Slash commands typed in the room. They answer with a note in the chat and never reach the AI,
// except /skill:name, which sends the rest of the line with that skill loaded.

import { desk } from "../lib/store.ts";
import { chatList, newChat, renameChat, switchChat } from "../lib/chats.ts";
import { chainFor, retry, say, writeJournal } from "../lib/agent.ts";
import { credential } from "../lib/model.ts";
import { compact, usage } from "../lib/context.ts";
import { findSkill, skillsOf } from "../lib/skills.ts";
import { memoryLines } from "../lib/tools.ts";
import { readAll } from "../lib/trajectories.ts";
import { links } from "../lib/connections.ts";
import { stopSpeaking } from "../lib/voice.ts";
import { openSettings } from "./Desktop.tsx";

export type Command = { name: string; args?: string; help: string };

export const COMMANDS: Command[] = [
  { name: "help", help: "List these commands" },
  { name: "new", args: "[title]", help: "Start a new chat (this one is saved)" },
  { name: "chats", help: "List saved chats" },
  { name: "open", args: "<number>", help: "Switch to a saved chat from /chats" },
  { name: "rename", args: "<title>", help: "Rename this chat" },
  { name: "clear", help: "Clear this chat's messages" },
  { name: "retry", help: "Ask again for the latest reply" },
  { name: "compact", help: "Summarise the earlier part of this chat now" },
  { name: "context", help: "How much of the model's context this chat uses" },
  { name: "copy", help: "Copy this chat as text" },
  { name: "models", help: "Connections and the models they use" },
  { name: "characters", help: "Who's in the room and who else is around" },
  { name: "memory", args: "[name]", help: "Show a character's memory" },
  { name: "journal", args: "[name]", help: "Have a character write today's journal entry" },
  { name: "skills", args: "[name]", help: "List a character's skills" },
  { name: "skill:", args: "<name> <request>", help: "Answer with that skill loaded" },
  { name: "mcp", help: "Tool servers and their state" },
  { name: "vector", help: "Vector bridge state" },
  { name: "discord", help: "Discord bridge state" },
  { name: "inbox", help: "Open the inbox" },
  { name: "voice", args: "[on|off]", help: "Read replies aloud, or stop" },
  { name: "trajectories", help: "How many replies are logged for fine-tuning" },
  { name: "config", help: "Open Settings" },
  { name: "heartbeat", help: "Heartbeat (arrives with the Automation batch)" },
  { name: "schedule", help: "Schedules (arrive with the Automation batch)" },
];

/** Commands that start with what's typed so far (for the suggestion list). */
export function suggest(draft: string): Command[] {
  if (!draft.startsWith("/") || /\s/.test(draft)) return [];
  const q = draft.slice(1).toLowerCase();
  return COMMANDS.filter((c) => c.name.startsWith(q));
}

const note = (text: string) => void desk().post({ kind: "notice", who: "desk", name: "Desk", text, source: "desk", quiet: true });

/** A character by name, or the one in focus. */
function who(arg: string) {
  const s = desk();
  const q = arg.trim().toLowerCase();
  if (!q) return s.character(s.focus);
  return s.visibleCharacters().find((c) => c.short.toLowerCase() === q || c.name.toLowerCase() === q || c.id === q) ?? s.visibleCharacters().find((c) => c.name.toLowerCase().includes(q));
}

function bridgeLine(key: "vector" | "discord") {
  const b = desk().bridges[key];
  const st = links.state(`bridge:${key}`);
  if (!b.enabled) return `${key === "vector" ? "Vector" : "Discord"} is off. Turn it on in Connections.`;
  return `${key === "vector" ? "Vector" : "Discord"}: ${st.state}${st.error ? ` (${st.error})` : ""}. Locksmith: ${b.owner || "not set"}. Answers ${b.trigger === "all" ? "everything" : b.trigger === "name" ? "when named" : "when mentioned"}; DMs from ${b.dms}.`;
}

/** Run a slash command. Returns false when the text isn't one (send it as a message). */
export async function runSlash(raw: string): Promise<boolean> {
  const text = raw.trim();
  if (!text.startsWith("/") || text.startsWith("//")) return false;
  const [head, ...rest] = text.slice(1).split(/\s+/);
  const arg = rest.join(" ");
  const cmd = head.toLowerCase();
  const s = desk();

  if (cmd.startsWith("skill:")) {
    const name = head.slice(6);
    const c = s.character(s.focus);
    const skill = c ? findSkill(s.filesOf(c.id), name) : undefined;
    if (!c || !skill) {
      note(`${c?.short ?? "Nobody"} has no skill called "${name}". Try /skills.`);
      return true;
    }
    await say(arg || `Use the ${skill.name} skill.`, undefined, { instruction: `[Skill: ${skill.name}]\n${skill.body.slice(0, 16000)}\n\nFollow this skill for the request above.` });
    return true;
  }

  switch (cmd) {
    case "help":
    case "?":
      note(`Commands:\n${COMMANDS.map((c) => `/${c.name}${c.args ? ` ${c.args}` : ""} · ${c.help}`).join("\n")}\n\nStart a message with // to send a line that begins with a slash.`);
      return true;
    case "new": {
      const why = await newChat(arg);
      if (why) note(why);
      return true;
    }
    case "chats": {
      const list = chatList();
      note(list.map((c, i) => `${i + 1}. ${c.id === s.chatId ? "▸ " : ""}${c.title} · ${c.count} message${c.count === 1 ? "" : "s"} · ${new Date(c.updated).toLocaleString()}`).join("\n") + "\n\nOpen one with /open <number>.");
      return true;
    }
    case "open": {
      const list = chatList();
      const pick = list[Number(arg) - 1] ?? list.find((c) => c.title.toLowerCase().includes(arg.toLowerCase()));
      if (!pick || !arg) {
        note("Which chat? See /chats for the numbers.");
        return true;
      }
      const why = await switchChat(pick.id);
      if (why) note(why);
      return true;
    }
    case "rename":
      if (!arg) note("Give the new title: /rename Trip planning");
      else renameChat(s.chatId, arg);
      return true;
    case "clear":
      s.clearRoom();
      return true;
    case "retry": {
      const why = await retry();
      if (why) note(why);
      return true;
    }
    case "compact": {
      const c = s.character(s.focus) ?? s.roomCharacters()[0];
      note(await compact(c ? chainFor(c.id).list : [], (conn) => credential(conn, desk().env)));
      return true;
    }
    case "context": {
      const u = usage();
      const pct = Math.round((u.used / u.window) * 100);
      const c = s.chat;
      note(
        `About ${u.used.toLocaleString()} tokens of ${u.window.toLocaleString()} (${pct}%)${c.numCtx ? "" : ", measured against 8,192 because no context window is set"}. ` +
          `${u.messages} message${u.messages === 1 ? "" : "s"} sent word for word (up to ${c.historyLimit})${u.summary ? ", plus a summary of earlier ones" : ""}. ` +
          `Compacting: ${c.compactAfter || c.compactAtPct ? [c.compactAfter ? `after ${c.compactAfter} messages` : "", c.compactAtPct ? `at ${c.compactAtPct}% full` : ""].filter(Boolean).join(" or ") : "off"} (Settings → Conversations).`,
      );
      return true;
    }
    case "copy": {
      const body = s.messages
        .filter((m) => !m.pass)
        .map((m) => `${m.name}: ${m.text}`)
        .join("\n\n");
      await navigator.clipboard?.writeText(body);
      s.say("Conversation copied.");
      return true;
    }
    case "models": {
      const lines = s.model.connections.map((c) => `${c.enabled ? "●" : "○"} ${c.label} · ${c.model || "model picked automatically"}`);
      const own = s.roomCharacters().filter((c) => s.charPrefs[c.id]?.connection || s.charPrefs[c.id]?.model);
      note(`${lines.join("\n")}${own.length ? `\n\nOwn choices: ${own.map((c) => `${c.short} → ${s.charPrefs[c.id]?.model || "their connection's model"}`).join(", ")}` : ""}`);
      return true;
    }
    case "characters": {
      const room = s.roomCharacters();
      const others = s.visibleCharacters().filter((c) => !room.some((r) => r.id === c.id));
      note(`In the room: ${room.map((c) => (c.id === s.focus ? `${c.short} (answers by default)` : c.short)).join(", ") || "nobody"}.\nAround: ${others.map((c) => c.short).join(", ") || "nobody else"}.`);
      return true;
    }
    case "memory": {
      const c = who(arg);
      if (!c) return note("Nobody by that name."), true;
      const lines = memoryLines(c.id);
      note(lines.length ? `${c.short}'s memory:\n${lines.map((l) => `${l.n}. ${l.text}`).join("\n")}` : `${c.short} hasn't kept anything yet.`);
      return true;
    }
    case "journal": {
      const c = who(arg);
      if (!c) return note("Nobody by that name."), true;
      note(`${c.short}: ${await writeJournal(c.id)}`);
      return true;
    }
    case "skills": {
      const c = who(arg);
      if (!c) return note("Nobody by that name."), true;
      const list = skillsOf(s.filesOf(c.id));
      note(
        list.length
          ? `${c.short}'s skills:\n${list.map((k) => `/skill:${k.name} · ${k.description || "(no description)"}`).join("\n")}`
          : `${c.short} has no skills yet. A skill is a file at skills/<name>/SKILL.md in their files, with "name:" and "description:" between --- lines at the top.`,
      );
      return true;
    }
    case "mcp": {
      note(s.mcp.length ? s.mcp.map((m) => {
        const st = links.state(`mcp:${m.id}`);
        return `${m.enabled ? "●" : "○"} ${m.name} · ${st.state}${st.tools ? ` · ${st.tools} tools` : ""}${st.error ? ` · ${st.error}` : ""} · ${m.exposure ?? "direct"}`;
      }).join("\n") : "No tool servers yet. Add one in Connections → Tool servers.");
      return true;
    }
    case "vector":
    case "discord":
      note(bridgeLine(cmd));
      return true;
    case "inbox": {
      const open = s.inbox.filter((i) => !i.done).length;
      sessionStorage.setItem("pdd-conn-tab", "inbox");
      window.dispatchEvent(new CustomEvent("pdd-connections", { detail: "inbox" }));
      s.openApp("connections");
      note(open ? `${open} message${open === 1 ? "" : "s"} waiting in the inbox.` : "The inbox is empty.");
      return true;
    }
    case "voice": {
      const on = arg ? /^(on|yes|1)$/i.test(arg) : !s.voice.on;
      if (!on) stopSpeaking();
      s.set({ voice: { ...s.voice, on } });
      note(`Voice is ${on ? "on: replies are read aloud" : "off"}.`);
      return true;
    }
    case "trajectories": {
      const n = (await readAll()).length;
      note(`${s.chat.trajectories ? "Logging is on." : "Logging is off."} ${n} repl${n === 1 ? "y" : "ies"} logged. Export them in Settings → Conversations.`);
      return true;
    }
    case "config":
    case "settings":
      openSettings();
      return true;
    case "heartbeat":
    case "schedule":
      note(`/${cmd} arrives with the Automation batch (Flows, Schedule, Heartbeat).`);
      return true;
  }
  note(`There's no /${head} command. Type /help for the list, or start with // to send it as a message.`);
  return true;
}
