// Newer releases of webxdc apps from where they're made: GitHub and Codeberg repositories named in each
// app's manifest (source_code_url). Only runs when someone asks (the Games & Apps button, or
// `npm run check-upstreams`). Nothing is downloaded until a newer version is chosen.

const UA = { "User-Agent": "PandoraDeeDesktop/3.4", Accept: "application/json" };

/** "https://github.com/th2tran/chess-webxdc" → { host, owner, repo, url } */
export function repoOf(url) {
  const m = /^https?:\/\/(github\.com|codeberg\.org)\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(String(url || "").trim());
  return m ? { host: m[1].toLowerCase(), owner: m[2], repo: m[3], url: `https://${m[1].toLowerCase()}/${m[2]}/${m[3]}` } : null;
}

/** Version strings compared number by number ("0.7.0+48" < "0.7.1", "v1.5.0" = "1.5.0"). */
export function compareVersions(a, b) {
  const parts = (v) => String(v || "").replace(/^v/i, "").split(/[^0-9]+/).filter(Boolean).map(Number);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

async function getJson(url) {
  const headers = { ...UA };
  if (process.env.GITHUB_TOKEN && url.startsWith("https://api.github.com/")) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(url, { headers });
  if (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0") throw new Error("GitHub's hourly limit for checks without an account was reached; try again later (or set GITHUB_TOKEN)");
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/** The newest release that carries a .xdc file. */
async function latestRelease(repo) {
  const list =
    repo.host === "github.com"
      ? await getJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=10`)
      : await getJson(`https://codeberg.org/api/v1/repos/${repo.owner}/${repo.repo}/releases?limit=10`);
  for (const rel of Array.isArray(list) ? list : []) {
    if (rel.draft) continue;
    const asset = (rel.assets || []).find((a) => /\.xdc$/i.test(a.name));
    if (asset) return { tag: rel.tag_name || rel.name || "", name: rel.name || rel.tag_name || "", published: rel.published_at || rel.created_at || "", prerelease: Boolean(rel.prerelease), asset: { name: asset.name, url: asset.browser_download_url, size: asset.size } };
  }
  return null;
}

/** No packaged release: the version in manifest.toml on the main branch, so you can see the source moved on. */
async function sourceVersion(repo) {
  const info = repo.host === "github.com" ? await getJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}`) : await getJson(`https://codeberg.org/api/v1/repos/${repo.owner}/${repo.repo}`);
  const branch = info.default_branch || "main";
  const raw = repo.host === "github.com" ? `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${branch}/manifest.toml` : `https://codeberg.org/${repo.owner}/${repo.repo}/raw/branch/${branch}/manifest.toml`;
  const r = await fetch(raw, { headers: { "User-Agent": UA["User-Agent"] } });
  if (!r.ok) return "";
  return (/^\s*version\s*=\s*"([^"]+)"/m.exec(await r.text()) || [])[1] || "";
}

/** "xdc-roses-for-vector-0.0.7" → "0.0.7"; "v1.5.0" → "1.5.0". */
const versionOfTag = (tag) => (/(\d+(?:\.\d+)+\S*)$/.exec(String(tag)) || [, String(tag).replace(/^v(?=\d)/i, "")])[1];

/**
 * apps: the library's list. Returns one row per source repository: the newest version here, the newest
 * release there, and whether it's newer.
 */
export async function checkUpdates(apps) {
  const byRepo = new Map();
  for (const a of apps) {
    const repo = repoOf(a.source);
    if (!repo) continue;
    const cur = byRepo.get(repo.url);
    if (!cur || compareVersions(a.version, cur.local) > 0) byRepo.set(repo.url, { repo, name: a.name, appKey: a.appKey, local: a.version || "" });
  }
  const rows = [];
  for (const { repo, name, appKey, local } of byRepo.values()) {
    try {
      const rel = await latestRelease(repo);
      if (!rel) {
        const src = await sourceVersion(repo).catch(() => "");
        const ahead = Boolean(src && local && compareVersions(src, local) > 0);
        rows.push({
          name,
          appKey,
          repo: repo.url,
          local,
          latest: src,
          newer: false,
          sourceAhead: ahead,
          note: src ? (ahead ? "newer in the source, but no packaged .xdc release: build it, or ask its developer for a release" : "up to date with the source (no packaged releases)") : "no release with a .xdc file",
        });
        continue;
      }
      const latest = versionOfTag(rel.tag);
      rows.push({ name, appKey, repo: repo.url, local, latest, newer: !local ? false : compareVersions(latest, local) > 0, published: rel.published, prerelease: rel.prerelease, asset: rel.asset });
    } catch (e) {
      rows.push({ name, appKey, repo: repo.url, local, latest: "", newer: false, note: `couldn't check (${e instanceof Error ? e.message : e})` });
    }
  }
  return rows.sort((a, b) => Number(b.newer) - Number(a.newer) || a.name.localeCompare(b.name));
}

/** Download a release file, only from GitHub or Codeberg. */
export async function download(url) {
  const u = new URL(url);
  if (!/^(github\.com|codeberg\.org)$/i.test(u.hostname) || u.protocol !== "https:") throw new Error("Only releases on GitHub or Codeberg are fetched.");
  const r = await fetch(u, { headers: { "User-Agent": UA["User-Agent"] }, redirect: "follow" });
  if (!r.ok) throw new Error(`The download answered ${r.status}.`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > 200_000_000) throw new Error("That file is over 200 MB.");
  return { bytes, name: decodeURIComponent(u.pathname.split("/").pop() || "update.xdc") };
}
