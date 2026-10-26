// The text of a PDF, page by page (pdf.js, bundled with the desktop so it works offline).

export async function pdfText(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 300); i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    let line = "";
    const out: string[] = [];
    let lastY: number | null = null;
    for (const it of tc.items as { str?: string; transform?: number[]; hasEOL?: boolean }[]) {
      const y = it.transform?.[5] ?? 0;
      if (lastY != null && Math.abs(y - lastY) > 2) {
        out.push(line);
        line = "";
      }
      line += (it.str ?? "") + (it.hasEOL ? "\n" : "");
      lastY = y;
    }
    out.push(line);
    pages.push(out.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
  }
  return { pages: doc.numPages, text: pages.map((t, i) => `<!-- page ${i + 1} -->\n${t}`).join("\n\n") };
}
