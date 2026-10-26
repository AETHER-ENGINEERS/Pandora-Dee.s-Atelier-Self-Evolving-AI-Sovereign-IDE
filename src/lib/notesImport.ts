// Import from notes apps (ported from Classic's notes_import): Google Keep, Samsung Notes, Apple Notes,
// and anything that exports text, HTML, Word or PDF. Pick the files or a .zip.
// - Google Keep: the Google Takeout .zip (or its .json files). Checklists become tasks, labels become
//   #tags, pictures come along, pinned/archived/colour and the dates go in the frontmatter; notes in
//   the trash stay out, archived ones go in an Archived folder.
// - Samsung Notes: Share → Microsoft Word (.docx), PDF, or Text file. Its own .sdocx can't be read.
// - Apple Notes: the iCloud data copy from privacy.apple.com (a .zip of .txt notes), Export as PDF,
//   or Markdown from an exporter app.
// Everything lands in Imported/<where it came from>/, beside a short report.

import { unzipSync } from "fflate";
import { baseOf, makeFolder, safeTitle, useNotes, writeFile, writeNote } from "./notes.ts";
import { pdfText } from "./pdf.ts";

const ROOT = "Imported";
export const NOTES_APP_FILE = /\.(zip|json|html?|docx|pdf|sdocx|md|markdown|txt)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
const tagOf = (s: string) => `#${String(s).trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_/-]/gu, "")}`;
const iso = (ms: number) => {
  try {
    return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  } catch {
    return "";
  }
};

function front(meta: Record<string, string | boolean | undefined>) {
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== "" && v !== false)
    .map(([k, v]) => `${k}: ${typeof v === "string" && (/: |\s#|:$/.test(v) || /^[[\]{},&*?|<>=!%@`'"#-]/.test(v)) ? JSON.stringify(v) : v}`);
  return lines.length ? `---\n${lines.join("\n")}\n---\n\n` : "";
}

/** Writes for one import: keeps names free even before they reach the disk. */
class Batch {
  taken = new Set(useNotes.getState().files.map((f) => f.path.toLowerCase()));
  path(dir: string, name: string, ext = ".md") {
    const base = safeTitle(name) || "Untitled";
    let p = `${dir}/${base}${ext}`;
    for (let i = 2; this.taken.has(p.toLowerCase()); i++) p = `${dir}/${base} ${i}${ext}`;
    this.taken.add(p.toLowerCase());
    return p;
  }
  async image(name: string, bytes: Uint8Array) {
    const ext = (IMAGE.exec(name)?.[0] ?? ".png").toLowerCase();
    const p = this.path("attachments/images", baseOf(name).replace(IMAGE, ""), ext);
    await writeFile(p, bytes);
    return p;
  }
}

