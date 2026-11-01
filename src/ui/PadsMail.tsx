import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, ExternalLink, Inbox, NotebookPen, X } from "lucide-react";
import { dismissMail, useInbox, type Mail } from "../lib/pads.ts";
import { copyText } from "../lib/clipboard.ts";
import { sendToItems } from "../lib/sendTo.ts";
import { vaultUrl } from "../lib/notes.ts";

/** What your other PADS devices sent here ("Send to" in their right-click menus), until you take it or set it aside.
 *  It waits as a small pill (so it doesn't cover the windows) and opens into cards when tapped. */
export function PadsMail() {
  const inbox = useInbox();
  const [open, setOpen] = useState(false);
  // something new arriving makes the pill pulse once
  const [fresh, setFresh] = useState(false);
  const count = useRef(0);
  useEffect(() => {
    if (inbox.length > count.current) {
      setFresh(true);
      const t = window.setTimeout(() => setFresh(false), 1600);
      count.current = inbox.length;
      return () => window.clearTimeout(t);
    }
    count.current = inbox.length;
    if (!inbox.length) setOpen(false);
  }, [inbox.length]);
  if (!inbox.length) return null;
  const last = inbox[inbox.length - 1];
  if (!open)
    return (
      <button className={`pads-mail-pill${fresh ? " fresh" : ""}`} onClick={() => setOpen(true)} aria-label={`${inbox.length} sent from your other devices: show`}>
        <Inbox size={14} />
        <span>{inbox.length === 1 ? `From ${last.from}` : `${inbox.length} from your devices`}</span>
      </button>
    );
  return (
    <div className="pads-mail" role="region" aria-label="Sent from your other devices">
      <button className="btn small ghost pads-mail-hide" onClick={() => setOpen(false)}>
        <ChevronDown size={13} /> Tuck away
      </button>
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
