// What the desktop offers the rest of the app (its icons, opening Settings, loading a character backup).
// Kept apart from Desktop.tsx, so that file exports only components and React can update it in place.
import { useEffect, useState, type ReactNode } from "react";
import { AudioWaveform, BookOpen, Cable, Code2, FolderOpen, Gamepad2, Globe, HelpCircle, KeyRound, MessageCircleHeart, MessagesSquare, Music2, NotebookPen, Palette, Settings as SettingsIcon, ShieldAlert, SquareTerminal, Users, Video } from "lucide-react";
import { desk, type AppId } from "../lib/store.ts";
import { parseBackup } from "../lib/backup.ts";

export const ICONS: Record<AppId, (size: number) => ReactNode> = {
  room: (s) => <MessagesSquare size={s} />,
  presence: (s) => <Video size={s} />,
  cast: (s) => <Users size={s} />,
  files: (s) => <FolderOpen size={s} />,
  notes: (s) => <NotebookPen size={s} />,
  music: (s) => <Music2 size={s} />,
  visualizer: (s) => <AudioWaveform size={s} />,
  create: (s) => <Palette size={s} />,
  browser: (s) => <Globe size={s} />,
  vector: (s) => <MessageCircleHeart size={s} />,
  journal: (s) => <BookOpen size={s} />,
  terminal: (s) => <SquareTerminal size={s} />,
  games: (s) => <Gamepad2 size={s} />,
  connections: (s) => <Cable size={s} />,
  sentry: (s) => <ShieldAlert size={s} />,
  keys: (s) => <KeyRound size={s} />,
  settings: (s) => <SettingsIcon size={s} />,
  welcome: (s) => <HelpCircle size={s} />,
  studio: (s) => <Code2 size={s} />,
};

export function useWide() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

export function openSettings(section?: string) {
  if (section) sessionStorage.setItem("pdd-settings-section", section);
  window.dispatchEvent(new CustomEvent("pdd-settings", { detail: section }));
  desk().openApp("settings");
}

export function loadBackupFile(file: File) {
  file
    .text()
    .then((raw) => {
      const s = desk();
      const parsed = parseBackup(raw, s.allCharacters().map((c) => c.id));
      if (!parsed.ok) return s.say(parsed.reason);
      if (parsed.character.shelf === "adult" && !s.adultOpen) {
        s.addCharacter(parsed.character);
        return s.say(`${parsed.character.name} was added to the adult shelf. Unlock it in Settings → Adult shelf to see them.`);
      }
      s.addCharacter(parsed.character);
      const err = s.join(parsed.character.id);
      s.say(err ? `${parsed.note} ${err}` : parsed.note);
    })
    .catch(() => desk().say("Couldn't read that file."));
}
