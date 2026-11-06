// The People layer, wired to the desktop: the household's labels (Settings → Conversations → People) and the
// dossiers in the vault's People folder. See peopleCore.ts for the design.

import { desk } from "./store.ts";
import { useNotes } from "./notes.ts";
import { dossierFrom, fillRel, findDossier, resolveRel, type Dossier, type RelVars } from "./peopleCore.ts";

export const PEOPLE_DIR = "People";

/** Every dossier in the vault (People/…), from the notes already loaded. */
export function dossiers(): Dossier[] {
  const texts = useNotes.getState().texts;
  return Object.entries(texts)
    .filter(([p]) => p.toLowerCase().startsWith(`${PEOPLE_DIR.toLowerCase()}/`) && /\.(md|markdown)$/i.test(p))
    .map(([p, t]) => dossierFrom(p, t));
}

/** The variables for a turn with this person (a handle: account name, npub or Discord id; and the name they go by). */
export function relFor(handle?: string, name?: string): RelVars {
  return resolveRel(desk().people, findDossier(dossiers(), handle, name), name);
}

/** Text with the variables put in, for this person. */
export const withRel = (text: string, v: RelVars) => fillRel(text, v);
