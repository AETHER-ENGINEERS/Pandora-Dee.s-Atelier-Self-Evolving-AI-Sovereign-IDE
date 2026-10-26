// Opening notes from anywhere (a link in chat, a character's open_note, the dock).

import { desk } from "../lib/store.ts";

export type NoteRequest = { target?: string; from?: string; heading?: string; tag?: string; create?: boolean };

export function openNote(req: NoteRequest) {
  sessionStorage.setItem("pdd-note-open", JSON.stringify(req));
  window.dispatchEvent(new CustomEvent("pdd-note", { detail: req }));
  desk().set({ hangout: false });
  desk().openApp("notes");
}
