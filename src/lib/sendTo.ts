// "Send to": what you right-click (or two-finger tap) can go to Notes, the Room, the desktop's vault, or another of
// your PADS devices. Pictures are kept on the desktop's server first (Vault › Pictures), so every device can open them.

import type { MenuItem } from "../ui/ContextMenu.tsx";
import { desk } from "./store.ts";
import { cleanVaultPath, freePath, loadNotes, safeTitle, writeFile, writeNote } from "./notes.ts";
import { openNote } from "../ui/noteNav.ts";
import { deviceId, lastRoster, lastServers, padsApi } from "./pads.ts";

export type Sendable =
  | { kind: "text"; text: string; title?: string }
  | { kind: "link"; url: string; title?: string }
  /** src: where the picture is now; path: once it's kept in the vault */
  | { kind: "image"; src?: string; path?: string; title?: string };

const stamp = () => new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-");
const firstLine = (t: string) => safeTitle(t.split("\n").find((l) => l.trim()) ?? "").slice(0, 60);

/** Keep a picture on the desktop's server, in Vault › Pictures (or a folder under it). Returns its vault path. */
export async function keepPicture(blob: Blob, name: string, folder = "Pictures"): Promise<string> {
  const ext = blob.type === "image/jpeg" ? ".jpg" : blob.type === "image/webp" ? ".webp" : blob.type === "image/gif" ? ".gif" : ".png";
  const p = cleanVaultPath(`${folder}/${safeTitle(name) || "Picture"} ${stamp()}${ext}`);
  return writeFile(p, new Uint8Array(await blob.arrayBuffer()));
}

async function pathOf(item: Extract<Sendable, { kind: "image" }>): Promise<string> {
  if (item.path) return item.path;
  if (!item.src) throw new Error("There's no picture to send.");
  const blob = await (await fetch(item.src)).blob();
  item.path = await keepPicture(blob, item.title || "Picture");
  return item.path;
}

// The Room's typing bar picks up what was sent to it (now if it's open, or when it opens).
let roomDraft = "";
export function takeRoomDraft() {
  const t = roomDraft;
  roomDraft = "";
  return t;
}

const tell = (text: string) => desk().say(text);
const failed = (e: unknown) => tell(e instanceof Error ? e.message : String(e));

async function toNotes(item: Sendable) {
  await loadNotes();
  const body =
    item.kind === "text" ? item.text : item.kind === "link" ? `[${item.title || item.url}](${item.url})\n` : `![[${await pathOf(item)}]]\n`;
  const name = item.title || (item.kind === "text" ? firstLine(item.text) : item.kind === "link" ? item.url.replace(/^https?:\/\//, "") : "Picture");
  const p = await writeNote(freePath("Sent here", safeTitle(name).slice(0, 60) || "Sent here"), body);
  openNote({ target: p });
}

function toRoom(item: Sendable) {
  const text = item.kind === "text" ? item.text : item.kind === "link" ? item.url : "";
  roomDraft = roomDraft ? `${roomDraft}\n${text}` : text;
  desk().set({ hangout: false });
  desk().openApp("room");
  window.dispatchEvent(new CustomEvent("pdd-room-draft"));
}

async function toDevice(id: string, name: string, item: Sendable) {
  const out = item.kind === "image" ? { kind: "image" as const, path: await pathOf(item), title: item.title } : item;
  const r = await padsApi.send(id, out);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || `${name} couldn't be reached.`);
  tell(`Sent to ${name}. It shows up there in a few seconds.`);
}

/** The "Send to" lines for a context menu. */
export function sendToItems(item: Sendable): MenuItem[] {
  const out: MenuItem[] = [{ heading: "Send to" }];
  out.push({ label: "Notes (a new note)", run: () => void toNotes(item).catch(failed) });
  if (item.kind !== "image") out.push({ label: "Room (into the typing bar)", run: () => toRoom(item) });
  if (item.kind === "image" && !item.path)
    out.push({ label: "The desktop (Vault › Pictures)", run: () => void pathOf(item).then((p) => tell(`Kept on the desktop: ${p}`), failed) });
  // the other devices of this account that are in PADS right now (on this server or a linked one)
  const mine = deviceId();
  const myServer = lastServers().find((s) => s.me)?.id;
  for (const d of lastRoster().filter((d) => d.here && d.id !== mine))
    out.push({ label: d.name, hint: d.serverId && d.serverId !== myServer ? `on ${d.server}` : undefined, run: () => void toDevice(d.id, d.name, item).catch(failed) });
  // linked servers themselves: into their vault (a note, or the picture)
  for (const s of lastServers().filter((s) => !s.me && s.here))
    out.push({ label: `${s.name}'s vault`, hint: "server", run: () => void toDevice(`server:${s.id}`, s.name, item).catch(failed) });
  return out;
}
