import { Copy, ExternalLink, NotebookPen, X } from "lucide-react";
import { dismissMail, useInbox, type Mail } from "../lib/pads.ts";
import { copyText } from "../lib/clipboard.ts";
import { sendToItems } from "../lib/sendTo.ts";
import { vaultUrl } from "../lib/notes.ts";

/** What your other PADS devices sent here ("Send to" in their right-click menus), until you take it or set it aside. */
export function PadsMail() {
  const inbox = useInbox();
  if (!inbox.length) return null;
  return (
    <div className="pads-mail" role="region" aria-label="Sent from your other devices">
      {inbox.map((m) => (
        <Card key={`${m.fromId}-${m.at}`} m={m} />
      ))}
    </div>
  );
}

function Card({ m }: { m: Mail }) {
  const it = m.item;
  const toNotes = () => {
    const notes = sendToItems(it.kind === "image" ? { ...it } : it).find((x) => "label" in x && x.label.startsWith("Notes"));
    if (notes && "run" in notes) notes.run();
    dismissMail(m);
  };
  return (
    <div className="pads-mail-card">
      <div className="row small" style={{ gap: 6, alignItems: "center" }}>
        <b style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>From {m.from}</b>
        <button className="icon-btn" title="Set it aside" aria-label="Set it aside" onClick={() => dismissMail(m)}>
          <X size={14} />
        </button>
      </div>
      {it.kind === "image" ? (
        <a href={vaultUrl(it.path)} target="_blank" rel="noopener">
          <img src={vaultUrl(it.path)} alt={it.title || "Picture"} className="pads-mail-pic" />
        </a>
      ) : (
        <div className="pads-mail-text small">{it.kind === "link" ? it.title || it.url : it.text}</div>
      )}
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {it.kind === "link" ? (
          <button className="btn small" onClick={() => (window.open(it.url, "_blank", "noopener"), dismissMail(m))}>
            <ExternalLink size={13} /> Open
          </button>
        ) : null}
        {it.kind !== "image" ? (
          <button className="btn small ghost" onClick={() => void copyText(it.kind === "link" ? it.url : it.text).then(() => dismissMail(m))}>
            <Copy size={13} /> Copy
          </button>
        ) : null}
        <button className="btn small ghost" onClick={toNotes}>
          <NotebookPen size={13} /> To notes
        </button>
      </div>
      {it.kind === "image" ? <div className="small faint">Kept on the desktop: {it.path}</div> : null}
    </div>
  );
}
