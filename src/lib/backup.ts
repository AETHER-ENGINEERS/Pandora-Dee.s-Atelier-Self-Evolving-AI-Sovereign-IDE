// Character backups: our own format, the earlier desk's format, and character exports from
// other apps (AICord and similar). Anything that looks like a token or secret is dropped.

import { blankCharacter, slug, type Character } from "./characters.ts";

export const FORMAT = "pandora-dee-character";

export type Backup = { format: typeof FORMAT; version: 1; character: Omit<Character, "files" | "builtIn">; files: Record<string, string> };

export function makeBackup(c: Character, files: Record<string, string>): Backup {
  const { files: _ignored, builtIn: _b, ...rest } = c;
  void _ignored;
  void _b;
  return { format: FORMAT, version: 1, character: rest, files };
}

const SECRET = /(token|secret|password|passwd|bearer|api[_-]?key|authorization|nsec|private[_-]?key|webhook)/i;

/** Remove anything secret-looking, at any depth. Returns how many were removed. */
export function scrub(value: unknown, removed = { n: 0 }): unknown {
  if (Array.isArray(value)) return value.map((v) => scrub(v, removed));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET.test(k)) {
        removed.n++;
        continue;
      }
      out[k] = scrub(v, removed);
    }
    return out;
  }
  if (typeof value === "string" && /^(Bot |Bearer )?[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/.test(value.trim())) {
    removed.n++;
    return "";
  }
  return value;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type Parsed = { ok: true; character: Character; note: string } | { ok: false; reason: string };

export function parseBackup(raw: string, takenIds: string[]): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "That file isn't a character backup (it isn't JSON)." };
  }
  const removed = { n: 0 };
  const clean = scrub(data, removed) as Record<string, unknown>;
  const note = removed.n ? ` ${removed.n} secret-looking value${removed.n === 1 ? " was" : "s were"} left out. Put keys in Keys instead.` : "";

  let c: Character;
  if (clean.format === FORMAT && clean.character && typeof clean.character === "object") {
    const ch = clean.character as Partial<Character>;
    if (!text(ch.name)) return { ok: false, reason: "That backup has no name." };
    c = { ...blankCharacter(text(ch.name)), ...ch, files: (clean.files as Record<string, string>) ?? {} } as Character;
  } else if (text(clean.name) && (clean.files || clean.soul || clean.epithet)) {
    // Backups from the earlier desk.
    const soul = Array.isArray(clean.soul) ? (clean.soul as { title?: string; body?: string }[]).map((b) => `## ${b.title ?? ""}\n\n${b.body ?? ""}`).join("\n\n") : "";
    c = blankCharacter(text(clean.name));
    c.tagline = text(clean.epithet);
    c.greeting = text(clean.line) || c.greeting;
    c.traits = Array.isArray(clean.traits) ? (clean.traits as string[]).slice(0, 4) : [];
    if (text(clean.portrait).startsWith("data:")) c.art.portrait = text(clean.portrait);
    c.files = { ...c.files, ...(soul ? { "SOUL.md": `# ${c.name}\n\n${soul}\n` } : {}), ...((clean.files as Record<string, string>) ?? {}) };
    if (clean.shelf === "adult") c.shelf = "adult";
  } else {
    // A character export from another app: look for the usual fields.
    const name = text(clean.name) || text(clean.char_name) || text(clean.display_name) || text((clean.data as Record<string, unknown>)?.name);
    if (!name) return { ok: false, reason: "Couldn't find a character name in that file." };
    const d = (clean.data as Record<string, unknown>) ?? clean;
    const parts = [
      text(d.description),
      text(d.personality),
      text(d.persona),
      text(d.system_prompt),
      text(d.systemPrompt),
      text(d.scenario),
      text(d.context),
      text(d.instructions),
    ].filter(Boolean);
    const examples = text(d.mes_example) || text(d.example_dialogue);
    c = blankCharacter(name);
    c.tagline = text(d.tagline) || text(d.short_description) || text(d.bio).slice(0, 80);
    c.greeting = text(d.first_mes) || text(d.greeting) || c.greeting;
    c.files = {
      ...c.files,
      "SOUL.md": `# ${name}\n\n${parts.join("\n\n") || "Brought in from a character export."}\n${examples ? `\n## How I sound\n\n${examples}\n` : ""}`,
    };
  }

  let id = slug(c.id || c.name) || "friend";
  const base = id;
  for (let n = 2; takenIds.includes(id); n++) id = `${base}-${n}`;
  c.id = id;
  c.builtIn = false;
  c.short = c.short || c.name.split(/\s+/)[0];
  c.art = { ...c.art, portrait: c.art?.portrait ?? "" };
  if (typeof c.pitch !== "number") c.pitch = 0;
  if (!Array.isArray(c.traits)) c.traits = [];
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.files ?? {})) if (typeof v === "string") files[k.replace(/^\/+/, "")] = v;
  c.files = files;
  return { ok: true, character: c, note: `${c.name} is on the desktop.${note}` };
}

export function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
