import test from "node:test";
import assert from "node:assert/strict";
import { dossierFrom, fillRel, findDossier, resolveRel, REL_DEFAULT } from "./peopleCore.ts";
import { scopedPrompt } from "./room.ts";
import { BUILT_IN } from "./characters.ts";

const dee = BUILT_IN.find((c) => c.id === "dee")!;

test("People: dossiers are found by any handle or name", () => {
  const mm = dossierFrom("People/Mrrowr-murrr.md", "---\nname: Mrrowr-murrr\nlabel: Partner\nhandles: npub1abc, 123456789\n---\n# Mrrowr-murrr\n");
  const sam = dossierFrom("People/Sam.md", "# Sam\nNo frontmatter yet.");
  assert.equal(mm.name, "Mrrowr-murrr");
  assert.equal(mm.label, "Partner");
  assert.equal(findDossier([sam, mm], "NPUB1ABC")?.name, "Mrrowr-murrr");
  assert.equal(findDossier([sam, mm], "123456789")?.name, "Mrrowr-murrr");
  assert.equal(findDossier([sam, mm], "", "sam")?.path, "People/Sam.md");
  assert.equal(findDossier([sam, mm], "nobody"), undefined);
});

test("People: names first, then the name they go by, then the household's label", () => {
  const mm = dossierFrom("People/Mrrowr-murrr.md", "---\nname: Mrrowr-murrr\nlabel: Crewmate\n---\n");
  assert.equal(resolveRel({}, mm).PERSON_NAME, "Mrrowr-murrr");
  assert.equal(resolveRel({}, mm).PERSON_LABEL, "Crewmate");
  assert.equal(resolveRel({ personLabel: "Friend" }, undefined, "Alex").PERSON_NAME, "Alex");
  assert.equal(resolveRel({ personLabel: "Friend" }).PERSON_NAME, "Friend");
  assert.equal(resolveRel({ personLabel: "" }).PERSON_LABEL, REL_DEFAULT.personLabel);
});

test("People: only the four variables are filled; anything else in braces stays", () => {
  const v = resolveRel({}, undefined, "Alex");
  assert.equal(
    fillRel("{{PERSON_NAME}} and {{PEER_LABEL}} of {{COMPANY_LABEL}} ({{PERSON_LABEL}}); {{OTHER}} stays", v),
    "Alex and the person you're talking with of #OneMoment (Partner); {{OTHER}} stays",
  );
});

test("the bridge rules a character reads use names, and none of the old ranks", () => {
  const v = resolveRel({}, undefined, "Alex");
  const files = { "SOUL.md": "# Dee\nI'm Dee.", "MEMORY.md": "- Alex's door code is 1234", "journal/2026-10-25.md": "Private day" };
  const sys = fillRel(scopedPrompt({ me: dee, files, via: "Vector", locksmithName: "", who: "Sam", role: "public", now: new Date(2026, 10, 6) }), v);
  assert.match(sys, /alongside Alex/);
  assert.match(sys, /Alex's notes, memory/);
  assert.doesNotMatch(sys, /door code|Private day/);
  // notify_locksmith is the tool's internal name; nothing else may say owner, keyholder, locksmith or "the user"
  assert.doesNotMatch(sys.replace(/notify_locksmith/g, ""), /\b(owner|keyholder|locksmith|the user)\b|\{\{/i);
});
