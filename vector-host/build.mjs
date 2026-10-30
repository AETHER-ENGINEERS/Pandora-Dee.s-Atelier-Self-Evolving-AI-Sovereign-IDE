#!/usr/bin/env node
// Builds Vector's own app in PDA SEASIDE host mode (see vector-host/files/src-tauri/src/pda_host.rs) from a
// checkout of https://github.com/VectorPrivacy/Vector, and puts it where the desktop looks for it.
//
//   node vector-host/build.mjs --vector <checkout of Vector> --out <data folder>/vector-host/app
//     [--msvc <folder>]        Windows: a portable MSVC folder (with setup_x64.bat), if Visual Studio isn't installed
//     [--target <folder>]      where cargo builds (5–10 GB)
//     [--cargo-home <folder>]  where cargo keeps downloaded crates
//     [--no-build]                          only add host mode to the checkout
//
// The checkout gets three new files and a few marked lines in src-tauri/src/lib.rs; a normal build of it
// behaves exactly as before, since host mode is only on when the desktop starts it with PDA_HOST_* set.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const win = process.platform === "win32";

const vector = path.resolve(arg("vector", "../Vector"));
const out = arg("out") && path.resolve(arg("out"));
if (!fs.existsSync(path.join(vector, "src-tauri", "src", "lib.rs"))) fail(`No Vector checkout at ${vector} (--vector).`);

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}
function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: win, ...opts });
  if (r.status !== 0) fail(`${cmd} stopped (exit ${r.status ?? r.signal}).`);
}

// ── 1. host mode into the checkout ────────────────────────────────────────────
const MARK = "// PDA SEASIDE host";
function copyFiles(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyFiles(a, b);
    else {
      fs.mkdirSync(to, { recursive: true });
      fs.copyFileSync(a, b);
    }
  }
}
copyFiles(path.join(here, "files"), vector);

