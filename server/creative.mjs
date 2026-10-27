// Creative apps the desktop can install and open files in: GIMP, Krita and Inkscape (through the system's
// package manager, or found where they're already installed), and the open-source Craft apps by Storytold
// (PhotoCraft, PdfCraft, VectorCraft, LightCraft: portable builds from their GitHub releases, checked
// against the release's SHA-256 before use and kept in the desktop's data folder; ArtCraft through its own
// installer). Nothing is downloaded or installed until someone presses Install.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { unzipSync } from "fflate";

const win = process.platform === "win32";
const mac = process.platform === "darwin";
const UA = { "User-Agent": "PandoraDeeDesktop/3.8" };

/**
 * What can be installed. `opens`: the kinds of file it edits (image, svg, pdf, raw).
 * `pm`: package-manager ids; `gh`: a GitHub repo whose releases carry portable builds (or an installer).
 */
export const CATALOG = [
  {
    id: "gimp", name: "GIMP", what: "Photo editing and painting, with layers, masks, filters and plug-ins.",
    license: "GPL-3.0", home: "https://www.gimp.org", opens: ["image"], recommended: true,
    pm: { winget: "GIMP.GIMP.3", flatpak: "org.gimp.GIMP", brew: "gimp" },
    find: { win: [["GIMP 3", /^gimp-\d+(\.\d+)*\.exe$/i], ["GIMP 2", /^gimp-\d+(\.\d+)*\.exe$/i]], bin: ["gimp"], app: "GIMP" },
  },
  {
    id: "krita", name: "Krita", what: "Digital painting: brushes, animation, comics.",
    license: "GPL-3.0", home: "https://krita.org", opens: ["image"],
    pm: { winget: "KDE.Krita", flatpak: "org.kde.krita", brew: "krita" },
    find: { win: [["Krita (x64)", /^krita\.exe$/i], ["Krita", /^krita\.exe$/i]], bin: ["krita"], app: "krita" },
  },
  {
    id: "inkscape", name: "Inkscape", what: "Vector drawing (SVG): logos, diagrams, illustrations.",
    license: "GPL-2.0+", home: "https://inkscape.org", opens: ["svg", "pdf"],
    pm: { winget: "Inkscape.Inkscape", flatpak: "org.inkscape.Inkscape", brew: "inkscape" },
    find: { win: [["Inkscape", /^inkscape\.exe$/i]], bin: ["inkscape"], app: "Inkscape" },
  },
  {
    id: "sumatra", name: "SumatraPDF", what: "A small, fast PDF reader (also EPUB and comics). Windows only.",
    license: "GPL-3.0", home: "https://www.sumatrapdfreader.org", opens: ["pdf"], only: "win32",
    pm: { winget: "SumatraPDF.SumatraPDF" },
    find: { win: [["SumatraPDF", /^sumatrapdf\.exe$/i]] },
  },
  {
    id: "okular", name: "Okular", what: "Read PDFs and mark them up: highlights, notes, stamps, filling forms, signing.",
    license: "GPL-2.0+", home: "https://okular.kde.org", opens: ["pdf"],
    pm: { winget: "KDE.Okular", flatpak: "org.kde.okular" },
    find: { win: [["Okular", /^okular\.exe$/i]], bin: ["okular"] },
  },
  {
    id: "libreoffice", name: "LibreOffice", what: "Write documents and save them as PDFs; open a PDF in Draw to change its text and pictures.",
    license: "MPL-2.0", home: "https://www.libreoffice.org", opens: ["pdf"],
    pm: { winget: "TheDocumentFoundation.LibreOffice", flatpak: "org.libreoffice.LibreOffice", brew: "libreoffice" },
    find: { win: [["LibreOffice", /^soffice\.exe$/i]], bin: ["soffice", "libreoffice"], app: "LibreOffice" },
  },
  {
    id: "xournalpp", name: "Xournal++", what: "Handwrite and draw on PDFs (pen or mouse), then save them as new PDFs.",
    license: "GPL-2.0", home: "https://xournalpp.github.io", opens: ["pdf"],
    pm: { winget: "Xournal++.Xournal++", flatpak: "com.github.xournalpp.xournalpp", brew: "xournal++" },
    find: { win: [["Xournal++", /^xournalpp\.exe$/i]], bin: ["xournalpp"], app: "Xournal++" },
  },
  {
    id: "photocraft", name: "PhotoCraft", what: "Storytold's photo editor, written from scratch in Rust. Early, moving fast.",
    license: "Apache-2.0", home: "https://github.com/storytold/photocraft", opens: ["image"], gh: "storytold/photocraft",
  },
  {
    id: "pdfcraft", name: "PdfCraft", what: "Storytold's PDF reader and editor: read, mark up and make PDFs.",
    license: "Apache-2.0", home: "https://github.com/storytold/pdfcraft", opens: ["pdf"], gh: "storytold/pdfcraft",
  },
  {
    id: "vectorcraft", name: "VectorCraft", what: "Storytold's vector art tool.",
    license: "Apache-2.0", home: "https://github.com/storytold/vectorcraft", opens: ["svg"], gh: "storytold/vectorcraft",
  },
  {
    id: "lightcraft", name: "LightCraft", what: "Storytold's non-destructive RAW photo editor.",
    license: "Apache-2.0", home: "https://github.com/storytold/lightcraft", opens: ["raw", "image"], gh: "storytold/lightcraft",
  },
  {
    id: "artcraft", name: "ArtCraft", what: "Storytold's AI art studio: images and video with 2D/3D compositing, posing and scene blocking. Uses your own keys for image services.",
    license: "MIT or Apache-2.0", home: "https://github.com/storytold/artcraft", opens: ["image"], gh: "storytold/artcraft", installer: true,
    find: { win: [["ArtCraft", /^artcraft\.exe$/i]], app: "ArtCraft" },
  },
];

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** The first file under `dir` (a few levels down) whose name matches `re`. */
function findIn(dir, re, depth = 3) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) if (e.isFile() && re.test(e.name) && !/console|debug|test|tool/i.test(e.name)) return path.join(dir, e.name);
    if (depth > 0) for (const e of entries) if (e.isDirectory()) {
      const hit = findIn(path.join(dir, e.name), re, depth - 1);
      if (hit) return hit;
    }
  } catch {
    /* not there */
  }
  return "";
}

