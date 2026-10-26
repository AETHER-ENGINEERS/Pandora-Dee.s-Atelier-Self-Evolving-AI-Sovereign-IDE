// For developers: which webxdc apps in your library have newer releases where they're made.
//   npm run check-upstreams          list them
//   npm run check-upstreams -- --get bring the newer ones in as new versions (older ones stay)
// Uses the same data folder as the desktop (PDD_DATA, pdd.config.json, or ./data).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibrary } from "../server/xdc.mjs";
import { checkUpdates, download } from "../server/upstreams.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let saved = "";
try {
  saved = JSON.parse(fs.readFileSync(path.join(root, "pdd.config.json"), "utf8")).dataDir || "";
} catch {
  /* none */
}
const dataDir = path.resolve(process.env.PDD_DATA || saved || path.join(root, "data"));
const lib = createLibrary(dataDir);
const rows = await checkUpdates(lib.list());
const get = process.argv.includes("--get");
console.log(`Library: ${dataDir}\n`);
for (const r of rows) {
  const mark = r.newer ? "NEW " : r.sourceAhead ? "SRC " : r.note && !/up to date/.test(r.note) ? "  ? " : "  ok";
  console.log(`${mark} ${r.name.padEnd(28)} here ${String(r.local || "-").padEnd(14)} there ${String(r.latest || "-").padEnd(14)} ${r.repo}${r.note ? `  (${r.note})` : ""}`);
}
const newer = rows.filter((r) => r.newer && r.asset);
console.log(`\n${newer.length} newer release${newer.length === 1 ? "" : "s"}.${newer.length && !get ? " Run with --get to bring them in." : ""}`);
if (get)
  for (const r of newer) {
    const f = await download(r.asset.url);
    const out = lib.importAny(f.bytes, f.name);
    console.log(`Brought in ${r.name} ${r.latest} (${Array.isArray(out) ? out.length : 1} package).`);
  }
