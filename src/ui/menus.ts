// Right-click menus that appear in more than one place.

import { desk } from "../lib/store.ts";
import type { Message } from "../lib/room.ts";
import { download, makeBackup } from "../lib/backup.ts";
import { addToMemory } from "../lib/tools.ts";
import { speak } from "../lib/voice.ts";
import { voiceFor } from "../lib/prefs.ts";
import { letThemTalk, retry } from "../lib/agent.ts";
import type { MenuItem } from "./ContextMenu.tsx";

function focusComposer() {
  const s = desk();
  if (s.hangout) return document.querySelector<HTMLInputElement>(".hang-chat input")?.focus();
  s.openApp("room");
  setTimeout(() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus(), 30);
}

function openProfile(id: string) {
  sessionStorage.setItem("pdd-cast-view", id);
  window.dispatchEvent(new CustomEvent("pdd-cast", { detail: id }));
  desk().set({ hangout: false });
  desk().openApp("cast");
}

function openFiles(id: string) {
  sessionStorage.setItem("pdd-files-char", id);
  window.dispatchEvent(new CustomEvent("pdd-files", { detail: { char: id } }));
  desk().set({ hangout: false });
  desk().openApp("files");
}

/** A character, wherever they appear: chips, tiles, cards, the scene. */
export function characterMenu(id: string): MenuItem[] {
  const s = desk();
  const c = s.character(id);
  if (!c) return [];
  const inRoom = s.members.includes(id);
  const look = s.charPrefs[id]?.look ?? "talking";
  return [
    { heading: c.name },
    ...(inRoom
      ? [
          { label: `Talk to ${c.short}`, checked: s.focus === id, run: () => (s.setFocus(id), focusComposer()) },
          { label: "Let them talk", run: () => void letThemTalk() },
        ]
      : [{ label: `Invite ${c.short} to the room`, run: () => { const err = s.join(id); if (err) s.say(err); } }]),
    { sep: true },
    { label: "Profile, AI and voice…", run: () => openProfile(id) },
    { label: "Files", run: () => openFiles(id) },
    { label: "Journal", run: () => (s.set({ hangout: false }), s.openApp("journal")) },
    {
      label: `Hear ${c.short}`,
      run: () => {
        const v = voiceFor(id);
        speak(id, c.greeting, { ...v.prefs, on: true }, v.shift);
      },
    },
    { sep: true },
    { label: "Talking", checked: look === "talking", run: () => s.setCharPrefs(id, { look: "talking" }) },
    { label: "Chibi", checked: look === "chibi", run: () => s.setCharPrefs(id, { look: "chibi" }) },
    { label: "Photo", checked: look === "photo", run: () => s.setCharPrefs(id, { look: "photo" }) },
    { sep: true },
    { label: "Save their backup", run: () => download(`${c.id}-backup.json`, makeBackup(c, s.filesOf(id))) },
    ...(inRoom ? [{ label: "Step out of the room", danger: true, run: () => s.leave(id) } as MenuItem] : []),
  ];
}

/** A line in the conversation. */
export function messageMenu(m: Message, extra: { edit?: () => void; retry?: boolean } = {}): MenuItem[] {
  const s = desk();
  const c = m.kind === "character" ? s.character(m.who) : undefined;
  const rate = (r: 1 | -1) => s.patchMessage(m.id, { rating: m.rating === r ? undefined : r });
  return [
    { label: "Copy", run: () => void navigator.clipboard?.writeText(m.text) },
    ...(m.kind === "human" && m.source === "desk" && extra.edit ? [{ label: "Edit and send again", run: extra.edit } as MenuItem] : []),
    ...(c && m.text
      ? ([
          { label: "Good reply", checked: m.rating === 1, run: () => rate(1) },
          { label: "Poor reply", checked: m.rating === -1, run: () => rate(-1) },
          ...(extra.retry ? [{ label: "Retry", run: () => void retry().then((why) => why && s.notice(why)) }] : []),
          { sep: true },
        ] as MenuItem[])
      : []),
    ...(c
      ? ([
          {
            label: "Read it aloud",
            run: () => {
              const v = voiceFor(c.id);
              speak(c.id, m.text, { ...v.prefs, on: true }, v.shift);
            },
          },
          {
            label: `Keep in ${c.short}'s memory`,
            run: () => {
              addToMemory(c.id, m.text.replace(/\n+/g, " ").slice(0, 300), "Notes to self");
              s.say(`Kept in ${c.short}'s memory.`);
            },
          },
          { label: `Reply to ${c.short}`, run: () => (s.setFocus(c.id), focusComposer()) },
          { sep: true },
          ...characterMenu(c.id).slice(1, 4),
        ] as MenuItem[])
      : []),
    { sep: true },
    { label: "Delete this line", danger: true, run: () => s.removeMessage(m.id) },
  ];
}
