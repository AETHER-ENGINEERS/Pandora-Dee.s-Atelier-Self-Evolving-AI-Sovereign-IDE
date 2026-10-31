// Ungoogled Chromium for the full browser: Chromium without Google's services, downloaded from the
// ungoogled-software releases on GitHub only when the person asks, checked against the SHA-256 GitHub lists for
// that file, and unpacked into the data folder (browser/engine), where engine.mjs looks for it first.
// Nothing is installed on the computer itself; deleting that folder removes it.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";

const UA = { "User-Agent": "PandoraDeeDesktop/3.10", Accept: "application/vnd.github+json" };
const win = process.platform === "win32";
const mac = process.platform === "darwin";

/** Which release repository and file suit this computer. */
export function assetFor(platform = process.platform, arch = process.arch) {
  const a = arch === "arm64" ? "arm64" : arch === "ia32" ? "x86" : "x64";
  if (platform === "win32") return { repo: "ungoogled-chromium-windows", match: new RegExp(`_windows_${a}\\.zip$`) };
  if (platform === "darwin") return { repo: "ungoogled-chromium-macos", match: new RegExp(`_${a === "arm64" ? "arm64" : "x86_64"}-macos\\.dmg$`) };
  if (platform === "linux" && a !== "x86") return { repo: "ungoogled-chromium-portablelinux", match: new RegExp(`-${a === "arm64" ? "arm64" : "x86_64"}_linux\\.tar\\.xz$`) };
  return null;
}

/** The program inside an unpacked engine folder. */
export const exeIn = (dir) => (win ? path.join(dir, "chrome.exe") : mac ? path.join(dir, "Chromium.app", "Contents", "MacOS", "Chromium") : path.join(dir, "chrome"));

