import test from "node:test";
import assert from "node:assert/strict";
import { judge, mayWake, LARGE } from "./flood.ts";
import { loopCheck, mentioned, responders, similarity, streakOf, tidyReply, transcriptFor, type Message } from "./room.ts";
import { run } from "./shell.ts";
import { allowed, maskName, withinHours, PRIVACY_DEFAULT } from "./privacy.ts";
import { scopeOf, pickModel, textToolCalls } from "./model.ts";
import { parseBackup, scrub, toClassic, prefsFromClassic } from "./backup.ts";
import { BUILT_IN } from "./characters.ts";

const dee = BUILT_IN.find((c) => c.id === "dee")!;
const jade = BUILT_IN.find((c) => c.id === "jade")!;
const fae = BUILT_IN.find((c) => c.id === "fae")!;
const room = [dee, jade, fae];

const msg = (p: Partial<Message>): Message => ({ id: Math.random().toString(), kind: "character", who: "dee", name: "Dee", text: "", at: 0, source: "desk", ...p });

test("flood gate trips on a burst, a repeat, and a huge message", () => {
  let recent = judge([], "hi", 0).recent;
  for (let i = 1; i < 5; i++) recent = judge(recent, `line ${i}`, i * 100).recent;
  assert.ok(judge(recent, "one more", 600).trip);
  let r = judge([], "the same line again", 0).recent;
  r = judge(r, "the same line again", 10).recent;
  assert.ok(judge(r, "the same line again", 20).trip);
  assert.ok(judge([], "x".repeat(LARGE), 0).trip);
  assert.equal(judge([], "hello", 0).trip, "");
});

test("only general access is cut when the gate is shut", () => {
  assert.equal(mayWake("keyholder", true, []), true);
  assert.equal(mayWake("resident", true, ["resident"]), true);
  assert.equal(mayWake("general", true, ["general"]), false);
  assert.equal(mayWake("general", false, ["general"]), true);
});

test("named characters answer, otherwise the one in focus", () => {
  assert.deepEqual(responders("hey Jade, and you too Fae", room, "dee").map((c) => c.id), ["jade", "fae"]);
  assert.deepEqual(responders("what's up?", room, "fae").map((c) => c.id), ["fae"]);
  assert.equal(mentioned("hello everyone", room).length, 3);
  assert.equal(mentioned("jaded and faded", room).length, 0);
});

test("loop breaker catches repeats and long streaks", () => {
  const hist = [msg({ text: "I think we should finish this gate before the next one opens." })];
  assert.equal(loopCheck(hist, "I think we should finish this gate before the next one opens!", 1, true), "repeat");
  assert.equal(loopCheck(hist, "Something new entirely, about cats.", 6, true), "streak");
  assert.equal(loopCheck(hist, "Something new entirely, about cats.", 6, false), "ok");
  assert.equal(loopCheck(hist, "Anything", 16, false), "cap");
  assert.ok(similarity("a b c d", "a b c d") > 0.9);
  assert.equal(streakOf([msg({ kind: "human" }), msg({}), msg({}), msg({ pass: true })]), 2);
  // a character voiced from outside counts like a person: the count starts again after them
  assert.equal(streakOf([msg({}), msg({}), msg({ outside: true }), msg({})]), 1);
});

test("replies lose their own name prefix and anything written for others", () => {
  assert.equal(tidyReply(dee, "Dee: hello there\nJade: hi Dee", room), "hello there");
  assert.equal(tidyReply(dee, "**Pandora Dee:** fine", room), "fine");
  // any word of their own name counts at the start (Test Fae, short "Test", wrote "Fae:")
  const fae = { ...dee, id: "test-fae", name: "Test Fae", short: "Test" };
  assert.equal(tidyReply(fae, "Fae: Hello, everyone.", room), "Hello, everyone.");
  assert.equal(tidyReply(fae, "Test: hi", room), "hi");
  // but only at the very start: the name later in the line stays
  assert.equal(tidyReply(fae, "Hello, Fae: that's me.", room), "Hello, Fae: that's me.");
  // opening as someone else is speaking for them: nothing is posted (Test Fae wrote "Dee: …")
  assert.equal(tidyReply(fae, "Dee: It's great to hear that.", room), "");
  assert.equal(tidyReply(fae, "**Jade:** hi", room), "");
});