/* ---------- HTML → markdown ---------- */
export function htmlToMd(html: string, image?: (src: string) => string | null): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const x of doc.querySelectorAll("script,style,head,noscript")) x.remove();
  const inline = (n: Node): string => [...n.childNodes].map(walk).join("");
  const block = (s: string) => `\n\n${s.trim()}\n\n`;
  function walk(n: Node): string {
    if (n.nodeType === 3) return (n.nodeValue ?? "").replace(/\s+/g, " ");
    if (n.nodeType !== 1) return "";
    const el = n as Element;
    const t = el.tagName.toLowerCase();
    const c = () => inline(el);
    switch (t) {
      case "br":
        return "\n";
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return block(`${"#".repeat(Number(t[1]))} ${c().trim()}`);
      case "p":
      case "section":
      case "article":
        return block(c());
      case "div": {
        const s = c();
        return /\n/.test(s) || el.parentElement?.tagName === "BODY" ? block(s) : `${s}\n`;
      }
      case "b":
      case "strong": {
        const s = c();
        return s.trim() ? `**${s.trim()}**` : s;
      }
      case "i":
      case "em": {
        const s = c();
        return s.trim() ? `*${s.trim()}*` : s;
      }
      case "s":
      case "del":
      case "strike": {
        const s = c();
        return s.trim() ? `~~${s.trim()}~~` : s;
      }
      case "code":
        return el.parentElement?.tagName === "PRE" ? el.textContent ?? "" : `\`${el.textContent}\``;
      case "pre":
        return block(`\`\`\`\n${(el.textContent ?? "").replace(/\n$/, "")}\n\`\`\``);
      case "blockquote":
        return block(
          c()
            .trim()
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n"),
        );
      case "a": {
        const h = el.getAttribute("href") || "";
        const s = c().trim();
        return h && !/^javascript:/i.test(h) ? `[${s || h}](${h})` : s;
      }
      case "img": {
        const src = el.getAttribute("src") || "";
        const got = image?.(src);
        return got ? `![[${got}]]` : /^https?:/i.test(src) ? `![](${src})` : "";
      }
      case "ul":
      case "ol": {
        let i = 0;
        return block(
          [...el.children]
            .filter((li) => li.tagName === "LI")
            .map((li) => {
              const box = li.querySelector(":scope > input[type=checkbox]") as HTMLInputElement | null;
              const txt = inline(li).trim().replace(/^[☐☑✓✔]\s*/, "");
              const lead = (li.textContent ?? "").trim();
              const done = box ? box.checked || box.hasAttribute("checked") : /^[☑✓✔]/.test(lead);
              const mark = box || /^[☐☑✓✔]/.test(lead) ? `- [${done ? "x" : " "}] ` : t === "ol" ? `${++i}. ` : "- ";
              return mark + txt.replace(/\n+/g, "\n  ");
            })
            .join("\n"),
        );
      }
      case "table":
        return block(
          [...el.querySelectorAll("tr")]
            .map((tr, k) => {
              const cells = [...tr.children].map((td) => inline(td).trim().replace(/\|/g, "\\|").replace(/\n+/g, " "));
              return `| ${cells.join(" | ")} |${k === 0 ? `\n|${cells.map(() => " --- |").join("")}` : ""}`;
            })
            .join("\n"),
        );
      case "hr":
        return block("---");
      default:
        return c();
    }
  }
  return `${inline(doc.body || doc)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

/* ---------- Word (.docx) ---------- */
async function docxToMd(bytes: Uint8Array, batch: Batch): Promise<string> {
  const z = unzipSync(bytes);
  const xml = z["word/document.xml"];
  if (!xml) throw new Error("not a Word document (word/document.xml is missing)");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const doc = new DOMParser().parseFromString(dec(xml), "application/xml");
  const rels: Record<string, string> = {};
  if (z["word/_rels/document.xml.rels"])
    for (const r of new DOMParser().parseFromString(dec(z["word/_rels/document.xml.rels"]), "application/xml").getElementsByTagName("Relationship")) rels[r.getAttribute("Id") ?? ""] = r.getAttribute("Target") ?? "";
  const kids = (n: Element, name: string) => [...n.childNodes].filter((c): c is Element => (c as Element).namespaceURI === W && (c as Element).localName === name);
  const on = (pr: Element | undefined, name: string) => {
    const e = pr && kids(pr, name)[0];
    if (!e) return false;
    const v = e.getAttributeNS(W, "val");
    return v == null || !/^(0|false|none)$/i.test(v);
  };
  const run = async (r: Element) => {
    const pr = kids(r, "rPr")[0];
    let s = "";
    for (const c of [...r.childNodes] as Element[]) {
      if (c.namespaceURI !== W) continue;
      if (c.localName === "t") s += c.textContent;
      else if (c.localName === "tab") s += "\t";
      else if (c.localName === "br" || c.localName === "cr") s += "\n";
      else if (c.localName === "drawing" || c.localName === "pict") {
        const blip = c.getElementsByTagNameNS("*", "blip")[0] || c.getElementsByTagNameNS("*", "imagedata")[0];
        const id = blip?.getAttributeNS(R, "embed") || blip?.getAttributeNS(R, "id");
        const target = id ? rels[id] : "";
        const data = target ? z[`word/${target.replace(/^\.?\//, "")}`] : undefined;
        if (data) s += `![[${await batch.image(target, data)}]]`;
      }
    }
    if (!s.trim() || /^!\[\[/.test(s)) return s;
    const lead = /^\s*/.exec(s)![0];
    const trail = /\s*$/.exec(s)![0];
    let out = s.trim();
    if (on(pr, "strike")) out = `~~${out}~~`;
    if (on(pr, "i")) out = `*${out}*`;
    if (on(pr, "b")) out = `**${out}**`;
    return lead + out + trail;
  };
  const para = async (p: Element) => {
    const pr = kids(p, "pPr")[0];
    const style = (pr && kids(pr, "pStyle")[0]?.getAttributeNS(W, "val")) || "";
    let text = "";
    for (const c of [...p.childNodes] as Element[]) {
      if (c.namespaceURI === W && c.localName === "r") text += await run(c);
      else if (c.namespaceURI === W && c.localName === "hyperlink") for (const r of kids(c, "r")) text += await run(r);
    }
    text = text.replace(/\*\*\*\*|\*\*(\s*)\*\*/g, "$1");
    const h = /^(?:Heading|Überschrift|Titre)\s?([1-6])$/i.exec(style);
    if ((h || /^Title$/i.test(style)) && text.trim()) return `${"#".repeat(h ? Number(h[1]) : 1)} ${text.trim()}`;
    const box = /^\s*([☐☑✓✔□■])\s*/.exec(text);
    if (box) return `- [${/[☑✓✔■]/.test(box[1]) ? "x" : " "}] ${text.slice(box[0].length)}`;
    if (pr && kids(pr, "numPr").length) {
      const lvl = Number(kids(kids(pr, "numPr")[0], "ilvl")[0]?.getAttributeNS(W, "val") || 0);
      return `${"  ".repeat(lvl)}- ${text.trim()}`;
    }
    return text;
  };
  const out: string[] = [];
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  for (const n of body ? ([...body.childNodes] as Element[]) : []) {
    if (n.namespaceURI !== W) continue;
    if (n.localName === "p") out.push(await para(n));
    else if (n.localName === "tbl") {
      const rows: string[] = [];
      let k = 0;
      for (const tr of kids(n, "tr")) {
        const cells: string[] = [];
        for (const tc of kids(tr, "tc")) cells.push((await Promise.all(kids(tc, "p").map(para))).join(" ").replace(/\|/g, "\\|").trim());
        rows.push(`| ${cells.join(" | ")} |${k++ === 0 ? `\n|${cells.map(() => " --- |").join("")}` : ""}`);
      }
      out.push("", rows.join("\n"), "");
    }
  }
  const list = /^\s*(- |\d+\. )/;
  let md = "";
  out.forEach((cur, i) => (md += i === 0 ? cur : (list.test(cur) && list.test(out[i - 1] || "") ? "\n" : "\n\n") + cur));
  return `${md.replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/* ---------- Google Keep (Takeout) ---------- */
type KeepNote = {
  title?: string;
  textContent?: string;
  listContent?: { text?: string; isChecked?: boolean }[];
  attachments?: { filePath: string; mimetype?: string }[];
  annotations?: { url?: string; title?: string }[];
  labels?: { name?: string }[];
  createdTimestampUsec?: number;
  userEditedTimestampUsec?: number;
  isPinned?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
  color?: string;
};
const isKeep = (o: unknown): o is KeepNote =>
  Boolean(o && typeof o === "object" && ("textContent" in o || "listContent" in o) && ("userEditedTimestampUsec" in o || "createdTimestampUsec" in o || "isTrashed" in o));

async function keepToMd(n: KeepNote, find: (f: string) => Uint8Array | null, batch: Batch) {
  const parts: string[] = [];
  if (n.textContent) parts.push(String(n.textContent).replace(/\r\n?/g, "\n").trim());
  if (Array.isArray(n.listContent) && n.listContent.length) parts.push(n.listContent.map((i) => `- [${i.isChecked ? "x" : " "}] ${String(i.text || "").replace(/\n+/g, " ")}`).join("\n"));
  const pics: string[] = [];
  const other: string[] = [];
  for (const a of n.attachments || []) {
    const data = find(a.filePath);
    if (!data) continue;
    if (/^image\//.test(a.mimetype || "") || IMAGE.test(a.filePath)) pics.push(`![[${await batch.image(a.filePath, data)}]]`);
    else {
      const ext = /\.[^.]+$/.exec(a.filePath)?.[0] ?? "";
      const p = batch.path(`${ROOT}/Google Keep/attachments`, a.filePath.replace(/\.[^.]+$/, ""), ext);
      await writeFile(p, data);
      other.push(`[${baseOf(p)}](/${encodeURI(p)})`);
    }
  }
  if (pics.length) parts.push(pics.join("\n"));
  if (other.length) parts.push(other.join("\n"));
  if (Array.isArray(n.annotations) && n.annotations.length) parts.push(n.annotations.filter((a) => a.url).map((a) => `- [${a.title || a.url}](${a.url})`).join("\n"));
  const labels = (n.labels || []).map((l) => l.name).filter(Boolean) as string[];
  if (labels.length) parts.push(labels.map(tagOf).join(" "));
  const us = (v?: number) => (Number(v) ? Number(v) / 1000 : 0);
  const meta = {
    source: "Google Keep",
    created: us(n.createdTimestampUsec) ? iso(us(n.createdTimestampUsec)) : "",
    updated: us(n.userEditedTimestampUsec) ? iso(us(n.userEditedTimestampUsec)) : "",
    pinned: Boolean(n.isPinned),
    archived: Boolean(n.isArchived),
    color: n.color && n.color !== "DEFAULT" ? String(n.color).toLowerCase() : "",
  };
  const firstLine = String(n.textContent || n.listContent?.[0]?.text || "").split("\n")[0];
  return { title: String(n.title || "").trim() || firstLine.slice(0, 60) || "Untitled", md: `${front(meta)}${parts.join("\n\n")}\n` };
}

export type ImportReport = { notes: number; trashed: number; skipped: string[]; folders: string[]; report?: string };

/** Bring notes in. Returns what happened; a report note is written beside them. */
export async function importNotes(files: File[]): Promise<ImportReport> {
  const batch = new Batch();
  const rep = { notes: 0, trashed: 0, skipped: [] as string[], dirs: new Set<string>(), apps: new Set<string>() };
  const put = async (dir: string, title: string, md: string) => {
    await writeNote(batch.path(dir, title), md);
    rep.notes++;
    rep.dirs.add(dir);
  };
  async function one(name: string, bytes: Uint8Array, dir: string, zip: Record<string, Uint8Array> | null) {
    const lower = name.toLowerCase();
    const title = baseOf(name).replace(/\.[^.]+$/, "");
    try {
      if (lower.endsWith(".sdocx")) {
        rep.skipped.push(`${baseOf(name)}: Samsung Notes' own format can't be read here. In Samsung Notes choose Share → Microsoft Word file, PDF file or Text file, and import that.`);
        return;
      }
      if (lower.endsWith(".json")) {
        let o: unknown;
        try {
          o = JSON.parse(dec(bytes));
        } catch {
          rep.skipped.push(`${baseOf(name)}: not JSON`);
          return;
        }
        if (!isKeep(o)) {
          rep.skipped.push(`${baseOf(name)}: not a Google Keep note`);
          return;
        }
        if (o.isTrashed) {
          rep.trashed++;
          return;
        }
        rep.apps.add("Google Keep");
        const find = (f: string) => {
          if (!zip || !f) return null;
          const want = baseOf(f).toLowerCase();
          const k = Object.keys(zip).find((z) => baseOf(z).toLowerCase() === want);
          return k ? zip[k] : null;
        };
        const n = await keepToMd(o, find, batch);
        await put(`${ROOT}/Google Keep${o.isArchived ? "/Archived" : ""}`, n.title, n.md);
        return;
      }
      if (lower.endsWith(".docx")) return void (await put(dir, title, await docxToMd(bytes, batch)));
      if (lower.endsWith(".pdf")) {
        const r = await pdfText(bytes);
        return void (await put(dir, title, `${r.text.replace(/^<!-- page 1 -->\n/, "")}\n`));
      }
      if (/\.html?$/.test(lower)) {
        const html = dec(bytes);
        const pending: Promise<unknown>[] = [];
        const image = (src: string) => {
          const dataUrl = /^data:(image\/[\w+.-]+);base64,(.*)$/.exec(src);
          if (dataUrl) {
            const ext = `.${(dataUrl[1].split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg")}`;
            const p = batch.path("attachments/images", title, ext);
            pending.push(writeFile(p, Uint8Array.from(atob(dataUrl[2]), (c) => c.charCodeAt(0))));
            return p;
          }
          if (!zip) return null;
          const want = decodeURIComponent(src.split(/[?#]/)[0]).split("/").pop()!.toLowerCase();
          const k = Object.keys(zip).find((z) => baseOf(z).toLowerCase() === want);
          if (!k || !IMAGE.test(k)) return null;
          const p = batch.path("attachments/images", baseOf(k).replace(IMAGE, ""), (IMAGE.exec(k)?.[0] ?? ".png").toLowerCase());
          pending.push(writeFile(p, zip[k]));
          return p;
        };
        const md = htmlToMd(html, image);
        await Promise.all(pending);
        const t = (/<title>([^<]*)<\/title>/i.exec(html)?.[1] || "").trim();
        return void (await put(dir, t && !/^untitled$/i.test(t) ? t : title, md));
      }
      if (/\.(md|markdown|txt|text)$/.test(lower)) return void (await put(dir, title, dec(bytes)));
      if (IMAGE.test(lower)) {
        if (!zip) await batch.image(name, bytes);
        return;
      }
      rep.skipped.push(`${baseOf(name)}: not a kind of note this can read`);
    } catch (e) {
      rep.skipped.push(`${baseOf(name)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (/\.zip$/i.test(f.name)) {
      let z: Record<string, Uint8Array>;
      try {
        z = unzipSync(bytes);
      } catch (e) {
        rep.skipped.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      const names = Object.keys(z).filter((n) => !/(^|\/)(__MACOSX|\.DS_Store)/.test(n) && !n.endsWith("/"));
      const keep = names.some((n) => /(^|\/)Keep\/[^/]+\.json$/i.test(n));
      const zdir = `${ROOT}/${safeTitle(f.name.replace(/\.zip$/i, "")) || "Archive"}`;
      // a zip whose entries all sit in one top folder: that folder is the zip itself
      const top = names[0]?.split("/")[0];
      const strip = names.length && names.every((n) => n.includes("/") && n.split("/")[0] === top) ? top.length + 1 : 0;
      // a Takeout .html only when its .json is missing
      const jsonBase = new Set(names.filter((n) => /\.json$/i.test(n)).map((n) => n.replace(/\.json$/i, "").toLowerCase()));
      for (const n of names) {
        if (keep && /\.html?$/i.test(n) && jsonBase.has(n.replace(/\.html?$/i, "").toLowerCase())) continue;
        if (keep && /\.json$/i.test(n) && !/(^|\/)Keep\//i.test(n)) continue;
        if (keep && /(^|\/)Keep\/Labels\.txt$/i.test(n)) continue;
        const inner = n.slice(strip);
        const rel = inner.includes("/") ? `/${inner.slice(0, inner.lastIndexOf("/")).split("/").map(safeTitle).join("/")}` : "";
        await one(n, z[n], zdir + rel, z);
      }
    } else await one(f.name, bytes, ROOT, null);
  }
  const where = [...rep.dirs].sort();
  const out: ImportReport = { notes: rep.notes, trashed: rep.trashed, skipped: rep.skipped, folders: where };
  if (rep.notes || rep.skipped.length) {
    const lines = [`# Import ${iso(Date.now())}`, "", `${rep.notes} note${rep.notes === 1 ? "" : "s"}${rep.apps.size ? ` from ${[...rep.apps].join(", ")}` : ""}.`];
    if (rep.trashed) lines.push(`${rep.trashed} note${rep.trashed === 1 ? " was" : "s were"} in the Keep trash and stayed out.`);
    if (where.length) lines.push("", "Into:", ...where.map((d) => `- ${d}`));
    if (rep.skipped.length) lines.push("", "Not imported:", ...rep.skipped.map((s) => `- ${s}`));
    await makeFolder(ROOT);
    out.report = await writeNote(batch.path(ROOT, `Import report ${iso(Date.now()).replace(/:/g, ".")}`), `${lines.join("\n")}\n`);
  }
  return out;
}
