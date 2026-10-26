// Keyboard shortcuts: one list of actions, default keys, and the person's own bindings.
// "Mod" is Ctrl on Windows, Linux and Android, and ⌘ on Apple devices.

import { APPS, desk, type AppId } from "../lib/store.ts";
import { letThemTalk, stopAll } from "../lib/agent.ts";
import { stopSpeaking } from "../lib/voice.ts";

export type KeyLike = { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

export type Action = { id: string; label: string; group: string; keys: string; run: () => void };

const apple = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

function frontApp(): AppId | undefined {
  const s = desk();
  return APPS.filter((a) => s.wins[a.id].open && !s.wins[a.id].min).sort((a, b) => s.wins[b.id].z - s.wins[a.id].z)[0]?.id;
}

function focusChat() {
  const s = desk();
  if (s.hangout) {
    document.querySelector<HTMLInputElement>(".hang-chat input")?.focus();
    return;
  }
  s.openApp("room");
  setTimeout(() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus(), 30);
}

function cycleCharacter(step: number) {
  const s = desk();
  const room = s.roomCharacters();
  if (!room.length) return;
  const i = room.findIndex((c) => c.id === s.focus);
  const next = room[(i + step + room.length) % room.length];
  s.setFocus(next.id);
  s.say(`${next.short} answers by default now.`);
}

function cycleWindow() {
  const s = desk();
  const open = APPS.filter((a) => s.wins[a.id].open).sort((a, b) => s.wins[a.id].z - s.wins[b.id].z);
  if (open.length) s.openApp(open[0].id);
}

const openApp = (id: AppId) => () => {
  desk().set({ hangout: false, classic: false });
  desk().openApp(id);
};

export const ACTIONS: Action[] = [
  { id: "hangout", label: "Hangout on or off", group: "Views", keys: "Mod+Shift+H", run: () => desk().set({ hangout: !desk().hangout, classic: false }) },
  { id: "classic", label: "Classic on or off", group: "Views", keys: "Mod+Shift+K", run: () => desk().set({ classic: !desk().classic, hangout: false }) },
  { id: "onDesktop", label: "Characters on the desktop", group: "Views", keys: "Alt+Shift+D", run: () => desk().set({ hang: { ...desk().hang, onDesktop: !desk().hang.onDesktop } }) },
  { id: "talk", label: "Type to the room", group: "Talking", keys: "Mod+/", run: focusChat },
  { id: "letTalk", label: "Let them talk", group: "Talking", keys: "Mod+Shift+L", run: () => void letThemTalk() },
  { id: "stop", label: "Stop talking", group: "Talking", keys: "Mod+.", run: () => (stopAll(), stopSpeaking()) },
  { id: "voice", label: "Voice on or off", group: "Talking", keys: "Mod+Shift+M", run: () => (stopSpeaking(), desk().set({ voice: { ...desk().voice, on: !desk().voice.on } })) },
  { id: "nextChar", label: "Next character answers", group: "Talking", keys: "Alt+Shift+ArrowRight", run: () => cycleCharacter(1) },
  { id: "prevChar", label: "Previous character answers", group: "Talking", keys: "Alt+Shift+ArrowLeft", run: () => cycleCharacter(-1) },
  { id: "room", label: "Room", group: "Open", keys: "Alt+Shift+1", run: openApp("room") },
  { id: "presence", label: "Presence", group: "Open", keys: "Alt+Shift+2", run: openApp("presence") },
  { id: "cast", label: "Characters", group: "Open", keys: "Alt+Shift+3", run: openApp("cast") },
  { id: "games", label: "Games & Apps", group: "Open", keys: "Mod+Shift+G", run: openApp("games") },
  { id: "journal", label: "Journal", group: "Open", keys: "Mod+Shift+J", run: openApp("journal") },
  { id: "files", label: "Files", group: "Open", keys: "Alt+Shift+F", run: openApp("files") },
  { id: "terminal", label: "Terminal", group: "Open", keys: "Alt+Shift+T", run: openApp("terminal") },
  { id: "studio", label: "XDC Studio", group: "Open", keys: "Alt+Shift+X", run: openApp("studio") },
  { id: "settings", label: "Settings", group: "Open", keys: "Mod+,", run: openApp("settings") },
  { id: "nextWindow", label: "Next window", group: "Windows", keys: "Alt+`", run: cycleWindow },
  {
    id: "closeWindow",
    label: "Close the front window",
    group: "Windows",
    keys: "Alt+Shift+W",
    run: () => {
      const id = frontApp();
      if (id) desk().closeApp(id);
    },
  },
  {
    id: "minWindow",
    label: "Minimize the front window",
    group: "Windows",
    keys: "Alt+Shift+M",
    run: () => {
      const id = frontApp();
      if (id) desk().minimizeApp(id);
    },
  },
  {
    id: "maxWindow",
    label: "Maximize or restore the front window",
    group: "Windows",
    keys: "Alt+Shift+ArrowUp",
    run: () => {
      const id = frontApp();
      if (id) desk().toggleMax(id);
    },
  },
  { id: "tile", label: "Tile windows", group: "Windows", keys: "Alt+Shift+Y", run: () => desk().arrange("tile") },
  { id: "lock", label: "Lock the desktop", group: "Windows", keys: "Alt+Shift+L", run: () => desk().accounts.length && desk().lock() },
];

/** "Mod+Shift+H" from a key event. */
export function comboOf(e: KeyLike) {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.key;
  if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (e.code === "Backquote") key = "`";
  else if (e.code === "Slash") key = "/";
  else if (e.code === "Period") key = ".";
  else if (e.code === "Comma") key = ",";
  else if (key.length === 1) key = key.toUpperCase();
  if (["Control", "Meta", "Alt", "Shift"].includes(key)) return parts.join("+");
  return [...parts, key].join("+");
}

/** How a combo reads on this device. */
export function showCombo(combo: string) {
  return combo
    .split("+")
    .map((p) => (p === "Mod" ? (apple ? "⌘" : "Ctrl") : p === "Alt" && apple ? "⌥" : p === "Shift" && apple ? "⇧" : p.replace("Arrow", "")))
    .join(apple ? "" : "+");
}

export function bindingOf(a: Action) {
  return desk().keys[a.id] ?? a.keys;
}

/** Run the action bound to this key, if any. Returns true when something ran. */
export function handleShortcut(e: KeyLike) {
  if (!(e.ctrlKey || e.metaKey || e.altKey)) return false;
  const combo = comboOf(e);
  const action = ACTIONS.find((a) => bindingOf(a) === combo);
  if (!action) return false;
  action.run();
  return true;
}
