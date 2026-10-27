// Copies Live2D Cubism Core (the "Redistributable Code" Live2D allows inside apps) out of a Classic build
// into public/vendor/, so the desktop's Live2D avatars work offline without fetching it from anywhere.
//   node scripts/extract-cubism.mjs [path/to/classic.html]
// License: https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html (see NOTICE.md)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2] || path.join(root, "public", "classic", "pandora-dee-2.9.9.2.html");
const html = fs.readFileSync(source, "utf8");
const m = /<script id="lib-cubism-core">([\s\S]*?)<\/script>/.exec(html);
if (!m || !m[1].includes("Live2DCubismCore")) throw new Error(`No Cubism Core in ${source}`);
const out = path.join(root, "public", "vendor", "live2dcubismcore.min.js");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m[1].trim() + "\n");
console.log("wrote", path.relative(root, out), `${Math.round(m[1].length / 1024)} KB`);