/** Retried for a few seconds: on Windows a browser that just closed can hold its files a moment longer. */
async function settle(fn) {
  for (let i = 0; ; i++) {
    try {
      return fn();
    } catch (e) {
      if (i >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(e?.code)) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

export function createUngoogled({ browserDir, hold }) {
  const engineDir = () => path.join(browserDir(), "engine");
  const versionFile = () => path.join(engineDir(), "pandora-version.json");
  let job = { busy: false, stage: "", got: 0, total: 0, error: "" };
  let latestSeen = null;

  const installed = () => {
    if (!fs.existsSync(exeIn(engineDir()))) return null;
    try {
      return JSON.parse(fs.readFileSync(versionFile(), "utf8")).version || "unknown";
    } catch {
      return "unknown";
    }
  };

  /** The newest release for this computer: its version, file, size and checksum. */
  async function latest() {
    const want = assetFor();
    if (!want) throw Object.assign(new Error("There's no Ungoogled Chromium release for this kind of computer."), { status: 409 });
    const r = await fetch(`https://api.github.com/repos/ungoogled-software/${want.repo}/releases/latest`, { headers: UA });
    if (r.status === 403) throw new Error("GitHub's hourly limit for checks was reached; try again in a while.");
    if (!r.ok) throw new Error(`GitHub answered ${r.status}.`);
    const rel = await r.json();
    const asset = (rel.assets || []).find((x) => want.match.test(x.name));
    if (!asset) throw new Error(`The newest release (${rel.tag_name}) has no file for this computer yet.`);
    const sha256 = /^sha256:([0-9a-f]{64})$/.exec(String(asset.digest || ""))?.[1];
    if (!sha256) throw new Error("GitHub didn't list a checksum for that file, so it isn't downloaded.");
    latestSeen = { version: rel.tag_name, name: asset.name, size: asset.size, url: asset.browser_download_url, sha256, published: rel.published_at };
    return latestSeen;
  }

  const status = () => ({ installed: installed(), latest: latestSeen, ...job, where: engineDir() });

  /** Download, check and unpack the newest release (in the background; status() reports progress). */
  function install() {
    if (job.busy) return status();
    job = { busy: true, stage: "Looking up the newest release…", got: 0, total: 0, error: "" };
    void (async () => {
      const tmp = path.join(browserDir(), "download");
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp, { recursive: true });
      try {
        const rel = await latest();
        const u = new URL(rel.url);
        if (u.hostname !== "github.com" || u.protocol !== "https:") throw new Error("Only GitHub releases are fetched.");
        job = { ...job, stage: `Downloading ${rel.name}…`, total: rel.size };
        const file = path.join(tmp, rel.name);
        const res = await fetch(u, { headers: { "User-Agent": UA["User-Agent"] }, redirect: "follow" });
        if (!res.ok || !res.body) throw new Error(`The download answered ${res.status}.`);
        const hash = crypto.createHash("sha256");
        const body = Readable.fromWeb(res.body);
        body.on("data", (c) => {
          hash.update(c);
          job.got += c.length;
        });
        await pipeline(body, fs.createWriteStream(file));
        const got = hash.digest("hex");
        if (got !== rel.sha256) throw new Error(`The download doesn't match GitHub's checksum (expected ${rel.sha256.slice(0, 12)}…, got ${got.slice(0, 12)}…), so it was thrown away.`);
        job = { ...job, stage: "Checked. Unpacking…" };
        const out = path.join(tmp, "unpacked");
        fs.mkdirSync(out, { recursive: true });
        unpack(file, out);
        // the archives hold one folder with the browser in it: find where the program is
        const root = findEngineRoot(out);
        if (!root) throw new Error("The download didn't have the browser in it where expected.");
        fs.writeFileSync(path.join(root, "pandora-version.json"), JSON.stringify({ version: rel.version, sha256: rel.sha256, from: rel.url, at: new Date().toISOString() }, null, 2));
        job = { ...job, stage: "Switching over…" };
        // the browser stops, and stays stopped until its files are replaced
        const release = await hold();
        try {
          const old = `${engineDir()}.old`;
          fs.rmSync(old, { recursive: true, force: true });
          if (fs.existsSync(engineDir())) await settle(() => fs.renameSync(engineDir(), old));
          await settle(() => fs.renameSync(root, engineDir()));
          fs.rmSync(old, { recursive: true, force: true });
        } finally {
          release();
        }
        job = { busy: false, stage: `Ungoogled Chromium ${rel.version} is ready.`, got: job.got, total: job.total, error: "" };
      } catch (e) {
        job = { busy: false, stage: "", got: 0, total: 0, error: e instanceof Error ? e.message : String(e) };
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    })();
    return status();
  }

  function unpack(file, out) {
    if (file.endsWith(".zip")) {
      // Windows 10 and later have tar, which reads zip files
      execFileSync(win ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar", ["-xf", file, "-C", out], { stdio: "ignore", timeout: 600_000 });
    } else if (file.endsWith(".tar.xz")) {
      execFileSync("tar", ["-xJf", file, "-C", out], { stdio: "ignore", timeout: 600_000 });
    } else if (file.endsWith(".dmg")) {
      const mnt = fs.mkdtempSync(path.join(os.tmpdir(), "ungoogled-"));
      execFileSync("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mnt, file], { stdio: "ignore", timeout: 120_000 });
      try {
        const app = fs.readdirSync(mnt).find((n) => n.endsWith(".app"));
        if (!app) throw new Error("The disk image has no app in it.");
        execFileSync("cp", ["-R", path.join(mnt, app), path.join(out, "Chromium.app")], { stdio: "ignore", timeout: 300_000 });
      } finally {
        execFileSync("hdiutil", ["detach", mnt, "-force"], { stdio: "ignore", timeout: 60_000 });
      }
    } else throw new Error("Unknown kind of download.");
  }

  function findEngineRoot(dir, depth = 0) {
    if (fs.existsSync(exeIn(dir))) return dir;
    if (depth > 2) return null;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.endsWith(".app")) continue;
      const hit = findEngineRoot(path.join(dir, e.name), depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  /** Remove it (the full browser goes back to a browser installed on the computer). */
  async function remove() {
    if (job.busy) throw Object.assign(new Error("It's still downloading."), { status: 409 });
    const release = await hold();
    try {
      await settle(() => fs.rmSync(engineDir(), { recursive: true, force: true }));
    } finally {
      release();
    }
    job = { busy: false, stage: "", got: 0, total: 0, error: "" };
    return status();
  }

  return { status, latest, install, remove, installed, engineDir };
}
