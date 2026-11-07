// The module door: repositories (Pandora Dee Fae's Box first) that carry a seaside-module.json come in as modules.
// "Look" lists the repos of the organisations given that have one, pinned to the commit they were found at; "install"
// fetches that same commit and brings the module in by kind:
//   skill      its files (skills/<name>/…) from the repo, for the desktop to give a character
//   xdc        a Mini App: the release file, checked against its SHA-256, into the app library
//   character  a character backup: the release file, checked, for the desktop to load
//   mcp        a tool server: never run from here; its command is handed back to add (switched off) in Connections
// Nothing is fetched unless the person asks, and the desktop checks Privacy first. See MODULES.md.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const KINDS = ["skill", "xdc", "character", "mcp"];
const NAME = /^[\w.-]{1,100}$/;
const RAW = "https://raw.githubusercontent.com";
const API = "https://api.github.com";

/** A manifest, checked: what it is and what it brings, or why it can't come in. */
export function checkManifest(m) {
  if (!m || typeof m !== "object") throw new Error("seaside-module.json isn't an object.");
  if (m.seaside !== 1) throw new Error("seaside-module.json needs \"seaside\": 1.");
  if (!KINDS.includes(m.kind)) throw new Error(`kind must be one of ${KINDS.join(", ")}.`);
  if (!m.name || typeof m.name !== "string") throw new Error("A module needs a name.");
  if (m.kind === "skill") {
    if (!Array.isArray(m.files) || !m.files.length) throw new Error("A skill lists its files.");
    for (const f of m.files) if (typeof f !== "string" || !/^skills\/[\w.-]+\/[\w./-]+$/.test(f) || f.includes("..")) throw new Error(`${f} isn't a file under skills/<name>/.`);
  }
  if (m.kind === "xdc" || m.kind === "character") {
    if (!/^https:\/\//.test(m.release?.url || "")) throw new Error("This kind needs a release url (https).");
    if (!/^[0-9a-f]{64}$/i.test(m.release?.sha256 || "")) throw new Error("This kind needs the release file's sha256.");
  }
  if (m.kind === "mcp" && typeof m.mcp?.command !== "string") throw new Error("A tool server gives its command.");
  return {
    name: m.name,
    kind: m.kind,
    version: String(m.version ?? ""),
    description: String(m.description ?? "").slice(0, 400),
    needs: Array.isArray(m.needs) ? m.needs.map(String) : [],
    files: m.files ?? [],
    release: m.release,
    mcp: m.mcp,
  };
}

export function createModules({ dataDir, fetchFn = fetch, importXdc }) {
  const installedFile = () => path.join(dataDir(), "modules", "installed.json");
  const installed = () => {
    try {
      return JSON.parse(fs.readFileSync(installedFile(), "utf8"));
    } catch {
      return {};
    }
  };
  const get = async (url, as = "json") => {
    const r = await fetchFn(url, { headers: { "User-Agent": "PDA-SEASIDE", Accept: as === "json" ? "application/vnd.github+json" : "*/*" } });
    if (!r.ok) throw Object.assign(new Error(`${url} answered ${r.status}`), { status: r.status });
    return as === "json" ? r.json() : as === "text" ? r.text() : Buffer.from(await r.arrayBuffer());
  };
  const manifestAt = async (org, repo, ref) => checkManifest(JSON.parse(await get(`${RAW}/${org}/${repo}/${ref}/seaside-module.json`, "text")));

  return {
    installed,

    /** The repos of these organisations that carry a seaside-module.json, each pinned to the commit it was found at. */
    async look(orgs) {
      const out = [];
      for (const org of orgs) {
        if (!NAME.test(org)) continue;
        const repos = await get(`${API}/orgs/${org}/repos?per_page=100&sort=pushed`);
        for (const r of repos) {
          if (r.archived) continue;
          let m;
          try {
            m = await manifestAt(org, r.name, r.default_branch);
          } catch (e) {
            if (e.status === 404) continue; // no manifest: not a module (yet)
            out.push({ org, repo: r.name, url: r.html_url, error: e.message });
            continue;
          }
          const c = await get(`${API}/repos/${org}/${r.name}/commits/${r.default_branch}`);
          out.push({ org, repo: r.name, url: r.html_url, commit: c.sha, manifest: m, installed: installed()[`${org}/${r.name}`] ?? null });
        }
      }
      return out;
    },

    /** Bring one in, from exactly the commit it was found at. */
    async install(org, repo, commit) {
      if (!NAME.test(org) || !NAME.test(repo) || !/^[0-9a-f]{40}$/.test(commit)) throw Object.assign(new Error("That isn't a module from the list."), { status: 400 });
      const m = await manifestAt(org, repo, commit);
      const out = { kind: m.kind, name: m.name, version: m.version };
      if (m.kind === "skill") {
        out.files = {};
        for (const f of m.files) out.files[f] = await get(`${RAW}/${org}/${repo}/${commit}/${f}`, "text");
      } else if (m.kind === "xdc" || m.kind === "character") {
        const bytes = await get(m.release.url, "bytes");
        const sum = createHash("sha256").update(bytes).digest("hex");
        if (sum !== m.release.sha256.toLowerCase()) throw Object.assign(new Error(`The release file's checksum doesn't match (${sum.slice(0, 12)}…): not installed.`), { status: 409 });
        if (m.kind === "xdc") out.app = importXdc(bytes, path.basename(new URL(m.release.url).pathname) || `${m.name}.xdc`);
        else out.backup = JSON.parse(bytes.toString("utf8"));
      } else out.mcp = { name: m.name, command: m.mcp.command, args: Array.isArray(m.mcp.args) ? m.mcp.args.map(String) : [], source: `https://github.com/${org}/${repo}/tree/${commit}` };
      const all = installed();
      all[`${org}/${repo}`] = { commit, version: m.version, kind: m.kind, name: m.name, at: Date.now() };
      fs.mkdirSync(path.dirname(installedFile()), { recursive: true });
      fs.writeFileSync(installedFile(), JSON.stringify(all, null, 2));
      return out;
    },
  };
}
