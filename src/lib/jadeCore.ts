// Jade's Rust core (jade-vault 2.20, MIT) compiled to WebAssembly: turns a web page into Markdown
// (title, headings, paragraphs, lists, links, code, tables; no scripts, menus or hidden parts).
// Kept in public/vendor/jade-core/ exactly as jade-vault ships it. If it can't load, callers fall back.

type Glue = ((opts: { module_or_path: string }) => Promise<unknown>) & { html_markdown?: (html: string, url: string) => string };

let ready: Promise<Glue | null> | null = null;

function load(): Promise<Glue | null> {
  return (ready ??= new Promise<Glue | null>((resolve) => {
    const done = async () => {
      try {
        // the glue is a classic script's global `const`, reachable by name from global code
        const glue = new Function("return typeof jadeRustGlue === 'undefined' ? null : jadeRustGlue")() as Glue | null;
        if (!glue) return resolve(null);
        await glue({ module_or_path: "/vendor/jade-core/jade_core.wasm" });
        resolve(glue.html_markdown ? glue : null);
      } catch (e) {
        console.warn("Jade's Rust core couldn't start:", e);
        resolve(null);
      }
    };
    if (document.querySelector("script[data-jade-core]")) return void done();
    const s = document.createElement("script");
    s.src = "/vendor/jade-core/jade_core.js";
    s.dataset.jadeCore = "1";
    s.onload = () => void done();
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  }));
}

/** A web page as Markdown, or null when the converter isn't available. */
export async function pageToMarkdown(html: string, url: string): Promise<{ title: string; text: string } | null> {
  const glue = await load();
  if (!glue?.html_markdown) return null;
  try {
    const j = JSON.parse(glue.html_markdown(html, url)) as { title?: string; text?: string };
    return { title: j.title ?? "", text: j.text ?? "" };
  } catch {
    return null;
  }
}
