// The module door on the desktop (server/modules.mjs): look in Pandora Dee Fae's Box (and any other organisations
// named) for repos with a seaside-module.json, and bring one in. A skill goes to the character chosen; a Mini App to
// Games & Apps; a character joins the cast; a tool server is added to Connections switched off, for the person to
// look at and allow. See MODULES.md.

import { desk, uid } from "./store.ts";
import { allowed, blockedBecause } from "./privacy.ts";
import { parseBackup } from "./backup.ts";

export const BOX = "Pandora-Dee-Fae-s-Box";
export type Manifest = { name: string; kind: "skill" | "xdc" | "character" | "mcp"; version: string; description: string; needs: string[]; files: string[] };
export type Found = { org: string; repo: string; url: string; commit?: string; manifest?: Manifest; installed?: { commit: string; version: string } | null; error?: string };

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || `The desktop answered ${r.status}.`);
  return j;
}

/** Repos with a module, from GitHub (needs Privacy's web access). */
export async function lookForModules(orgs: string[]): Promise<Found[]> {
  const s = desk();
  if (!allowed(s.privacy, "web")) throw new Error(blockedBecause(s.privacy, "web"));
  return post<Found[]>("/api/modules/look", { orgs });
}

/** Bring one in. charId: who gets a skill. What happened, in a sentence. */
export async function installModule(f: Found, charId: string): Promise<string> {
  const s = desk();
  if (!allowed(s.privacy, "web")) throw new Error(blockedBecause(s.privacy, "web"));
  const r = await post<{ kind: string; name: string; version: string; files?: Record<string, string>; app?: unknown; backup?: unknown; mcp?: { name: string; command: string; args: string[]; source: string } }>(
    "/api/modules/install",
    { org: f.org, repo: f.repo, commit: f.commit },
  );
  if (r.kind === "skill") {
    for (const [p, text] of Object.entries(r.files ?? {})) desk().writeFile(charId, p, text);
    return `${r.name} ${r.version} is now a skill of ${desk().character(charId)?.short ?? charId}'s.`;
  }
  if (r.kind === "xdc") return `${r.name} ${r.version} is in Games & Apps.`;
  if (r.kind === "character") {
    const parsed = parseBackup(JSON.stringify(r.backup), desk().allCharacters().map((c) => c.id));
    if (!parsed.ok) throw new Error(parsed.reason);
    desk().addCharacter(parsed.character);
    return parsed.note;
  }
  if (r.mcp) {
    const m = r.mcp;
    desk().set({
      mcp: [
        ...desk().mcp,
        { id: uid(), name: m.name, url: "", keyName: "", enabled: false, stdio: { command: m.command, args: m.args }, description: `A module from ${m.source}. Get its code there (it's never run from GitHub), set where it lives, then switch it on.` },
      ],
    });
    return `${m.name} is in Connections → Tool servers, switched off: its code is at ${m.source}.`;
  }
  return `${r.name} came in.`;
}
