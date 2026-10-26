// Polls the Discord and Vector bridges (the same bridge servers the original Pandora Dee
// uses) and hands what arrives to the room.

import { desk, type BridgeId } from "./store.ts";
import { connectBridge, disconnect, links } from "./connections.ts";
import { parseJson } from "./mcp.ts";
import { bridgeRole, receive, wakeForApp, type BridgeIO, type Incoming } from "./agent.ts";
import { allowed } from "./privacy.ts";
import { fileInInbox, joinedApps } from "./messengers.ts";

const timers = new Map<BridgeId, number>();
const polling = new Set<BridgeId>();
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;

type Attachment = { name?: string; filename?: string; content_type?: string; extension?: string };

type DiscordMsg = {
  id?: string;
  chat_id?: string;
  is_group?: boolean;
  text?: string;
  content?: string;
  author?: { id?: string; name?: string; username?: string };
  mentions_me?: boolean;
  reply_to?: { author_id?: string };
  channel?: string;
  attachments?: Attachment[];
};

type VectorMsg = { id?: string; chat_id?: string; is_group?: boolean; content?: string; npub?: string; mine?: boolean; name?: string; display_name?: string; replied_to_npub?: string; attachments?: Attachment[] };

const imageIndexes = (list: Attachment[] = []) =>
  list.map((a, i) => ({ a, i })).filter(({ a }) => (a.content_type ?? "").startsWith("image/") || IMAGE.test(a.name ?? a.filename ?? "") || IMAGE.test(`.${a.extension ?? ""}`)).map(({ i }) => i);

const me: Partial<Record<BridgeId, string>> = {};

function toIncoming(id: BridgeId, raw: DiscordMsg & VectorMsg): Incoming | null {
  if (id === "discord") {
    if (!raw.author?.id || !raw.chat_id || raw.author.id === me.discord) return null;
    return {
      source: "discord",
      chatId: String(raw.chat_id),
      msgId: raw.id ? String(raw.id) : undefined,
      author: raw.author.name || raw.author.username || "Someone",
      authorId: String(raw.author.id),
      text: String(raw.text ?? raw.content ?? ""),
      isGroup: Boolean(raw.is_group),
      mentionsMe: Boolean(raw.mentions_me) || (Boolean(me.discord) && raw.reply_to?.author_id === me.discord),
      channelName: raw.channel,
      imageIndexes: imageIndexes(raw.attachments),
    };
  }
  if (raw.mine || !raw.chat_id) return null;
  const sender = raw.npub || (raw.is_group ? "" : raw.chat_id);
  const text = String(raw.content ?? "");
  return {
    source: "vector",
    chatId: String(raw.chat_id),
    msgId: raw.id ? String(raw.id) : undefined,
    author: raw.display_name || raw.name || (sender ? `${sender.slice(0, 12)}…` : "Someone"),
    authorId: sender,
    text,
    isGroup: Boolean(raw.is_group),
    mentionsMe: Boolean(me.vector) && (raw.replied_to_npub === me.vector || text.includes(me.vector ?? "\u0000")),
    imageIndexes: imageIndexes(raw.attachments),
  };
}

function io(id: BridgeId): BridgeIO {
  const c = () => links.client(`bridge:${id}`);
  return {
    send: async (chatId, text, replyTo) => {
      await c()?.call("send_message", { chat_id: chatId, content: text.slice(0, 8000), ...(replyTo ? { replied_to: replyTo } : {}) });
    },
    typing: async (chatId) => {
      await c()?.call("send_typing", { chat_id: chatId });
    },
    image: async (msgId, index) => {
      const raw = await c()?.call("download_attachment", { message_id: msgId, index, max_mb: 8 });
      const d = parseJson<{ base64?: string; name?: string; content_type?: string }>(raw ?? "", {});
      if (!d.base64) return null;
      const ext = (d.name ?? "").split(".").pop()?.toLowerCase() ?? "png";
      return { data: d.base64, mime: d.content_type || `image/${ext === "jpg" ? "jpeg" : ext}` };
    },
  };
}

