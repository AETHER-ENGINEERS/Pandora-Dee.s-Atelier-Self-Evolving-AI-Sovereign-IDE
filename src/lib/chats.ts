// Saved chats. The open chat's messages live in the store (so the room works as before);
// every chat, the open one included, is also kept as a file in the vault under .pandora/chats.

import { desk, uid, useDesk, type ChatMeta } from "./store.ts";
import type { Message } from "./room.ts";
import { endOfChat, isRunning } from "./agent.ts";

const DIR = ".pandora/chats";
const fileOf = (id: string) => `${DIR}/${id}.json`;
const UNTITLED = "New chat";

async function writeChat(meta: ChatMeta, messages: Message[]) {
  await fetch(`/api/vault/file?path=${encodeURIComponent(fileOf(meta.id))}`, { method: "PUT", body: JSON.stringify({ meta, messages }) });
}

/** A chat's messages: the open one from memory, the others from their file. */
export async function loadChat(id: string): Promise<Message[]> {
  if (id === desk().chatId) return desk().messages;
  const res = await fetch(`/api/vault/file?path=${encodeURIComponent(fileOf(id))}`);
  if (!res.ok) return [];
  try {
    const j = (await res.json()) as { messages?: Message[] };
    return Array.isArray(j.messages) ? j.messages : [];
  } catch {
    return [];
  }
}

/** A title from the first thing someone said. */
export function titleFrom(messages: Message[]) {
  const first = messages.find((m) => m.kind === "human" && m.text.trim());
  if (!first) return UNTITLED;
  const line = first.text.trim().split("\n")[0].replace(/^\/\S+\s*/, "");
  return line.length > 48 ? `${line.slice(0, 46).trimEnd()}…` : line || UNTITLED;
}

/** The open chat, with its title and count as they are right now. */
export function currentChat(): ChatMeta {
  const s = desk();
  const meta = s.chats.find((c) => c.id === s.chatId) ?? { id: s.chatId, title: UNTITLED, created: Date.now(), updated: Date.now(), count: 0 };
  return {
    ...meta,
    title: meta.title === UNTITLED ? titleFrom(s.messages) : meta.title,
    count: s.messages.length,
    updated: s.messages[s.messages.length - 1]?.at ?? meta.updated,
  };
}

function patchMeta(id: string, patch: Partial<ChatMeta>) {
  const s = desk();
  const has = s.chats.some((c) => c.id === id);
  const base = has ? s.chats : [...s.chats, currentChat()];
  s.set({ chats: base.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
}

export function setSummary(summary: string, upTo: number) {
  patchMeta(desk().chatId, { summary, summaryUpTo: upTo });
}

/** Save the open chat now. */
export async function saveOpenChat() {
  const s = desk();
  const next = currentChat();
  patchMeta(next.id, next);
  await writeChat(next, s.messages);
}

function busyReason() {
  return isRunning() ? "The characters are still answering. Wait for them, or press Stop first." : "";
}

/** Start a fresh chat. The one being left is saved (and journaled, if that's on). */
export async function newChat(title = ""): Promise<string> {
  const why = busyReason();
  if (why) return why;
  const s = desk();
  const leaving = s.messages;
  if (leaving.length) await saveOpenChat();
  const id = uid();
  const meta: ChatMeta = { id, title: title.trim() || UNTITLED, created: Date.now(), updated: Date.now(), count: 0 };
  desk().set({ chats: [...desk().chats.filter((c) => c.count > 0 || c.id !== s.chatId || leaving.length), meta], chatId: id, messages: [] });
  if (leaving.length) endOfChat(leaving);
  return "";
}

export async function switchChat(id: string): Promise<string> {
  const s = desk();
  if (id === s.chatId) return "";
  const why = busyReason();
  if (why) return why;
  const leaving = s.messages;
  if (leaving.length) await saveOpenChat();
  const messages = await loadChat(id);
  // An empty chat that was never used isn't worth keeping.
  const keep = desk().chats.filter((c) => c.id !== s.chatId || leaving.length);
  desk().set({ chatId: id, messages, chats: keep });
  if (leaving.length) endOfChat(leaving);
  return "";
}

export function renameChat(id: string, title: string) {
  const t = title.trim();
  if (!t) return;
  patchMeta(id, { title: t });
  if (id === desk().chatId) void saveOpenChat();
  else
    void loadChat(id).then((messages) => {
      const meta = desk().chats.find((c) => c.id === id);
      if (meta) void writeChat(meta, messages);
    });
}

export async function deleteChat(id: string): Promise<string> {
  const s = desk();
  if (id === s.chatId) {
    const why = busyReason();
    if (why) return why;
    const other = [...s.chats].filter((c) => c.id !== id).sort((a, b) => b.updated - a.updated)[0];
    if (other) {
      const messages = await loadChat(other.id);
      desk().set({ chatId: other.id, messages });
    } else {
      const fresh = uid();
      desk().set({ chatId: fresh, messages: [], chats: [...desk().chats, { id: fresh, title: UNTITLED, created: Date.now(), updated: Date.now(), count: 0 }] });
    }
  }
  desk().set({ chats: desk().chats.filter((c) => c.id !== id) });
  await fetch(`/api/vault/file?path=${encodeURIComponent(fileOf(id))}`, { method: "DELETE" });
  return "";
}

/** Chats, newest first. */
export function chatList(): ChatMeta[] {
  const s = desk();
  const open = currentChat();
  return [...s.chats.filter((c) => c.id !== s.chatId), open].sort((a, b) => b.updated - a.updated);
}

/** Keep the open chat's file and title up to date as it changes. */
let started = false;
export function startChatSync() {
  if (started) return;
  started = true;
  // The first chat starts as "room"; give it its own id so browsers sharing one desktop server don't share a file.
  if (desk().chatId === "room") {
    const id = uid();
    desk().set({ chatId: id, chats: desk().chats.map((c) => (c.id === "room" ? { ...c, id } : c)) });
  }
  if (!desk().chats.some((c) => c.id === desk().chatId)) patchMeta(desk().chatId, currentChat());
  let timer = 0;
  useDesk.subscribe((s, prev) => {
    if (s.messages === prev.messages || s.chatId !== prev.chatId) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveOpenChat().catch(() => undefined), 2000);
  });
}
