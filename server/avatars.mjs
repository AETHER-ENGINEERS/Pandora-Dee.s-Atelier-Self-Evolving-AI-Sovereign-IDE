// Full avatars, kept in the vault under .pandora/avatars/<character>/<upload>/: a Live2D model (a .zip
// holding a .model3.json and its files), a VRM 3D model (.vrm), or an animated picture (GIF, WebP, APNG,
// or a WebM/MP4 video, ideally with transparency).

import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

const PICTURE = /\.(gif|webp|png|apng|jpe?g|avif)$/i;
const VIDEO = /\.(webm|mp4|mov)$/i;

export function createAvatars(vaultDir) {
  const root = () => path.join(vaultDir(), ".pandora", "avatars");
  const safe = (s) => String(s || "").replace(/[^\w.-]+/g, "_").slice(0, 80) || "x";
  const rel = (full) => path.relative(vaultDir(), full).split(path.sep).join("/");

  /** Store an upload for a character. Returns { kind, entry } (entry: a vault path). */
  function upload(charId, name, bytes) {
    const dir = path.join(root(), safe(charId), Date.now().toString(36));
    const lower = String(name).toLowerCase();
    if (lower.endsWith(".zip")) {
      const files = unzipSync(new Uint8Array(bytes));
      const names = Object.keys(files).filter((n) => !n.endsWith("/") && !/(^|\/)(__MACOSX|\.DS_Store)/.test(n));
      const model = names.find((n) => /\.model3\.json$/i.test(n));
      const vrm = names.find((n) => /\.vrm$/i.test(n));
      if (!model && !vrm) {
        if (names.some((n) => /\.model\.json$/i.test(n))) throw new Error("That's a Cubism 2 model. The desktop plays Cubism 3 and 4 models (.model3.json); re-export it from Cubism Editor 3 or newer.");
        throw new Error("No Live2D model (.model3.json) or VRM model (.vrm) in that zip.");
      }
      for (const n of names) {
        const target = path.resolve(dir, n);
        if (!target.startsWith(dir + path.sep)) continue; // never outside its folder
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, files[n]);
      }
      return model ? { kind: "live2d", entry: rel(path.join(dir, model)) } : { kind: "vrm", entry: rel(path.join(dir, vrm)) };
    }
    const kind = lower.endsWith(".vrm") ? "vrm" : PICTURE.test(lower) ? "image" : VIDEO.test(lower) ? "video" : "";
    if (!kind) throw new Error("Use a Live2D model (.zip), a VRM model (.vrm), an animated picture (GIF, WebP, APNG) or a video (WebM, MP4).");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, safe(path.basename(name)));
    fs.writeFileSync(file, bytes);
    return { kind, entry: rel(file) };
  }

  /** Remove one upload (the folder holding `entry`). */
  function remove(charId, entry) {
    const base = path.join(root(), safe(charId));
    const full = path.resolve(vaultDir(), String(entry || ""));
    if (!full.startsWith(base + path.sep)) throw new Error("That isn't one of this character's avatars.");
    const upload = path.join(base, path.relative(base, full).split(path.sep)[0]);
    fs.rmSync(upload, { recursive: true, force: true });
    return { ok: true };
  }

  return { upload, remove };
}