async function vectorEvents() {
  const c = links.client("bridge:vector");
  if (!c) return;
  const s = desk();
  const events = parseJson<{ type?: string; community_id?: string; inviter_npub?: string; inviter?: string; name?: string }[]>(await c.call("get_new_events").catch(() => "[]"), []);
  for (const e of events) {
    if (e.type === "invite" && e.community_id) {
      const who = e.inviter_npub || e.inviter || "";
      const role = bridgeRole("vector", who);
      if (role === "keyholder" || role === "resident" || s.bridges.vector.autoJoin === "anyone") {
        await c.call("accept_pending_invite", { community_id: e.community_id }).catch(() => "");
        s.log(`Vector: joined ${e.name || "a community"} (invited by ${who.slice(0, 14) || "someone"}).`);
      } else {
        void fileInInbox({ from: who.slice(0, 14), where: e.community_id, via: "vector", text: `An invite to ${e.name || e.community_id}. Say "accept the invite to ${e.name || e.community_id}" to join.`, note: "invite" });
      }
    } else if (e.type === "removed") {
      void fileInInbox({ from: "", where: String(e.community_id), via: "vector", text: `The bot was removed from community ${e.community_id}.`, note: "removed" });
    }
  }
  if (!s.bridges.vector.xdcWake) return;
  for (const [topic, app] of joinedApps) {
    const frames = parseJson<{ type?: string; from?: string; text?: string; data?: string }[]>(await c.call("xdc_read", { topic, wait_ms: 0 }).catch(() => "[]"), []);
    const theirs = frames.filter((f) => !(f.type === "data" && f.from === me.vector));
    if (theirs.length) void wakeForApp(topic, JSON.stringify(theirs), app.chatId);
  }
}

async function pollOnce(id: BridgeId) {
  if (polling.has(id)) return;
  const c = links.client(`bridge:${id}`);
  if (!c) return;
  if (!allowed(desk().privacy, "bridges")) {
    stopBridge(id);
    return;
  }
  polling.add(id);
  try {
    const raw = await c.call("get_new_messages");
    const list = /^\s*\[/.test(raw) ? parseJson<(DiscordMsg & VectorMsg)[]>(raw, []) : [];
    for (const row of list) {
      const m = toIncoming(id, row);
      if (!m || (!m.text.trim() && !m.imageIndexes?.length)) continue;
      if (!m.text.trim()) m.text = "(sent a picture)";
      await receive(m, io(id));
    }
    if (id === "vector") await vectorEvents();
  } catch (e) {
    desk().log(`${id === "discord" ? "Discord" : "Vector"} bridge: ${e instanceof Error ? e.message : e}`);
  } finally {
    polling.delete(id);
  }
}

export async function startBridge(id: BridgeId) {
  stopBridge(id);
  await connectBridge(id);
  const c = links.client(`bridge:${id}`);
  if (!c) return;
  try {
    const who = parseJson<{ id?: string; npub?: string }>(await c.call(id === "discord" ? "my_user" : "status"), {});
    me[id] = id === "discord" ? who.id : who.npub;
  } catch {
    /* who the bot is helps spot replies to it; optional */
  }
  const every = Math.max(2, desk().bridges[id].pollSeconds) * 1000;
  timers.set(id, window.setInterval(() => void pollOnce(id), every));
  void pollOnce(id);
}

export function stopBridge(id: BridgeId) {
  const t = timers.get(id);
  if (t) window.clearInterval(t);
  timers.delete(id);
  disconnect(`bridge:${id}`);
}

/** Start whatever was switched on last time. */
export function resumeBridges() {
  for (const id of ["discord", "vector"] as BridgeId[]) if (desk().bridges[id].enabled) void startBridge(id);
}
