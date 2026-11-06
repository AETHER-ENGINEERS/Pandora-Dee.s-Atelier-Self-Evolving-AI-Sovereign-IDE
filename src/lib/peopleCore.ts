// The People layer (Pandora Dee Fae's design, 2026-11-06): the characters call people by their names, and by a
// label the household chooses when there's no name to use. Nothing in the code says "owner", "keyholder" or "the
// user". Four variables carry it, resolved before anything reaches a model:
//
//   {{PERSON_NAME}}    the person's own name (from their dossier, or the name they go by here); else PERSON_LABEL
//   {{PERSON_LABEL}}   how this person is known (their dossier's label, else the household's default: "Partner")
//   {{PEER_LABEL}}     anyone else, said neutrally ("the person you're talking with")
//   {{COMPANY_LABEL}}  the household or Free Company ("#OneMoment")
//
// A person's dossier is a note in the vault, People/<handle>.md: their name, the handles they're known by (an
// account name, an npub, a Discord id), their label, and whatever else is worth remembering about how you relate.

import { parseYaml, splitFrontmatter } from "./notes.ts";

export type RelVars = { PERSON_NAME: string; PERSON_LABEL: string; PEER_LABEL: string; COMPANY_LABEL: string };
export type RelLabels = { personLabel: string; peerLabel: string; companyLabel: string };
export const REL_DEFAULT: RelLabels = { personLabel: "Partner", peerLabel: "the person you're talking with", companyLabel: "#OneMoment" };

export type Dossier = { path: string; name: string; label: string; handles: string[] };

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(clean) : clean(v).split(/[,\n]/).map((x) => x.trim())).filter(Boolean);

/** A dossier from its note: frontmatter name, handles and label (PERSON_LABEL is understood too); the file's own name counts as a handle. */
export function dossierFrom(path: string, text: string): Dossier {
  const fm = parseYaml(splitFrontmatter(text).fm);
  const file = (path.split("/").pop() ?? path).replace(/\.(md|markdown)$/i, "");
  const name = clean(fm.name) || clean(fm.PERSON_NAME) || file;
  return { path, name, label: clean(fm.label) || clean(fm.PERSON_LABEL), handles: [...new Set([file, name, ...list(fm.handles), ...list(fm.handle)])] };
}

/** The dossier for a handle or name (any of them, any case), if there is one. */
export function findDossier(dossiers: Dossier[], ...keys: (string | undefined)[]): Dossier | undefined {
  const want = keys.map((k) => (k ?? "").trim().toLowerCase()).filter(Boolean);
  if (!want.length) return undefined;
  return dossiers.find((d) => d.handles.some((h) => want.includes(h.toLowerCase())));
}

/** The four variables for a turn with someone: their dossier first, then the name they go by, then the labels. */
export function resolveRel(labels: Partial<RelLabels>, dossier?: Dossier, knownName?: string): RelVars {
  const l = { ...REL_DEFAULT, ...Object.fromEntries(Object.entries(labels).filter(([, v]) => typeof v === "string" && v.trim())) } as RelLabels;
  const PERSON_LABEL = dossier?.label || l.personLabel;
  return { PERSON_NAME: dossier?.name || knownName?.trim() || PERSON_LABEL, PERSON_LABEL, PEER_LABEL: l.peerLabel, COMPANY_LABEL: l.companyLabel };
}

/** Put the variables into a text. Only these four are touched, so anything else in braces stays as written. */
export function fillRel(text: string, v: RelVars): string {
  return text.replace(/\{\{(PERSON_NAME|PERSON_LABEL|PEER_LABEL|COMPANY_LABEL)\}\}/g, (_, k: keyof RelVars) => v[k]);
}

/** A new dossier's note, ready to fill in. */
export function dossierTemplate(name: string, label = REL_DEFAULT.personLabel, handles: string[] = []): string {
  return `---
name: ${name}
label: ${label}
handles: ${[name, ...handles].filter(Boolean).join(", ")}
---

# ${name}

How we relate, kept so nobody has to be "the user". Not surveillance: a memory of who they are to us.

- **Where we talk:**
- **Shared projects:**
- **First met:**
- **Consent notes:** (what they're happy for us to remember, share or do)
- **Voice and style they like:**
`;
}