test("each character sees itself as the assistant and others by name", () => {
  const t = transcriptFor(dee, [msg({ kind: "human", who: "Sam", name: "Sam", text: "hi" }), msg({ who: "jade", name: "Jade", text: "yo" }), msg({ who: "dee", text: "hey" })]);
  assert.deepEqual(t.map((x) => x.role), ["user", "user", "assistant"]);
  assert.equal(t[1].content, "Jade: yo");
});

test("the shell edits a tree", () => {
  const ctx = { who: "me", host: "Dee", room: [], env: { A: "x" }, model: "", characters: ["Dee"] };
  let tree: Record<string, string> = { "SOUL.md": "# Dee\n" };
  let r = run('echo "hello" > notes/a.md', "", tree, ctx);
  tree = r.tree!;
  assert.equal(tree["notes/a.md"], "hello\n");
  r = run("cd notes", "", tree, ctx);
  assert.equal(r.cwd, "notes");
  assert.equal(run("cat a.md", "notes", tree, ctx).out, "hello");
  assert.match(run("ls", "", tree, ctx).out, /notes\//);
  assert.equal(run("env", "", tree, ctx).out, "A=(set)");
  assert.equal(run("mv a.md b.md", "notes", tree, ctx).tree!["notes/b.md"], "hello\n");
});

test("privacy: none blocks everything, conditional respects hours", () => {
  const p = { ...PRIVACY_DEFAULT, consents: { "online-models": true } };
  assert.equal(allowed(p, "online-models"), false);
  assert.equal(allowed({ ...p, mode: "some" }, "online-models"), true);
  const cond = { ...p, mode: "conditional" as const, hours: { from: "09:00", to: "17:00" } };
  assert.equal(allowed(cond, "online-models", new Date(2026, 1, 1, 10)), true);
  assert.equal(allowed(cond, "online-models", new Date(2026, 1, 1, 20)), false);
  assert.equal(withinHours({ from: "22:00", to: "06:00" }, new Date(2026, 1, 1, 23)), true);
  assert.equal(maskName({ ...PRIVACY_DEFAULT, streamer: { on: true, maskNames: true, maskMessages: false } }, "Sam", true), "Someone");
});

test("addresses are sorted into this computer, the network, and online", () => {
  assert.equal(scopeOf("http://localhost:11434"), "device");
  assert.equal(scopeOf("http://127.0.0.1:1234/v1"), "device");
  assert.equal(scopeOf("http://192.168.1.20:8788/mcp"), "network");
  assert.equal(scopeOf("http://100.101.1.2:11434"), "network");
  assert.equal(scopeOf("https://api.groq.com/openai/v1"), "cloud");
  assert.equal(pickModel(["nomic-embed-text", "llama3.2:3b", "qwen3:8b"]), "qwen3:8b");
});

test("backups drop secrets and get a free id", () => {
  const removed = { n: 0 };
  scrub({ bot: { token: "abc" }, nested: [{ api_key: "x" }], fine: "ok" }, removed);
  assert.equal(removed.n, 2);
  const r = parseBackup(JSON.stringify({ name: "Dee", description: "A test", integrations: { discord_token: "secret" } }), ["dee"]);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.character.id, "dee-2");
    assert.match(r.character.files["SOUL.md"], /A test/);
    assert.match(r.note, /left out/);
  }
});

import { scopedPrompt, isPass as passes } from "./room.ts";

