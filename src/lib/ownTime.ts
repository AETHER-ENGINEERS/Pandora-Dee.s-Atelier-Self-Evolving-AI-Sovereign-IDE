// Time of her own (lib/ownTimeCore.ts has the rules) on the desktop: checked every minute by the page that holds the
// heart (lib/heart.ts), so it goes on in the keeper while the desktop is closed. One character at a time, privately,
// on her own AI, within her own budget (lib/meter.ts). What she did and thought becomes the next scene of her
// Storybook's "My own time".

import { desk } from "./store.ts";
import { holdsHeart } from "./heart.ts";
import { canStartOwnWork, usageLine } from "./meter.ts";
import { afterSession, itsHerTime, LOG_EMPTY, ownTimePrompt } from "./ownTimeCore.ts";
import { isRunning, privately } from "./agent.ts";
import { bookFor, bookHeader, parseScene, redactKeys, sceneText } from "./storybook.ts";
import { allKeyValues } from "./residentKeys.ts";

const OWN_BOOK = { id: "own-time", title: "My own time" };
let started = false;
let busy = false;

export function startOwnTime() {
  if (started) return;
  started = true;
  window.setInterval(() => void runOwnTime(), 60_000);
}

function addToBook(charId: string, text: string) {
  const s = desk();
  const book = bookFor(s.filesOf(charId), OWN_BOOK);
  const head = book.body || bookHeader(OWN_BOOK.title, "my own time, while the house was quiet", book.mark);
  s.writeFile(charId, book.path, head + text);
}

let busySince = 0;
let lastError = "";
/** For looking in: whether a session is under way, and the last thing that went wrong. */
export const ownTimeState = () => ({ busy, busySince, lastError });

/** One check: a character whose time it is gets it (exported, so it can be run now too). */
export async function runOwnTime() {
  // a session that never came back (a model that hung) doesn't hold the next one up for more than ten minutes
  if (busy && Date.now() - busySince > 10 * 60_000) busy = false;
  if (busy || !holdsHeart() || isRunning()) return;
  const s = desk();
  if (s.toddler || s.flood.shut || (s.accounts.length && !s.session)) return;
  // the last message anywhere: the Room, Hangout, Vector and Discord all post into the same list
  const lastActivity = s.messages[s.messages.length - 1]?.at ?? 0;
  for (const c of s.allCharacters()) {
    if (c.outside) continue;
    const log = s.ownLog?.[c.id] ?? LOG_EMPTY;
    if (!itsHerTime(s.charPrefs[c.id]?.ownTime, log, lastActivity, Date.now()).go) continue;
    if (!canStartOwnWork(c.id).ok) continue;
    busy = true;
    busySince = Date.now();
    try {
      const reply = await privately(c.id, ownTimePrompt(usageLine(c.id), s.filesOf(c.id)["CURIOSITY.md"] ?? ""), undefined, "own");
      const scene = parseScene(reply);
      const { log: next, looped } = afterSession(log, Date.now(), scene ? `${scene.room}\n${scene.inside}` : reply);
      desk().set({ ownLog: { ...desk().ownLog, [c.id]: next } });
      if (scene) addToBook(c.id, redactKeys(sceneText(new Date(), scene), allKeyValues()));
      if (looped) addToBook(c.id, "\n*Paused for six hours: three sessions in a row went round the same thought.*\n");
      if (scene) desk().log(`${c.short} spent some time of their own (Storybook: My own time).`);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn("own time:", e);
    } finally {
      busy = false;
    }
    return; // one at a time
  }
}