const libPath = path.join(vector, "src-tauri", "src", "lib.rs");
let lib = fs.readFileSync(libPath, "utf8");
const nl = lib.includes("\r\n") ? "\r\n" : "\n";
// [where, replacement]: each place must be found exactly once, or the build stops and says which
const edits = [
  ["mod commands;", `mod commands;${nl}mod pda_host; ${MARK}`],
  [
    ".run(tauri::generate_context!())",
    `.run({ let mut context = tauri::generate_context!(); pda_host::adjust(&mut context); context }) ${MARK}`,
  ],
  [
    'let window = app.get_webview_window("main").unwrap();',
    `pda_host::open_window(app.handle())?; ${MARK}: its hidden bridge window${nl}            let window = app.get_webview_window("main").unwrap();`,
  ],
  [
    "tokio::time::sleep(std::time::Duration::from_secs(6)).await;",
    `tokio::time::sleep(std::time::Duration::from_secs(6)).await;${nl}                    if pda_host::host().is_some() { return; } ${MARK}: never shown`,
  ],
  [
    "if let Ok(data_dir) = handle.path().app_data_dir() {",
    `if let Some(data_dir) = pda_host::data_dir() { ${MARK}: the desktop's data folder${nl}                account_manager::set_app_data_dir(data_dir);${nl}            } else if let Ok(data_dir) = handle.path().app_data_dir() {`,
  ],
  [
    'if let Ok(downloads) = handle.path().resolve("vector", base_directory) {',
    `if let Some(downloads) = pda_host::download_dir() { ${MARK}${nl}                        vector_core::db::set_download_dir(downloads);${nl}                    } else if let Ok(downloads) = handle.path().resolve("vector", base_directory) {`,
  ],
  [
    "if let Err(e) = app.deep_link().register_all() {",
    `if pda_host::host().is_some() {} ${MARK}: vector:// links stay with the regular Vector${nl}                else if let Err(e) = app.deep_link().register_all() {`,
  ],
  [
    "match app.deep_link().get_current() {",
    `match if pda_host::host().is_some() { Ok(None) } else { app.deep_link().get_current() } { ${MARK}`,
  ],
];
if (lib.includes(MARK)) console.log("Host mode is already in this checkout's lib.rs.");
else {
  for (const [find, put] of edits) {
    const n = lib.split(find).length - 1;
    if (n !== 1) fail(`lib.rs: expected "${find}" once, found it ${n} times. Vector has changed here; vector-host/build.mjs needs updating.`);
    lib = lib.replace(find, put);
  }
  fs.writeFileSync(libPath, lib);
  console.log("Added host mode to src-tauri/src/lib.rs.");
}
// Every lookup of Vector's app-data folder goes through host mode's (pda_host::PdaAppData), so in host mode
// all of Vector finds its accounts in the desktop's data folder (links to another drive don't work for this on
// every Windows PC). Outside host mode it's the same folder as before.
const USE = "use crate::pda_host::PdaAppData as _; // PDA SEASIDE host";
function swapAppData(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += swapAppData(full);
    else if (e.name.endsWith(".rs") && e.name !== "pda_host.rs") {
      let text = fs.readFileSync(full, "utf8");
      const found = (text.match(/\.app_data_dir\(\)/g) || []).length;
      if (!found) continue;
      text = text.replace(/\.app_data_dir\(\)/g, ".pda_app_data_dir()");
      if (!text.includes(USE)) {
        // after the file's own inner docs and attributes (//! and #![…]), which have to come first
        const lines = text.split(/\r?\n/);
        let at = 0;
        while (at < lines.length && /^\s*(\/\/!|#!\[|$)/.test(lines[at])) at++;
        lines.splice(at, 0, USE);
        text = lines.join(nl);
      }
      fs.writeFileSync(full, text);
      n += found;
    }
  }
  return n;
}
const swapped = swapAppData(path.join(vector, "src-tauri", "src"));
if (swapped) console.log(`Host mode's data folder: ${swapped} app-data lookups now go through it.`);

if (flag("no-build")) process.exit(0);

// ── 2. build ──────────────────────────────────────────────────────────────────
const env = { ...process.env };
const msvc = arg("msvc");
if (msvc) {
  // what setup_x64.bat would set, without needing cmd
  const bat = fs.readFileSync(path.join(msvc, "setup_x64.bat"), "utf8");
  const vc = /VCToolsVersion=(\S+)/.exec(bat)?.[1];
  const sdk = /WindowsSDKVersion=([^\\\s]+)/.exec(bat)?.[1];
  if (!vc || !sdk) fail(`Couldn't read the versions in ${msvc}\\setup_x64.bat.`);
  const V = path.join(msvc, "VC", "Tools", "MSVC", vc), K = path.join(msvc, "Windows Kits", "10");
  env.VCToolsInstallDir = V + path.sep;
  env.VCToolsVersion = vc;
  env.WindowsSDKVersion = sdk + path.sep;
  env.WindowsSdkBinPath = path.join(K, "bin") + path.sep;
  env.VSCMD_ARG_HOST_ARCH = env.VSCMD_ARG_TGT_ARCH = "x64";
  env.PATH = [path.join(V, "bin", "Hostx64", "x64"), path.join(K, "bin", sdk, "x64"), path.join(K, "bin", sdk, "x64", "ucrt"), env.PATH].join(path.delimiter);
  env.INCLUDE = ["include"].map((d) => path.join(V, d)).concat(["ucrt", "shared", "um", "winrt", "cppwinrt"].map((d) => path.join(K, "Include", sdk, d))).join(";");
  env.LIB = [path.join(V, "lib", "x64"), path.join(K, "Lib", sdk, "ucrt", "x64"), path.join(K, "Lib", sdk, "um", "x64")].join(";");
  // Microsoft's tools go with Rust's MSVC toolchain, whatever this computer's default is
  env.RUSTUP_TOOLCHAIN ||= "stable-x86_64-pc-windows-msvc";
}
if (arg("target")) env.CARGO_TARGET_DIR = path.resolve(arg("target"));
if (arg("cargo-home")) env.CARGO_HOME = path.resolve(arg("cargo-home"));
// quicker than Vector's release settings (whole-program LTO, one codegen unit), and nearly as quick to run
env.CARGO_PROFILE_RELEASE_LTO = "thin";
env.CARGO_PROFILE_RELEASE_CODEGEN_UNITS = "16";

if (!fs.existsSync(path.join(vector, "node_modules"))) run("npm", ["ci"], { cwd: vector });
run("node", ["scripts/build-frontend.mjs"], { cwd: vector });
// without Whisper and Tor (they need extra build tools); custom-protocol: serve the built interface, not a dev server
run("cargo", ["build", "--release", "--no-default-features", "--features", "tauri/custom-protocol"], { cwd: path.join(vector, "src-tauri"), env });

// ── 3. into place ─────────────────────────────────────────────────────────────
if (out) {
  const target = env.CARGO_TARGET_DIR || path.join(vector, "src-tauri", "target");
  const exe = path.join(target, "release", win ? "vector.exe" : "vector");
  if (!fs.existsSync(exe)) fail(`The build finished but ${exe} isn't there.`);
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(exe, path.join(out, path.basename(exe)));
  fs.rmSync(path.join(out, "ui"), { recursive: true, force: true });
  fs.cpSync(path.join(vector, "dist"), path.join(out, "ui"), { recursive: true, dereference: true });
  const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: vector, encoding: "utf8" }).stdout?.trim() || "";
  const version = JSON.parse(fs.readFileSync(path.join(vector, "package.json"), "utf8")).version;
  fs.writeFileSync(path.join(out, "build.json"), JSON.stringify({ version, commit, at: new Date().toISOString() }, null, 2));
  console.log(`\n✓ Vector ${version} (${commit}) in host mode: ${out}`);
}