test("someone else on a bridge never gets their person's memory or journal", () => {
  const files = { "SOUL.md": "# Dee\nI'm Dee.", "MEMORY.md": "- The locksmith's door code is 1234", "journal/2026-10-25.md": "Private day" };
  const p = scopedPrompt({ me: dee, files, via: "Discord", locksmithName: "Alex", who: "Sam", role: "public", now: new Date(2026, 9, 26) });
  assert.match(p, /I'm Dee/);
  assert.match(p, /notify_locksmith/);
  assert.match(p, /alongside \{\{PERSON_NAME\}\}/);
  assert.doesNotMatch(p, /door code|Private day/);
});

test("a bridge chat only sees its own conversation, stamped with times", () => {
  const hist = [
    msg({ kind: "human", who: "You", name: "You", text: "desk secret", source: "desk" }),
    msg({ kind: "human", who: "Sam", name: "Sam", text: "hi from discord", source: "discord", bridge: { chatId: "c1" } }),
    msg({ kind: "human", who: "Kim", name: "Kim", text: "other chat", source: "discord", bridge: { chatId: "c2" } }),
  ];
  const t = transcriptFor(dee, hist, 40, "c1");
  assert.equal(t.length, 1);
  assert.match(t[0].content, /^\[.+\] Sam \(via Discord\): hi from discord$/);
});

test("NO_REPLY means stay silent", () => {
  assert.equal(passes("NO_REPLY"), true);
  assert.equal(passes(" no_reply "), true);
  assert.equal(passes("No reply needed, but thanks!"), false);
});

import { CLOCK_DEFAULT, formatClock, validLocale, validZone } from "./clock.ts";

test("the clock follows its settings", () => {
  const at = new Date(Date.UTC(2026, 9, 26, 14, 5, 9));
  const base = { ...CLOCK_DEFAULT, zone: "UTC", locale: "en-GB" };
  assert.equal(formatClock(at, { ...base, hours: "24" }), "14:05");
  assert.match(formatClock(at, { ...base, hours: "12", locale: "en-US" }), /^2:05\sPM$/);
  assert.equal(formatClock(at, { ...base, hours: "24", seconds: true }), "14:05:09");
  assert.equal(formatClock(at, { ...base, hours: "24", date: true, dateStyle: "numeric" }), "26/10/2026  14:05");
  assert.equal(formatClock(at, { ...base, hours: "24", date: true, weekday: true, dateStyle: "long" }), "Monday, 26 October 2026  14:05");
  assert.equal(formatClock(at, { ...base, hours: "24", zone: "Asia/Tokyo" }), "23:05");
  assert.equal(validZone("Not/AZone"), false);
  assert.equal(validLocale("en-NZ"), true);
  assert.equal(formatClock(at, { ...base, hours: "24", zone: "Not/AZone" }).length > 0, true);
});

import { findSkill, frontmatter, searchSkills, skillsNote, skillsOf } from "./skills.ts";
import { systemPrompt, attachmentNote } from "./room.ts";

test("skills are read from skills/<name>/SKILL.md with their frontmatter", () => {
  const files = {
    "skills/recipes/SKILL.md": "---\nname: recipes\ndescription: Plan meals and shopping lists\n---\n# Recipes\nAsk about allergies first.",
    "skills/haiku/SKILL.md": "# Haiku\nWrite three lines: 5, 7, 5.",
    "notes/skills.md": "not a skill",
  };
  assert.deepEqual(frontmatter("---\nname: x\n---\nbody").data, { name: "x" });
  assert.deepEqual(skillsOf(files).map((s) => s.name), ["haiku", "recipes"]);
  assert.equal(skillsOf(files)[0].description, "Write three lines: 5, 7, 5.");
  assert.match(findSkill(files, "Recipes")!.body, /allergies/);
  assert.equal(searchSkills(files, "shopping for dinner meals")[0].name, "recipes");
  assert.match(skillsNote(files, false), /- recipes: Plan meals/);
  const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`skills/s${i}/SKILL.md`, `# S${i}\nSkill ${i}`]));
  assert.match(skillsNote(many, true), /14 skills/);
  assert.doesNotMatch(skillsNote(many, true), /- s1:/);
});

