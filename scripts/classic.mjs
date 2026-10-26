// Copy a built Pandora Dee or Jade Vault page into public/classic, giving Pandora Dee its own
// storage names. Both apps come from the same base and would otherwise share (and overwrite)
// the same IndexedDB databases and localStorage keys on this origin.
//
//   node scripts/classic.mjs pandora <path/to/pandora-dee.html> <version>
//   node scripts/classic.mjs jade    <path/to/jade-vault.html>  <version>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [kind, source, version] = process.argv.slice(2);
if (!["pandora", "jade"].includes(kind) || !source || !version) {
  console.error("usage: node scripts/classic.mjs pandora|jade <built.html> <version>");
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let html = fs.readFileSync(source, "utf8");

/** Replace every match, and fail loudly if the pattern is missing (the upstream code moved). */
function swap(from, to) {
  const n = html.split(from).length - 1;
  if (!n) throw new Error(`pattern not found: ${from}`);
  html = html.split(from).join(to);
  return n;
}

if (kind === "pandora") {
  const counts = {
    db: swap("indexedDB.open('jade-", "indexedDB.open('pandora-"),
    keys: swap("'jvault:", "'pdee:"),
  };
  console.log("namespaced", counts);
}

const name = kind === "pandora" ? `pandora-dee-${version}.html` : `jade-vault-${version}.html`;
const out = path.join(root, "public", "classic", name);
fs.writeFileSync(out, html);
console.log("wrote", path.relative(root, out), `${Math.round(html.length / 1024)} KB`);

// Rebuild the list the desktop reads to offer apps and versions.
const dir = path.join(root, "public", "classic");
const list = { pandora: [], jade: [] };
for (const file of fs.readdirSync(dir)) {
  const m = file.match(/^(pandora-dee|jade-vault)-(.+)\.html$/);
  if (m) list[m[1] === "pandora-dee" ? "pandora" : "jade"].push({ version: m[2], file });
}
const order = (a, b) => b.version.localeCompare(a.version, undefined, { numeric: true });
list.pandora.sort(order);
list.jade.sort(order);
fs.writeFileSync(path.join(dir, "index.json"), `${JSON.stringify(list, null, 2)}\n`);
console.log("index:", list.pandora.map((x) => x.version).join(", "), "|", list.jade.map((x) => x.version).join(", "));
