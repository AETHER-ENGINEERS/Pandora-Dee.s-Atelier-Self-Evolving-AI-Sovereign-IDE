// Markdown for notes and chat: [[wiki links]], #tags, ![[embeds]], $math$, task boxes,
// and remote pictures that only load when web access is allowed.

import { marked, type TokenizerAndRendererExtension } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import { baseOf, noteName, resolveNote, splitFrontmatter, useNotes, vaultUrl } from "./notes.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

/** Where the note being drawn lives, so links resolve from its folder. */
let renderFrom: string | undefined;
let embedDepth = 0;
/** Whether pictures from the internet may load (Privacy → web). */
let remoteOk = false;

/** A vault file by path or by name (for pictures and other files that aren't notes). */
export function findFile(target: string): string | null {
  const t = target.trim().replace(/^\/+/, "");
  const files = useNotes.getState().files.filter((f) => !f.dir);
  const exact = files.find((f) => f.path === t) ?? files.find((f) => f.path.toLowerCase() === t.toLowerCase());
  if (exact) return exact.path;
  const base = baseOf(t).toLowerCase();
  return files.filter((f) => baseOf(f.path).toLowerCase() === base).sort((a, b) => a.path.length - b.path.length)[0]?.path ?? null;
}

const embed: TokenizerAndRendererExtension = {
  name: "embed",
  level: "inline",
  start: (src) => {
    const i = src.indexOf("![[");
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^!\[\[([^[\]\n|#]+)(#[^[\]\n|]*)?(?:\|([^[\]\n]+))?\]\]/.exec(src);
    if (m) return { type: "embed", raw: m[0], target: m[1].trim(), heading: (m[2] || "").slice(1).trim(), size: (m[3] || "").trim() };
  },
  renderer(tok) {
    const target = String(tok.target);
    if (IMAGE.test(target)) {
      const p = findFile(target);
      const [w, h] = String(tok.size).split("x").map((n) => Number(n) || 0);
      if (!p) return `<span class="embed-missing">${esc(target)} (not found)</span>`;
      return `<img class="embed-img" src="${esc(vaultUrl(p))}" alt="${esc(baseOf(p))}"${w ? ` width="${w}"` : ""}${h ? ` height="${h}"` : ""}>`;
    }
    const note = resolveNote(target, renderFrom);
    if (note) {
      if (embedDepth >= 2) return `<a href="#" class="wiki-link" data-wiki="${esc(target)}">${esc(noteName(note))}</a>`;
      let body = splitFrontmatter(useNotes.getState().texts[note] ?? "").body;
      const heading = String(tok.heading);
      // the title bar already names it, so a top heading that only repeats the name goes
      if (!heading) {
        const first = body.trimStart().split("\n", 1)[0];
        if (/^#\s/.test(first) && first.slice(1).trim().toLowerCase() === noteName(note).toLowerCase()) body = body.trimStart().slice(first.length);
      }
      if (heading) {
        const lines = body.split("\n");
        const at = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s*/, "").trim().toLowerCase() === heading.toLowerCase());
        if (at >= 0) {
          const level = /^#+/.exec(lines[at])![0].length;
          const end = lines.findIndex((l, i) => i > at && /^#{1,6}\s/.test(l) && /^#+/.exec(l)![0].length <= level);
          body = lines.slice(at, end < 0 ? undefined : end).join("\n");
        }
      }
      const prevFrom = renderFrom;
      embedDepth++;
      renderFrom = note;
      try {
        return `<div class="note-embed"><div class="note-embed-title"><a href="#" class="wiki-link" data-wiki="${esc(note)}">${esc(noteName(note))}${heading ? ` › ${esc(heading)}` : ""}</a></div>${marked.parse(body, { async: false }) as string}</div>`;
      } finally {
        embedDepth--;
        renderFrom = prevFrom;
      }
    }
    const file = findFile(target);
    if (file) return `<a class="file-link" href="${esc(vaultUrl(file))}" target="_blank" rel="noreferrer">${esc(baseOf(file))}</a>`;
    return `<a href="#" class="wiki-link missing" data-wiki="${esc(target)}">${esc(target)}</a>`;
  },
};

const wiki: TokenizerAndRendererExtension = {
  name: "wikilink",
  level: "inline",
  start: (src) => {
    const i = src.indexOf("[[");
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^\[\[([^[\]\n|#]+)(#[^[\]\n|]*)?(?:\|([^[\]\n]+))?\]\]/.exec(src);
    if (m) return { type: "wikilink", raw: m[0], target: m[1].trim(), heading: (m[2] || "").slice(1).trim(), alias: (m[3] || "").trim() };
  },
  renderer(tok) {
    const target = String(tok.target);
    const r = useNotes.getState().loaded ? resolveNote(target, renderFrom) : target;
    const label = tok.alias || (tok.heading ? `${target} › ${tok.heading}` : target);
    return `<a href="#" class="wiki-link${r ? "" : " missing"}" data-wiki="${esc(target)}"${tok.heading ? ` data-heading="${esc(String(tok.heading))}"` : ""} title="${esc(r ? String(r) : "Not written yet: click to create it")}">${esc(String(label))}</a>`;
  },
};

const tag: TokenizerAndRendererExtension = {
  name: "notetag",
  level: "inline",
  start: (src) => {
    const m = /(^|[\s(\[,;])#[A-Za-z]/.exec(src);
    return m ? m.index + m[1].length : undefined;
  },
  tokenizer(src) {
    const m = /^#([A-Za-z][\w/-]*)/.exec(src);
    if (m) return { type: "notetag", raw: m[0], tag: m[1].replace(/[/-]+$/, "") };
  },
  renderer: (tok) => `<a href="#" class="tag-chip" data-tag="${esc(String(tok.tag).toLowerCase())}">#${esc(String(tok.tag))}</a>`,
};

const mathBlock: TokenizerAndRendererExtension = {
  name: "mathBlock",
  level: "block",
  start: (src) => {
    const m = /(^|\n) {0,3}(\$\$|\\\[)/.exec(src);
    return m ? m.index + m[1].length : undefined;
  },
  tokenizer(src) {
    const m = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src) || /^ {0,3}\\\[([\s\S]+?)\\\][ \t]*(?:\n+|$)/.exec(src);
    if (m) return { type: "mathBlock", raw: m[0], text: m[1].trim() };
  },
  renderer: (t) => `<div class="math-tex" data-display="1" data-tex="${esc(String(t.text))}"></div>\n`,
};

const mathInline: TokenizerAndRendererExtension = {
  name: "mathInline",
  level: "inline",
  start: (src) => {
    const m = /\$|\\\(/.exec(src);
    return m ? m.index : undefined;
  },
  tokenizer(src) {
    let m = /^\$\$([^$]+?)\$\$/.exec(src);
    if (m) return { type: "mathInline", raw: m[0], text: m[1].trim(), display: true };
    m = /^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<![\s\\])\$(?!\d)/.exec(src);
    if (m) return { type: "mathInline", raw: m[0], text: m[1], display: false };
    m = /^\\\(([\s\S]+?)\\\)/.exec(src);
    if (m) return { type: "mathInline", raw: m[0], text: m[1].trim(), display: false };
  },
  renderer: (t) => `<span class="math-tex" data-display="${t.display ? 1 : 0}" data-tex="${esc(String(t.text))}"></span>`,
};

marked.setOptions({ breaks: true, gfm: true });
marked.use({ extensions: [mathBlock, mathInline, embed, wiki, tag] });

// Pictures from the internet wait for permission: their address moves to data-remote.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    if (/^(https?:)?\/\//i.test(src) && !remoteOk) {
      node.setAttribute("data-remote", src);
      node.removeAttribute("src");
      node.setAttribute("alt", `Picture from ${src.replace(/^(https?:)?\/\//, "").split("/")[0]} (web access is off in Privacy)`);
      node.classList.add("remote-blocked");
    }
  }
  if (node.tagName === "A" && /^https?:/i.test(node.getAttribute("href") ?? "")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noreferrer noopener");
  }
});

/** Markdown to safe HTML. `from` is the note being drawn (so its links resolve from its folder). */
export function renderMarkdown(text: string, opts: { from?: string; remote?: boolean } = {}) {
  renderFrom = opts.from;
  remoteOk = Boolean(opts.remote);
  embedDepth = opts.from ? 1 : 0;
  try {
    return DOMPurify.sanitize(marked.parse(text, { async: false }) as string, { ADD_ATTR: ["target", "data-wiki", "data-tag", "data-tex", "data-display", "data-heading", "data-remote"] });
  } finally {
    renderFrom = undefined;
    embedDepth = 0;
  }
}

/** After the HTML is in the page: draw the math. */
export function hydrate(el: HTMLElement) {
  for (const m of el.querySelectorAll<HTMLElement>(".math-tex:not(.math-ok)")) {
    const tex = m.dataset.tex ?? "";
    const display = m.dataset.display === "1";
    try {
      m.innerHTML = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", trust: false, maxExpand: 500 });
      m.classList.add("math-ok");
    } catch (e) {
      m.textContent = display ? `$$${tex}$$` : `$${tex}$`;
      m.title = e instanceof Error ? e.message : "";
    }
  }
}