test("SYSTEM.md replaces the desktop's instructions; a summary stands in for compacted messages", () => {
  const base = { me: dee, room, people: ["Sam"], now: new Date(2026, 9, 26) };
  const plain = systemPrompt({ ...base, files: { "SOUL.md": "# Dee" } });
  assert.match(plain, /Speak only as yourself/);
  const own = systemPrompt({ ...base, files: { "SOUL.md": "# Dee", "SYSTEM.md": "You are a terse assistant." }, summary: "- Sam is planning a trip" });
  assert.match(own, /^You are a terse assistant\./);
  assert.doesNotMatch(own, /Speak only as yourself/);
  assert.match(own, /Earlier in this conversation \(summarised\)\n- Sam is planning a trip/);
});

test("the transcript skips what a summary covers, can stamp times, and carries attachments", () => {
  const hist = [
    msg({ kind: "human", who: "Sam", name: "Sam", text: "old", at: 1000 }),
    msg({ kind: "human", who: "Sam", name: "Sam", text: "new", at: 2000, files: [{ name: "a.txt", path: "attachments/a.txt", mime: "text/plain", size: 3, text: "abc" }] }),
  ];
  const t = transcriptFor(dee, hist, 40, undefined, { after: 1000, stamp: true });
  assert.equal(t.length, 1);
  assert.match(t[0].content, /^\[.+\] Sam: new\n\n\[Attached: a\.txt, saved at \/vault\/attachments\/a\.txt\]\n```\nabc\n```$/);
  assert.match(attachmentNote([{ name: "p.png", path: "attachments/p.png", mime: "image/png", size: 9 }]), /Attached picture: p\.png/);
});

import { buildIndex, parseYaml, resolveIn, splitFrontmatter, tasksIn, toggleTaskText } from "./notes.ts";
import { applyTemplate, formatDate } from "./templates.ts";

test("notes: links resolve by name, nearest folder first; backlinks, missing links and tags", () => {
  const texts = {
    "Welcome.md": "See [[Plan]] and [[Plan#Goals|the goals]], [[Nowhere]], and [a](guides/Linking%20Notes.md). #start #project/alpha\n```\n[[Ignored]] #nottag\n```",
    "Plan.md": "---\ntags: [work, q4]\n---\n# Plan\nBack to [[welcome]].",
    "guides/Linking Notes.md": "[[Plan]]",
    "guides/Plan.md": "the guides' own plan",
  };
  const idx = buildIndex(texts);
  assert.deepEqual([...idx.out.get("Welcome.md")!].sort(), ["Plan.md", "guides/Linking Notes.md"]);
  assert.deepEqual([...idx.missing.get("Welcome.md")!], ["Nowhere"]);
  assert.ok(idx.back.get("Welcome.md")!.has("Plan.md"));
  assert.equal(resolveIn(idx.notes, "Plan", "guides/Linking Notes.md"), "guides/Plan.md");
  assert.equal(resolveIn(idx.notes, "/Plan"), "Plan.md");
  assert.deepEqual([...idx.tags.keys()].sort(), ["project/alpha", "q4", "start", "work"]);
});

test("notes: tasks tick in place, frontmatter is read", () => {
  const text = "# T\n- [ ] one\n```\n- [ ] in code\n```\n1. [x] two";
  const tasks = tasksIn(text);
  assert.deepEqual(tasks.map((t) => [t.text, t.done]), [["one", false], ["two", true]]);
  assert.match(toggleTaskText(text, 0), /- \[x\] one/);
  assert.match(toggleTaskText(text, 1), /1\. \[ \] two/);
  assert.deepEqual(parseYaml(splitFrontmatter("---\ntitle: Hi\nn: 3\nlist:\n  - a\n  - b\n---\nbody").fm), { title: "Hi", n: 3, list: ["a", "b"] });
});

