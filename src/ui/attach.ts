// Files sent with a message: saved to the vault under attachments/, pictures made a sensible size,
// and text files read so the characters can see what's in them.

import type { Attachment } from "../lib/room.ts";
import { saveToVault } from "../lib/messengers.ts";
import { pdfText } from "../lib/pdf.ts";

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|bat|ps1|ya?ml|toml|ini|cfg|conf|log|sql|lua|svg|tex|srt|vtt)$/i;
const MAX_TEXT = 40_000;
const MAX_FILE = 50 * 1024 * 1024;
const MAX_SIDE = 1600;

export const isTextFile = (f: File) => f.type.startsWith("text/") || /json|xml|javascript|yaml|toml|sql/.test(f.type) || TEXT_EXT.test(f.name);

function safeName(name: string) {
  return name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";
}

/** Big pictures are scaled down (longest side 1600px) so they fit what vision models take. */
async function shrink(file: File): Promise<{ bytes: Uint8Array; mime: string }> {
  const raw = new Uint8Array(await file.arrayBuffer());
  if (file.type === "image/gif" || file.type === "image/svg+xml") return { bytes: raw, mime: file.type };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 2_500_000 && /^image\/(png|jpeg|webp)$/.test(file.type)) return { bytes: raw, mime: file.type };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    if (!blob) return { bytes: raw, mime: file.type };
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/jpeg" };
  } catch {
    return { bytes: raw, mime: file.type || "application/octet-stream" };
  }
}

export async function prepare(file: File): Promise<Attachment> {
  if (file.size > MAX_FILE) throw new Error(`${file.name} is over 50 MB.`);
  const day = new Date().toISOString().slice(0, 10);
  const stamp = Date.now().toString(36);
  if (file.type.startsWith("image/")) {
    const { bytes, mime } = await shrink(file);
    const name = mime === "image/jpeg" && !/\.jpe?g$/i.test(file.name) ? `${safeName(file.name).replace(/\.\w+$/, "")}.jpg` : safeName(file.name);
    const path = `attachments/${day}/${stamp}-${name}`;
    await saveToVault(path, bytes);
    return { name: file.name, path, mime, size: bytes.length };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = `attachments/${day}/${stamp}-${safeName(file.name)}`;
  await saveToVault(path, bytes);
  const out: Attachment = { name: file.name, path, mime: file.type || "application/octet-stream", size: file.size };
  let text = "";
  if (isTextFile(file)) text = new TextDecoder().decode(bytes);
  else if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    try {
      const r = await pdfText(bytes);
      if (r.text.replace(/<!--.*?-->|\s/g, "").length > 20) text = r.text;
    } catch {
      /* a PDF without readable text still goes along as a file */
    }
  }
  if (text) out.text = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n… (cut here: the whole file is at /vault/${path})` : text;
  return out;
}

export const vaultUrl = (path: string) => `/api/vault/file?path=${encodeURIComponent(path)}`;

export function sizeOf(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
