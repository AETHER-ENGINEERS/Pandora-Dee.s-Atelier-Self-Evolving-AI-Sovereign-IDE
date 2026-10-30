// Character backups: our own format, the earlier desk's format, and character exports from
// other apps (AICord and similar). Anything that looks like a token or secret is dropped.

import { blankCharacter, slug, type Character, type ClassicKeep } from "./characters.ts";

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
  let classicNote = "";
  if (isClassicBackup(clean)) {
    // a Pandora Dee or Jade Vault backup (Config → Back up): her files, and her Classic settings kept whole
    const { character, skipped } = fromClassic(clean);
    c = character;
    classicNote =
      (skipped.notes ? ` ${skipped.notes} note${skipped.notes === 1 ? "" : "s"} outside her folder stay in the backup (bring them into Notes from there).` : "") +
      (skipped.binary ? ` ${skipped.binary} picture or binary file${skipped.binary === 1 ? " was" : "s were"} left out.` : "");
  } else if (clean.format === FORMAT && clean.character && typeof clean.character === "object") {
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
  return { ok: true, character: c, note: `${c.name} is on the desktop.${classicNote}${note}` };
}

// ---------- Classic (Pandora Dee / Jade Vault) backups: { app: "jade-vault", kind: "config" | "full", settings, vault: { files } } ----------

/** Her files in Classic's folder ↔ the desktop's names for them. The rest of her folder rides along under classic/. */
const CLASSIC_NAMES: [desk: string, classic: (root: string) => string][] = [
  ["SOUL.md", (r) => `/${r}/SOUL.md`],
  ["MEMORY.md", (r) => `/${r}/Memory.md`],
  ["SYSTEM.md", (r) => `/${r}/SYSTEM.md`],
  ["HEARTBEAT.md", (r) => `/${r}/HEARTBEAT.md`],
  ["CURIOSITY.md", (r) => `/${r}/CURIOSITY.md`],
  ["mcp.json", (r) => `/${r}/mcp.json`],
];
const CLASSIC_DIRS: [desk: string, classic: (root: string) => string][] = [
  ["skills/", (r) => `/${r}/skills/`],
  ["journal/", (r) => `/${r}/Journal/`],
  ["rituals/", (r) => (r === "Jade" ? "/Jade/Flows/" : "/Pandora/Rituals/")],
];

/** Classic's own list of settings that hold keys or logins (SECRET_KEYS in both apps), and the API token: never kept, never exported. */
export const CLASSIC_SECRETS = ["ollamaKey", "groqKey", "oaiKey", "lcppKey", "ollayaKey", "mcpSecrets", "secrets", "vecToken", "aicKey", "dcToken", "embedKey", "sshHosts", "abToken", "abPass", "apiToken"];
const withoutSecrets = (s: Record<string, unknown>) => Object.fromEntries(Object.entries(s).filter(([k]) => !CLASSIC_SECRETS.includes(k)));

export function isClassicBackup(d: unknown): boolean {
  const o = d as { app?: unknown; vault?: { files?: unknown } };
  return o?.app === "jade-vault" && Boolean(o.vault?.files && typeof o.vault.files === "object");
}

/** A Classic backup as a desktop character: her files under the desktop's names, her settings kept whole. */
export function fromClassic(d: Record<string, unknown>): { character: Character; skipped: { notes: number; binary: number } } {
  const files = (d.vault as { files: Record<string, unknown> }).files;
  const paths = Object.keys(files);
  const root: ClassicKeep["root"] = paths.filter((p) => p.startsWith("/Pandora/")).length >= paths.filter((p) => p.startsWith("/Jade/")).length ? "Pandora" : "Jade";
  const lower = new Map(paths.map((p) => [p.toLowerCase(), p]));
  const out: Record<string, string> = {};
  const used = new Set<string>();
  const skipped = { notes: 0, binary: 0 };
  const take = (p: string) => {
    const v = files[p];
    used.add(p);
    if (typeof v === "string") return v;
    skipped.binary++;
    return null;
  };
  for (const [desk, cl] of CLASSIC_NAMES) {
    const p = lower.get(cl(root).toLowerCase());
    if (p) {
      const v = take(p);
      if (v !== null) out[desk] = v;
    }
  }
  const agents = lower.get("/agents.md") ?? lower.get(`/${root}/agents.md`.toLowerCase());
  if (agents) {
    const v = take(agents);
    if (v !== null) out["AGENTS.md"] = v;
  }
  for (const p of paths) {
    if (used.has(p)) continue;
    const dir = CLASSIC_DIRS.find(([, cl]) => p.toLowerCase().startsWith(cl(root).toLowerCase()));
    const inRoot = p.toLowerCase().startsWith(`/${root}/`.toLowerCase());
    if (!dir && !inRoot) {
      skipped.notes++; // the person's own notes (a full backup): they stay in the backup file
      continue;
    }
    if (/\/\.index\//i.test(p)) continue; // search indexes: rebuilt by Classic
    const v = take(p);
    if (v === null) continue;
    out[dir ? dir[0] + p.slice(dir[1](root).length) : `classic/${p.slice(root.length + 2)}`] = v;
  }
  const soul = out["SOUL.md"] ?? "";
  const name = (/^#\s+(.+)$/m.exec(soul)?.[1] ?? "").trim() || (root === "Pandora" ? "Pandora Dee" : "Jade");
  const c = blankCharacter(name);
  c.files = { ...c.files, ...out };
  c.classic = {
    app: root === "Pandora" ? "pandora-dee" : "jade-vault",
    root,
    settings: withoutSecrets((d.settings as Record<string, unknown>) ?? {}),
    storage: (d.storage as Record<string, unknown>) ?? {},
  };
  return { character: c, skipped };
}

/** A desktop character as a Classic config backup (Config → Import in Pandora Dee or Jade Vault). Keys never go in. */
export function toClassic(c: Character, files: Record<string, string>) {
  const root = c.classic?.root ?? (/jade/i.test(c.id) ? "Jade" : "Pandora");
  const vault: Record<string, string> = {};
  for (const [p, v] of Object.entries(files)) {
    const named = CLASSIC_NAMES.find(([desk]) => desk === p);
    const dir = CLASSIC_DIRS.find(([desk]) => p.startsWith(desk));
    const path = p === "AGENTS.md" ? "/agents.md" : named ? named[1](root) : dir ? dir[1](root) + p.slice(dir[0].length) : p.startsWith("classic/") ? `/${root}/${p.slice(8)}` : `/${root}/${p}`;
    vault[path] = v;
  }
  return {
    app: "jade-vault",
    format: 1,
    kind: "config",
    exportedAt: new Date().toISOString(),
    includesKeys: false,
    settings: withoutSecrets(scrub(c.classic?.settings ?? {}) as Record<string, unknown>),
    storage: c.classic?.storage ?? {},
    vault: { files: vault, dirs: [] },
  };
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
