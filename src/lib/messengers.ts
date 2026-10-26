// The vector, discord, discord_history and notify_locksmith tools, with Classic's role rules:
// the locksmith gets everything; admins get messenger powers; the public can talk in their own chat.

import { desk, uid, type BridgeId, type InboxItem } from "./store.ts";
import { links } from "./connections.ts";
import { parseJson } from "./mcp.ts";
import type { Scope, TurnCtx } from "./tools.ts";

const str = (v: unknown, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
const clip = (s: string, n = 12000) => (s.length > n ? `${s.slice(0, n)}\n[cut: ${s.length - n} more characters]` : s);

export const VECTOR_ACTIONS: Record<Exclude<Scope, "locksmith">, Set<string>> = {
  public: new Set(["send", "reply", "react", "typing", "read", "profile", "xdc_apps", "xdc_join", "xdc_read", "xdc_send", "xdc_leave", "edit", "delete"]),
  admin: new Set(["send", "reply", "react", "typing", "read", "profile", "xdc_apps", "xdc_join", "xdc_read", "xdc_send", "xdc_leave", "edit", "delete", "chats", "communities", "join", "invites", "accept_invite", "leave", "invite", "invite_link", "members", "kick", "ban", "block", "sync"]),
};

export const DISCORD_ACTIONS: Record<Exclude<Scope, "locksmith">, Set<string>> = {
  public: new Set(["send", "reply", "react", "typing", "read", "profile", "edit", "delete"]),
  admin: new Set(["send", "reply", "react", "typing", "read", "profile", "edit", "delete", "guilds", "channels", "leave", "kick", "ban", "unban", "members"]),
};

function client(id: BridgeId) {
  const c = links.client(`bridge:${id}`);
  if (!c) throw new Error(`${id === "vector" ? "Vector" : "Discord"} isn't connected (Connections → ${id === "vector" ? "Vector" : "Discord"}).`);
  return c;
}

function bytesToB64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToBytes(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Save bytes into the files folder on disk; returns the path a character can refer to. */
export async function saveToVault(path: string, bytes: Uint8Array) {
  const res = await fetch(`/api/vault/file?path=${encodeURIComponent(path)}`, { method: "PUT", body: bytes as Uint8Array<ArrayBuffer> });
  if (!res.ok) throw new Error(`Couldn't save ${path}.`);
  return `/vault/${path}`;
}

/** Read a file a character points at: "/vault/…" on disk, or one of their own files. */
export async function readAnyFile(charId: string, path: string): Promise<{ name: string; bytes: Uint8Array }> {
  const name = path.split("/").pop() || "file";
  if (path.startsWith("/vault/")) {
    const res = await fetch(`/api/vault/file?path=${encodeURIComponent(path.slice(7))}`);
    if (!res.ok) throw new Error(`There's no file at ${path}.`);
    return { name, bytes: new Uint8Array(await res.arrayBuffer()) };
  }
  const text = desk().filesOf(charId)[path.replace(/^\/+/, "")];
  if (text === undefined) throw new Error(`There's no file at ${path}.`);
  return { name, bytes: new TextEncoder().encode(text) };
}

// ---------- the secretary ----------

export async function fileInInbox(item: Omit<InboxItem, "id" | "at">) {
  const s = desk();
  const row: InboxItem = { ...item, id: uid(), at: Date.now() };
  s.set({ inbox: [row, ...s.inbox].slice(0, 500) });
  s.say(`${item.urgent ? "⚡ " : ""}Message for you${item.from ? ` from ${item.from}` : ""}: ${item.text.slice(0, 120)}`);
  if (item.via === "desk") return;
  const b = s.bridges[item.via];
  if ((b.notify === "now" || item.urgent) && b.owner) {
    try {
      const c = client(item.via);
      await c.call("send_message", item.via === "discord" ? { user_id: b.owner, content: `${item.urgent ? "⚡ " : ""}${item.text}` } : { chat_id: b.owner, content: `${item.urgent ? "⚡ " : ""}${item.text}` });
    } catch {
      /* the inbox still has it */
    }
  }
}

export async function notifyLocksmith(a: Record<string, unknown>, ctx: TurnCtx) {
  const msg = str(a.message ?? a.text).trim();
  if (!msg) throw new Error("notify_locksmith needs a message.");
  const via = ctx.source === "desk" ? "desk" : ctx.source;
  await fileInInbox({ from: ctx.senderName || str(a.from), where: ctx.chatId ? (ctx.isGroup ? `channel ${ctx.chatId}` : "a DM") : "the desktop", via, text: msg, urgent: Boolean(a.urgent), note: "passed on" });
  return "Passed on to your locksmith.";
}

// ---------- vector ----------

export async function vectorTool(a: Record<string, unknown>, ctx: TurnCtx): Promise<string> {
  const act = str(a.action).toLowerCase();
  const role = ctx.scope;
  if (role !== "locksmith" && !VECTOR_ACTIONS[role].has(act)) throw new Error(`The ${act} action isn't available in this chat.`);
  const c = client("vector");
  const call = async (name: string, args: Record<string, unknown> = {}) => c.call(name, args);
  const here = ctx.source === "vector" ? ctx.chatId : undefined;
  const target = () => {
    const raw = str(a.to ?? a.chat_id ?? a.chat ?? "here");
    const t = raw === "here" ? here : (raw === "locksmith" || raw === "owner") ? desk().bridges.vector.owner : raw;
    if (!t) throw new Error('Say who to send to: an npub, a channel id, "locksmith", or "here".');
    if (role === "public" && t !== here) throw new Error("In this chat you can only write to this chat.");
    return t;
  };
  switch (act) {
    case "send":
    case "reply": {
      const to = target();
      const r = parseJson<{ message_id?: string }>(await call("send_message", { chat_id: to, content: str(a.text ?? a.content), ...(a.message_id || a.reply_to ? { replied_to: str(a.message_id ?? a.reply_to) } : {}) }), {});
      return `Sent (message id ${r.message_id ?? "?"}).`;
    }
    case "react":
      await call("react", { chat_id: target(), message_id: str(a.message_id), emoji: str(a.emoji, "👍") });
      return `Reacted ${str(a.emoji, "👍")}.`;
    case "typing":
      await call("send_typing", { chat_id: target() });
      return "typing…";
    case "edit":
      await call("edit_message", { chat_id: target(), message_id: str(a.message_id), content: str(a.text) });
      return "Edited.";
    case "delete":
      await call("delete_message", { chat_id: target(), message_id: str(a.message_id) });
      return "Deleted.";
    case "send_file": {
      if (role !== "locksmith") throw new Error("Only your locksmith can have files sent.");
      const to = target();
      const f = await readAnyFile(ctx.charId, str(a.path));
      if (f.bytes.length > 25 * 1048576) throw new Error("Files over 25 MB aren't sent.");
      await call("send_file_bytes", { chat_id: to, name: f.name, base64: bytesToB64(f.bytes) });
      return `Sent ${f.name}.`;
    }
    case "download": {
      if (role !== "locksmith") throw new Error("Only your locksmith can have files downloaded.");
      const d = parseJson<{ base64?: string; name?: string; size?: number }>(await call("download_attachment", { message_id: str(a.message_id), index: Number(a.index) || 0 }), {});
      if (!d.base64) throw new Error("The download failed.");
      const day = new Date().toISOString().slice(0, 10);
      const p = await saveToVault(str(a.path) || `attachments/vector/${day}/${str(d.name, "file").replace(/[^\w.\- ]+/g, "_")}`, b64ToBytes(d.base64));
      return `Saved ${d.name} to ${p}.`;
    }
    case "read": {
      const msgs = parseJson<{ id: string; at: number; mine?: boolean; npub?: string; content?: string; attachments?: { name: string }[] }[]>(
        await call("get_messages", { chat_id: target(), limit: Math.min(Number(a.limit) || 20, role === "public" ? 30 : 200) }),
        [],
      );
      return msgs.length
        ? msgs.map((m) => `${new Date(m.at).toLocaleString()} ${m.mine ? "you" : m.npub?.slice(0, 14) ?? "?"} [${m.id}]: ${m.content ?? ""}${(m.attachments ?? []).map((x, i) => ` [attachment ${i}: ${x.name}]`).join("")}`).join("\n")
        : "No messages.";
    }
    case "chats":
      return clip(await call("list_chats"));
    case "profile":
      return clip(await call("load_profile", { npub: str(a.npub ?? a.to) }).catch(() => call("get_profile", { npub: str(a.npub ?? a.to) })));
    case "set_profile":
      return await call("update_profile", { name: str(a.name), about: str(a.about), avatar: str(a.avatar), banner: str(a.banner) });
    case "communities":
      return clip(await call("list_communities").catch(() => call("get_communities")));
    case "join":
      return await call("join_community", { invite_url: str(a.invite_url ?? a.url) });
    case "invites":
      return await call("list_pending_invites");
    case "accept_invite":
      return await call("accept_pending_invite", { community_id: str(a.community_id) });
    case "leave":
      return await call("leave_community", { community_id: str(a.community_id) });
    case "invite":
      return await call("send_private_invite", { community_id: str(a.community_id), npub: str(a.npub ?? a.to) });
    case "invite_link":
      return await call("create_public_invite", { community_id: str(a.community_id) });
    case "members":
      return clip(await call("get_community_members", { community_id: str(a.community_id) }));
    case "kick":
      return await call("kick_community_member", { community_id: str(a.community_id), npub: str(a.npub ?? a.to) });
    case "ban":
      return await call("ban_community_member", { community_id: str(a.community_id), npub: str(a.npub ?? a.to) });
    case "block":
      return await call("block_user", { npub: str(a.npub ?? a.to) });
    case "sync":
      return await call("sync_communities", {});
    case "create_community":
      return await call("create_community", { name: str(a.name, "New community") });
    case "xdc_apps":
      return await call("xdc_apps", { chat_id: target() });
    case "xdc_join": {
      const r = parseJson<{ topic?: string; chat_id?: string; self_addr?: string }>(await call("xdc_join", { message_id: str(a.message_id) }), {});
      if (!r.topic) throw new Error("Couldn't join that Mini App.");
      if (role === "public" && r.chat_id !== here) {
        await call("xdc_leave", { topic: r.topic }).catch(() => "");
        throw new Error("That app is in another chat.");
      }
      joinedApps.set(r.topic, { chatId: r.chat_id ?? "", role, charId: ctx.charId });
      return `Joined the Mini App (topic ${r.topic}). Your address there is ${r.self_addr}. New moves wake you; read them with xdc_read and answer with xdc_send frame=<text in the app's format>.`;
    }
    case "xdc_read":
      return (await call("xdc_read", { topic: str(a.topic), wait_ms: Math.min(Number(a.wait_ms) || 0, 20000) })) || "[]";
    case "xdc_send": {
      const t = str(a.topic);
      if (role === "public" && joinedApps.get(t)?.chatId !== here) throw new Error("That app isn't in this chat.");
      return await call("xdc_send", { topic: t, text: typeof a.frame === "object" ? JSON.stringify(a.frame) : str(a.frame ?? a.text) });
    }
    case "xdc_leave":
      joinedApps.delete(str(a.topic));
      return await call("xdc_leave", { topic: str(a.topic) });
    case "raw":
      if (role !== "locksmith") throw new Error("Only your locksmith can do that.");
      return clip(await call(str(a.tool), (a.args as Record<string, unknown>) ?? {}));
    default:
      throw new Error(`Unknown Vector action "${act}".`);
  }
}

/** Mini Apps the characters joined on Vector, so new moves can wake them. */
export const joinedApps = new Map<string, { chatId: string; role: Scope; charId: string }>();

// ---------- discord ----------

export async function discordTool(a: Record<string, unknown>, ctx: TurnCtx): Promise<string> {
  const act = str(a.action).toLowerCase();
  const role = ctx.scope;
  if (role !== "locksmith" && !DISCORD_ACTIONS[role].has(act)) throw new Error(`The ${act} action isn't available in this chat.`);
  const c = client("discord");
  const call = async (name: string, args: Record<string, unknown> = {}) => c.call(name, args);
  const here = ctx.source === "discord" ? ctx.chatId : undefined;
  const where = (): Record<string, string> => {
    const to = str(a.to ?? a.chat_id ?? "here");
    if (to === "here" || to === here) {
      if (!here) throw new Error('Say where: a channel id, a user id (for a DM), "locksmith", or "here".');
      return { chat_id: here };
    }
    if (role === "public") throw new Error("In this chat you can only write to this chat.");
    if (to === "locksmith" || to === "owner") return { user_id: desk().bridges.discord.owner };
    if (a.user_id) return { user_id: str(a.user_id) };
    return { chat_id: to };
  };
  const guild = () => {
    const g = str(a.guild_id);
    if (!g) throw new Error("This needs a guild_id (list them with action=guilds).");
    return g;
  };
  switch (act) {
    case "send":
    case "reply": {
      const r = parseJson<{ id?: string; message_id?: string }>(await call("send_message", { ...where(), content: str(a.text ?? a.content), ...(a.message_id || a.reply_to ? { replied_to: str(a.message_id ?? a.reply_to) } : {}) }), {});
      return `Sent (message id ${r.id ?? r.message_id ?? "?"}).`;
    }
    case "react":
      await call("react", { ...where(), message_id: str(a.message_id), emoji: str(a.emoji, "👍") });
      return `Reacted ${str(a.emoji, "👍")}.`;
    case "typing":
      await call("send_typing", where());
      return "typing…";
    case "edit":
      await call("edit_message", { ...where(), message_id: str(a.message_id), content: str(a.text) });
      return "Edited.";
    case "delete":
      await call("delete_message", { ...where(), message_id: str(a.message_id) });
      return "Deleted.";
    case "send_file": {
      if (role !== "locksmith") throw new Error("Only your locksmith can have files sent.");
      const f = await readAnyFile(ctx.charId, str(a.path));
      await call("send_file_bytes", { ...where(), name: f.name, base64: bytesToB64(f.bytes) });
      return `Sent ${f.name}.`;
    }
    case "download": {
      if (role !== "locksmith") throw new Error("Only your locksmith can have files downloaded.");
      const d = parseJson<{ base64?: string; name?: string }>(await call("download_attachment", { message_id: str(a.message_id), index: Number(a.index) || 0 }), {});
      if (!d.base64) throw new Error("The download failed.");
      const day = new Date().toISOString().slice(0, 10);
      const p = await saveToVault(str(a.path) || `attachments/discord/${day}/${str(d.name, "file").replace(/[^\w.\- ]+/g, "_")}`, b64ToBytes(d.base64));
      return `Saved ${d.name} to ${p}.`;
    }
    case "read":
      return clip(await call("get_messages", { ...where(), limit: Math.min(Number(a.limit) || 20, role === "public" ? 30 : 100) }));
    case "profile":
      return clip(await call("get_user", { user_id: str(a.user_id ?? a.to) }));
    case "guilds":
      return clip(await call("list_guilds"));
    case "channels":
      return clip(await call("list_channels", { guild_id: guild() }));
    case "members":
      return clip(await call("list_members", { guild_id: guild(), limit: Math.min(Number(a.limit) || 50, 200) }));
    case "leave":
      return await call("leave_guild", { guild_id: guild() });
    case "kick":
      return await call("kick", { guild_id: guild(), user_id: str(a.user_id) });
    case "ban":
      return await call("ban", { guild_id: guild(), user_id: str(a.user_id) });
    case "unban":
      return await call("unban", { guild_id: guild(), user_id: str(a.user_id) });
    default:
      throw new Error(`Unknown Discord action "${act}".`);
  }
}

/** The Discord archive, searched without model cost. The public only sees channels everyone can see. */
export async function discordHistory(a: Record<string, unknown>, ctx: TurnCtx): Promise<string> {
  const c = client("discord");
  const args: Record<string, unknown> = { ...a, action: str(a.action, "search") };
  args.scope = ctx.scope === "locksmith" ? str(a.scope, "all") : "public";
  try {
    return clip(await c.call("archive_query", args));
  } catch (e) {
    if (args.action === "search") return clip(await c.call("archive_search", { query: str(a.query), chat_id: a.channel, limit: a.limit }));
    throw e;
  }
}