function onPath(name) {
  const r = spawnSync(win ? "where" : "which", [name], { encoding: "utf8", windowsHide: true, timeout: 4000 });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : "";
}

export function wingetPath() {
  const alias = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", "winget.exe");
  if (fs.existsSync(alias)) return alias; // an app alias: exists, but isn't a normal file
  return onPath("winget");
}

export function createCreative(dataDir) {
  const root = () => path.join(dataDir(), "creative");
  const jobs = new Map(); // id → { state, done, total, error }
  const metaOf = (id) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root(), id, "installed.json"), "utf8"));
    } catch {
      return null;
    }
  };

  /** Where an app is on this computer: { exe, version, how } or null. */
  function locate(app) {
    const mine = metaOf(app.id);
    if (mine?.exe && isFile(mine.exe)) return { exe: mine.exe, version: mine.version, how: "desktop" };
    const f = app.find;
    if (!f) return null;
    if (win) {
      const bases = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], path.join(process.env.LOCALAPPDATA || "", "Programs"), process.env.LOCALAPPDATA].filter(Boolean);
      for (const [folder, re] of f.win || [])
        for (const b of bases) {
          const exe = findIn(path.join(b, folder), re);
          if (exe) return { exe, version: (/(\d+(?:\.\d+)+)/.exec(path.basename(exe)) || [])[1] || "", how: "system" };
        }
      return null;
    }
    if (mac && f.app && fs.existsSync(`/Applications/${f.app}.app`)) return { exe: `/Applications/${f.app}.app`, version: "", how: "system" };
    for (const b of f.bin || []) {
      const exe = onPath(b);
      if (exe) return { exe, version: "", how: "system" };
    }
    if (app.pm?.flatpak) {
      const r = spawnSync("flatpak", ["info", app.pm.flatpak], { encoding: "utf8", timeout: 5000 });
      if (r.status === 0) return { exe: `flatpak:${app.pm.flatpak}`, version: (/Version:\s*(\S+)/.exec(r.stdout) || [])[1] || "", how: "system" };
    }
    return null;
  }

  function list() {
    return CATALOG.filter((a) => !a.only || a.only === process.platform).map((a) => {
      const at = locate(a);
      const j = jobs.get(a.id);
      return {
        id: a.id, name: a.name, what: a.what, license: a.license, home: a.home, opens: a.opens, recommended: Boolean(a.recommended),
        installed: Boolean(at), version: at?.version || "", how: at?.how || "", where: at?.exe || "",
        source: a.gh ? `github.com/${a.gh}` : win ? (a.pm?.winget ? `winget: ${a.pm.winget}` : "") : mac ? (a.pm?.brew ? `Homebrew: ${a.pm.brew}` : "") : a.pm?.flatpak ? `Flathub: ${a.pm.flatpak}` : "",
        job: j || null,
      };
    });
  }

  /** The release build for this computer: portable zip on Windows, AppImage on Linux; an installer for ArtCraft. */
  async function release(app) {
    const r = await fetch(`https://api.github.com/repos/${app.gh}/releases/latest`, { headers: { ...UA, Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(r.status === 403 ? "GitHub's hourly limit for checks was reached; try again later." : `GitHub answered ${r.status}.`);
    const rel = await r.json();
    const arch = process.arch === "arm64" ? "arm64" : process.arch === "ia32" ? "x86" : win ? "x64" : "x86_64";
    const assets = rel.assets || [];
    const pick = (re) => assets.find((a) => re.test(a.name));
    const asset = win
      ? app.installer ? pick(/x64-setup\.exe$/i) || pick(/\.msi$/i) : pick(new RegExp(`windows-${arch}-portable\\.zip$`, "i"))
      : mac ? pick(/\.dmg$/i) : pick(new RegExp(`linux-${arch}\\.AppImage$`, "i"));
    if (!asset) throw new Error(`${app.name} has no build for this computer in its latest release (${rel.tag_name}).`);
    const sums = pick(/^SHA256SUMS(\.txt)?$/i);
    return { tag: String(rel.tag_name || "").replace(/^[a-z-]*v(?=\d)/i, ""), asset, sums };
  }

  /** The SHA-256 the release states for this file (its SHA256SUMS file, or GitHub's own digest). */
  async function expectedHash(rel) {
    if (rel.sums) {
      const r = await fetch(rel.sums.browser_download_url, { headers: UA, redirect: "follow" });
      if (r.ok) {
        const line = (await r.text()).split(/\r?\n/).find((l) => l.trim().endsWith(rel.asset.name));
        if (line) return line.trim().split(/\s+/)[0].toLowerCase();
      }
    }
    const d = String(rel.asset.digest || "");
    if (d.startsWith("sha256:")) return d.slice(7).toLowerCase();
    return "";
  }

  async function downloadChecked(app, rel, job) {
    const want = await expectedHash(rel);
    if (!want) throw new Error(`The ${app.name} release gives no checksum, so it wasn't installed.`);
    job.state = "downloading";
    job.total = rel.asset.size || 0;
    const r = await fetch(rel.asset.browser_download_url, { headers: UA, redirect: "follow" });
    if (!r.ok || !r.body) throw new Error(`The download answered ${r.status}.`);
    const chunks = [];
    const hash = crypto.createHash("sha256");
    for await (const c of r.body) {
      chunks.push(c);
      hash.update(c);
      job.done += c.length;
    }
    job.state = "checking";
    const got = hash.digest("hex");
    if (got !== want) throw new Error(`The download doesn't match the release's checksum (expected ${want.slice(0, 12)}…, got ${got.slice(0, 12)}…). Nothing was installed.`);
    return Buffer.concat(chunks);
  }

  async function installFromGithub(app, job) {
    const rel = await release(app);
    const bytes = await downloadChecked(app, rel, job);
    const dir = path.join(root(), app.id);
    if (app.installer || mac) {
      // an installer (ArtCraft's, or a .dmg): saved, then opened for the person to go through
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, rel.asset.name);
      fs.writeFileSync(file, bytes);
      job.state = "installer";
      if (win && /\.msi$/i.test(file)) spawn("msiexec", ["/i", file], { detached: true, stdio: "ignore" }).unref();
      else if (win) spawn(file, [], { detached: true, stdio: "ignore" }).unref();
      else spawn("open", [file], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    job.state = "unpacking";
    const into = path.join(dir, rel.tag);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(into, { recursive: true });
    let exe = "";
    if (/\.zip$/i.test(rel.asset.name)) {
      const files = unzipSync(new Uint8Array(bytes));
      for (const [name, data] of Object.entries(files)) {
        if (name.endsWith("/")) continue;
        const out = path.resolve(into, name);
        if (!out.startsWith(into + path.sep)) continue; // nothing outside its folder
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, data);
      }
      exe = findIn(into, new RegExp(`^${app.id}\\.exe$`, "i"), 4) || findIn(into, /\.exe$/i, 4);
    } else {
      exe = path.join(into, rel.asset.name);
      fs.writeFileSync(exe, bytes);
      fs.chmodSync(exe, 0o755);
    }
    if (!exe) throw new Error(`Couldn't find ${app.name}'s program in the download.`);
    fs.writeFileSync(path.join(dir, "installed.json"), JSON.stringify({ version: rel.tag, exe, asset: rel.asset.name, at: Date.now() }, null, 2));
  }

  function installWithPackageManager(app, job) {
    if (win) {
      const wg = wingetPath();
      if (!wg || !app.pm?.winget) throw new Error("winget (the Windows package manager) wasn't found. Install it from the Microsoft Store (\"App Installer\"), or install the app from its website.");
      // in its own window, so its prompts (source agreements, the app's licence) are answered by the person
      spawn("cmd.exe", ["/c", "start", `"Installing ${app.name}"`, `"${wg}"`, "install", "--id", app.pm.winget, "-e"], { detached: true, stdio: "ignore", windowsVerbatimArguments: true }).unref();
    } else if (mac) {
      if (!onPath("brew")) throw new Error("Homebrew wasn't found (https://brew.sh), or install the app from its website.");
      spawn("open", ["-a", "Terminal", "--args", "brew", "install", "--cask", app.pm.brew], { detached: true, stdio: "ignore" }).unref();
    } else {
      if (!onPath("flatpak")) throw new Error("Flatpak wasn't found; install the app with your distribution's package manager.");
      spawn("flatpak", ["install", "-y", "--user", "flathub", app.pm.flatpak], { detached: true, stdio: "ignore" }).unref();
    }
    job.state = "installer";
  }

  function install(id) {
    const app = CATALOG.find((a) => a.id === id);
    if (!app) throw new Error("Unknown app.");
    const running = jobs.get(id);
    if (running && !["done", "error", "installer"].includes(running.state)) return running;
    const job = { state: "starting", done: 0, total: 0, error: "" };
    jobs.set(id, job);
    (async () => {
      try {
        if (app.gh) await installFromGithub(app, job);
        else installWithPackageManager(app, job);
        if (job.state !== "installer") job.state = "done";
      } catch (e) {
        job.state = "error";
        job.error = e instanceof Error ? e.message : String(e);
      }
    })();
    return job;
  }

  /** Remove what the desktop installed itself (system installs are removed the system's way). */
  function remove(id) {
    const app = CATALOG.find((a) => a.id === id);
    if (!app) throw new Error("Unknown app.");
    const dir = path.join(root(), app.id);
    if (!dir.startsWith(root() + path.sep)) throw new Error("Bad app.");
    fs.rmSync(dir, { recursive: true, force: true });
    jobs.delete(id);
  }

  /** Open an app, with a file if given (an absolute path the caller has already confined). */
  function open(id, file = "") {
    const app = CATALOG.find((a) => a.id === id);
    const at = app && locate(app);
    if (!at) throw new Error(`${app?.name || "That app"} isn't installed.`);
    const args = file ? [file] : [];
    if (at.exe.startsWith("flatpak:")) spawn("flatpak", ["run", at.exe.slice(8), ...args], { detached: true, stdio: "ignore" }).unref();
    else if (mac && at.exe.endsWith(".app")) spawn("open", ["-a", at.exe, ...args], { detached: true, stdio: "ignore" }).unref();
    else spawn(at.exe, args, { detached: true, stdio: "ignore", cwd: path.dirname(at.exe), windowsHide: false }).unref();
    return { ok: true };
  }

  return { list, install, remove, open };
}