test("templates fill in dates and file details, and leave code for later", () => {
  const now = new Date(2026, 9, 26, 9, 5);
  assert.equal(formatDate(now, "dddd D MMMM YYYY [at] HH:mm"), "Monday 26 October 2026 at 09:05");
  const r = applyTemplate('# <% tp.file.title %> · <% tp.date.now("YYYY-MM-DD", 1) %>\n- [ ] <% tp.file.cursor() %>\n<%* tR += "x" %>', { title: "Trip", folder: "Plans", path: "Plans/Trip.md" }, now);
  assert.equal(r.text, "# Trip · 2026-10-27\n- [ ] \n");
  assert.equal(r.cursor, "# Trip · 2026-10-27\n- [ ] ".length);
  assert.equal(r.skipped, 1);
});

import { rankMemory, splitThink } from "./room.ts";

test("thinking comes apart from the reply, even while it's still streaming", () => {
  assert.deepEqual(splitThink("<think>plan it</think>Hello!"), { text: "Hello!", thinking: "plan it" });
  assert.deepEqual(splitThink("<think>still going"), { text: "", thinking: "still going" });
  assert.deepEqual(splitThink("no thoughts"), { text: "no thoughts", thinking: "" });
});

test("ranked memory keeps the lines that fit, in order, under their headings", () => {
  const mem = "# Memory\n## What I've learned\n- Sam loves green tea\n- The garden needs water on Fridays\n## Notes to self\n- Sam's cat is called Biscuit\n- Keep replies short";
  const out = rankMemory(mem, "what tea should I make for Sam", 2);
  assert.match(out, /green tea/);
  assert.match(out, /Biscuit/);
  assert.doesNotMatch(out, /garden/);
  assert.match(out, /## What I've learned\n- Sam loves green tea/);
  assert.match(out, /2 more lines/);
  assert.equal(rankMemory(mem, "anything", 10), mem);
});

import { parseSong } from "./songText.ts";

test("a song a character wrote comes apart into title, style and lyrics", () => {
  const s = parseSong("<think>hmm</think>**TITLE:** \"Harbor Lights\"\nSTYLE: synthwave, female vocals, dreamy\nLYRICS:\n[Verse]\nNeon on the water\n\n[Chorus]\nCarry me home");
  assert.deepEqual(s, { title: "Harbor Lights", style: "synthwave, female vocals, dreamy", lyrics: "[Verse]\nNeon on the water\n\n[Chorus]\nCarry me home" });
  assert.equal(parseSong("TITLE: X\nSTYLE: ambient\nLYRICS:\n[Instrumental]", true)?.lyrics, "");
  assert.equal(parseSong("Just some words, no style"), null);
});

test("a Classic backup comes in whole and goes back out the same, without keys", () => {
  const backup = {
    app: "jade-vault",
    format: 1,
    kind: "config",
    includesKeys: true,
    settings: { provider: "cloud", memoryRag: true, ollamaKey: "olk_secret", sshHosts: [{ host: "h", password: "p" }], jadeTheme: "amethyst" },
    storage: { schedules: [{ name: "morning" }] },
    vault: {
      files: {
        "/Pandora/SOUL.md": "# Pandora Dee Fae\n\nShe tends the forge.",
        "/Pandora/Memory.md": "# Memory\n- tasks first",
        "/agents.md": "# Agents",
        "/Pandora/mcp.json": "{\"servers\":{}}",
        "/Pandora/skills/forge/SKILL.md": "# Forge",
        "/Pandora/Journal/2026-10-30.md": "## The crossing",
        "/Pandora/Rituals/dawn.json": "{}",
        "/Pandora/Logs/cron.log": "ok",
        "/Pandora/.index/vectors.db": "x",
        "/Pandora/art.png": { base64: "AAAA" },
        "/Inbox.md": "a note of the person's own",
      },
      dirs: [],
    },
  };
  const r = parseBackup(JSON.stringify(backup), []);
  assert.ok(r.ok);
  if (!r.ok) return;
  const c = r.character;
  assert.equal(c.name, "Pandora Dee Fae");
  assert.equal(c.files["SOUL.md"], "# Pandora Dee Fae\n\nShe tends the forge.");
  assert.equal(c.files["MEMORY.md"], "# Memory\n- tasks first");
  assert.equal(c.files["AGENTS.md"], "# Agents");
  assert.equal(c.files["skills/forge/SKILL.md"], "# Forge");
  assert.equal(c.files["journal/2026-10-30.md"], "## The crossing");
  assert.equal(c.files["rituals/dawn.json"], "{}");
  assert.equal(c.files["classic/Logs/cron.log"], "ok");
  assert.ok(!Object.keys(c.files).some((k) => k.includes(".index") || k.includes("Inbox") || k.includes("art.png")));
  assert.equal(c.classic?.root, "Pandora");
  assert.equal(c.classic?.settings.memoryRag, true);
  assert.equal(c.classic?.settings.jadeTheme, "amethyst");
  assert.ok(!("ollamaKey" in (c.classic?.settings ?? {})) && !("sshHosts" in (c.classic?.settings ?? {})));
  assert.match(r.note, /1 note outside her folder/);
  assert.match(r.note, /1 picture or binary file/);
  // and back out, as a Classic config backup
  const out = toClassic(c, c.files);
  assert.equal(out.app, "jade-vault");
  assert.equal(out.kind, "config");
  for (const p of ["/Pandora/SOUL.md", "/Pandora/Memory.md", "/agents.md", "/Pandora/mcp.json", "/Pandora/skills/forge/SKILL.md", "/Pandora/Journal/2026-10-30.md", "/Pandora/Rituals/dawn.json", "/Pandora/Logs/cron.log"])
    assert.equal(out.vault.files[p], (backup.vault.files as Record<string, unknown>)[p], p);
  assert.equal(out.settings.provider, "cloud");
  assert.ok(!("ollamaKey" in out.settings));
  assert.deepEqual(out.storage, backup.storage);
});

test("a Jade Vault backup keeps Jade's folder and her flows", () => {
  const r = parseBackup(JSON.stringify({ app: "jade-vault", format: 1, kind: "config", settings: {}, vault: { files: { "/Jade/SOUL.md": "# Jade", "/Jade/Flows/x.json": "{}" } } }), ["jade"]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.character.classic?.root, "Jade");
  assert.equal(r.character.id, "jade-2");
  assert.equal(r.character.files["rituals/x.json"], "{}");
  assert.equal(toClassic(r.character, r.character.files).vault.files["/Jade/Flows/x.json"], "{}");
});

test("her Classic model, turns and voice become her desktop preferences, and go back the same", () => {
  const conns = [
    { id: "local", label: "Ollama here", kind: "ollama", baseUrl: "http://localhost:11434", keyName: "", model: "qwen3:8b", enabled: true },
    { id: "oc", label: "Ollama Cloud", kind: "openai", baseUrl: "https://ollama.com/v1", keyName: "OLLAMA", model: "", enabled: true },
  ] as Parameters<typeof prefsFromClassic>[1];
  const p = prefsFromClassic({ provider: "cloud", model: "gpt-oss:120b", temperature: 0.6, maxTurns: 12, voiceName: "af_bella", voiceRate: 1.1, voicePitch: 0.9 }, conns);
  assert.deepEqual(p, { model: "gpt-oss:120b", temperature: 0.6, maxSteps: 12, connection: "oc", voice: { voiceName: "af_bella", rate: 1.1, pitch: 0.9 } });
  const c = { id: "fae", name: "Fae", classic: { app: "pandora-dee", root: "Pandora", settings: { provider: "local", model: "old", memoryRag: true } } } as unknown as Parameters<typeof toClassic>[0];
  const out = toClassic(c, {}, { ...p, temperature: 0.4 }, conns);
  assert.equal(out.settings.provider, "cloud");
  assert.equal(out.settings.model, "gpt-oss:120b");
  assert.equal(out.settings.temperature, 0.4);
  assert.equal(out.settings.maxTurns, 12);
  assert.equal(out.settings.voiceName, "af_bella");
  assert.equal(out.settings.memoryRag, true);
});

test("her Classic vector memory settings come along, and go back", () => {
  const conns = [{ id: "box", label: "Ollama on the box", kind: "ollama", baseUrl: "http://192.168.3.9:11434", keyName: "", model: "", enabled: true }] as Parameters<typeof prefsFromClassic>[1];
  const p = prefsFromClassic({ memoryOn: true, memoryRag: true, memoryRagK: 10, embedModel: "mxbai-embed-large", embedHost: "http://192.168.3.9:11434/", embedNotes: true }, conns);
  assert.deepEqual(p.memory, { vectors: true, rag: true, ragK: 10, notes: true, model: "mxbai-embed-large", connection: "box" });
  assert.equal(prefsFromClassic({ model: "x" }, conns).memory, undefined);
  assert.equal(prefsFromClassic({ embedOn: false }, conns).memory?.vectors, false);
  const c = { id: "dee", name: "Dee", classic: { app: "pandora-dee", root: "Pandora", settings: {} } } as unknown as Parameters<typeof toClassic>[0];
  const out = toClassic(c, {}, { memory: { ...p.memory, rag: false } }, conns);
  assert.equal(out.settings.memoryRag, false);
  assert.equal(out.settings.embedOn, true);
  assert.equal(out.settings.memoryRagK, 10);
  assert.equal(out.settings.embedModel, "mxbai-embed-large");
  assert.equal(out.settings.embedHost, "http://192.168.3.9:11434");
});

test("her Classic thinking, journal, memory, helper model and heartbeat come along, and go back", () => {
  const conns = [
    { id: "local", label: "Ollama here", kind: "ollama", baseUrl: "http://localhost:11434", keyName: "", model: "qwen3:8b", enabled: true },
    { id: "groq", label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", keyName: "GROQ", model: "", enabled: true },
  ] as Parameters<typeof prefsFromClassic>[1];
  const p = prefsFromClassic({ thinkOn: false, journalOn: true, memoryOn: false, auxProv: "groq", auxModel: "llama-3.1-8b-instant", hbOn: true, hbEvery: 45, hbStart: "09:00", hbEnd: "21:30", hbPrompt: "Tend the garden notes." }, conns);
  assert.equal(p.think, false);
  assert.equal(p.journal, true);
  assert.equal(p.learn, false);
  assert.deepEqual(p.helper, { connection: "groq", model: "llama-3.1-8b-instant" });
  assert.deepEqual(p.heartbeat, { on: true, everyMin: 45, from: "09:00", to: "21:30", prompt: "Tend the garden notes." });
  // nothing about these in her settings: nothing set (everyone's settings apply)
  const none = prefsFromClassic({ model: "x" }, conns);
  assert.equal(none.heartbeat, undefined);
  assert.equal(none.helper, undefined);
  const c = { id: "fae", name: "Fae", classic: { app: "pandora-dee", root: "Pandora", settings: {} } } as unknown as Parameters<typeof toClassic>[0];
  const out = toClassic(c, {}, { ...p, heartbeat: { ...p.heartbeat!, everyMin: 60 } }, conns);
  assert.equal(out.settings.thinkOn, false);
  assert.equal(out.settings.memoryOn, false);
  assert.equal(out.settings.auxProv, "groq");
  assert.equal(out.settings.auxModel, "llama-3.1-8b-instant");
  assert.equal(out.settings.hbOn, true);
  assert.equal(out.settings.hbEvery, 60);
  assert.equal(out.settings.hbPrompt, "Tend the garden notes.");
});

test("tool calls a model wrote as text are found (GLM, <tool_call>, bare JSON), and only for offered tools", () => {
  const names = ["app_updates", "app_send_update"];
  // GLM-4 on Ollama: the name on a line, then the arguments
  let r = textToolCalls('app_updates\n{}\nThe game state is unknown.', names);
  assert.deepEqual(r.calls, [{ name: "app_updates", args: {} }]);
  assert.equal(r.rest, "The game state is unknown.");
  r = textToolCalls('app_send_update\n{\n  "payload": {"x": 7, "y": 7}\n}', names);
  assert.deepEqual(r.calls, [{ name: "app_send_update", args: { payload: { x: 7, y: 7 } } }]);
  // Qwen / Hermes
  r = textToolCalls('Let me look. <tool_call>{"name": "app_updates", "arguments": {"since": 3}}</tool_call>', names);
  assert.deepEqual(r.calls, [{ name: "app_updates", args: { since: 3 } }]);
  assert.equal(r.rest, "Let me look.");
  // a bare JSON call
  r = textToolCalls('{"name": "app_updates", "arguments": {}}', names);
  assert.equal(r.calls.length, 1);
  // not offered, or just talk: nothing
  assert.equal(textToolCalls('rm_everything\n{}', names).calls.length, 0);
  assert.equal(textToolCalls("I'll check app_updates soon {maybe}.", names).calls.length, 0);
  assert.equal(textToolCalls('app_updates\nnot json at all', names).calls.length, 0);
});

test("the shell hands mcp commands on whole, JSON arguments included", () => {
  const ctx = { who: "Dee", host: "seaside", room: [], env: {}, model: "", characters: [] };
  const r = run(`mcp call mcp__fae__echo '{"text": "hi there"}'`, "", {}, ctx);
  assert.deepEqual(r.action, { kind: "mcp", argv: ["call", "mcp__fae__echo", '{"text": "hi there"}'] });
  assert.deepEqual(run("mcp", "", {}, ctx).action, { kind: "mcp", argv: [] });
});

test("the browser route falls back to the relay only when that can't send a request twice", async () => {
  const { outbound, safeToResend, relaysFor } = await import("./outbound.ts");
  // safe: reading, and anything the browser had to ask the server about first (keys, JSON, other methods)
  assert.equal(safeToResend({}), true);
  assert.equal(safeToResend({ method: "POST", headers: { Authorization: "Bearer x" }, body: "{}" }), true);
  assert.equal(safeToResend({ method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), true);
  assert.equal(safeToResend({ method: "DELETE" }), true);
  // not safe: a "simple" POST may have arrived before CORS hid the answer
  assert.equal(safeToResend({ method: "POST", body: "hello" }), false);
  assert.equal(safeToResend({ method: "POST", headers: { "content-type": "text/plain;charset=UTF-8" }, body: "hello" }), false);

  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u === "/api/relay") return new Response("relayed", { status: 200, headers: { "X-Relay-Status": "200" } });
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  try {
    // JSON with a key: refused by the browser, sent by the relay, and the site remembered
    const r = await outbound("https://api.example.test/v1/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer k" }, body: "{}" }, "browser");
    assert.equal(await r.text(), "relayed");
    assert.deepEqual(calls, ["https://api.example.test/v1/chat", "/api/relay"]);
    assert.equal(relaysFor("https://api.example.test/other"), true);
    // the same site again: straight to the relay
    calls.length = 0;
    await outbound("https://api.example.test/v1/models", {}, "browser");
    assert.deepEqual(calls, ["/api/relay"]);
    // a simple POST elsewhere: refused, and NOT sent again
    calls.length = 0;
    await assert.rejects(outbound("https://hook.example.test/send", { method: "POST", body: "hi" }, "browser"), /wasn't sent again/);
    assert.deepEqual(calls, ["https://hook.example.test/send"]);
  } finally {
    globalThis.fetch = real;
  }
});
