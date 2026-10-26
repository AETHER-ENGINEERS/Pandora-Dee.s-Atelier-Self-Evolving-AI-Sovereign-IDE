import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { hydrate, renderMarkdown } from "../lib/markdown.ts";
import { useNotes } from "../lib/notes.ts";
import { openNote } from "./noteNav.ts";
import { initials, type Character } from "../lib/characters.ts";
import { allowed, FEATURES, type Feature } from "../lib/privacy.ts";
import { desk, useDesk } from "../lib/store.ts";
import { speech } from "../lib/voice.ts";

/**
 * Markdown with the notes extras: [[links]] open notes, #tags filter them, math is drawn, code gets a
 * Copy button. In a note (`from`), task boxes can be ticked through `onTask`.
 */
export function Markdown({ text, className = "", from, onTask }: { text: string; className?: string; from?: string; onTask?: (n: number, done: boolean) => void }) {
  const notesVersion = useNotes((s) => s.version);
  const remote = useDesk((s) => allowed(s.privacy, "web"));
  const html = useMemo(() => renderMarkdown(text, { from, remote }), [text, from, remote, notesVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    hydrate(el);
    // Every code block gets a Copy button.
    for (const pre of el.querySelectorAll("pre")) {
      if (pre.querySelector(".code-copy")) continue;
      const b = document.createElement("button");
      b.className = "code-copy";
      b.type = "button";
      b.textContent = "Copy";
      b.setAttribute("aria-label", "Copy this code");
      pre.appendChild(b);
    }
    // Task boxes: tickable in a note, read-only elsewhere.
    // (boxes inside an embedded note belong to that note, so they stay read-only here)
    let n = 0;
    el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => {
      const own = !box.closest(".note-embed");
      box.disabled = !onTask || !own;
      if (own) box.dataset.task = String(n++);
    });
    // (a native listener: React's onChange doesn't see inputs inside HTML it didn't render)
    const change = (e: Event) => {
      const box = e.target as HTMLInputElement;
      if (onTask && box.type === "checkbox" && box.dataset.task) onTask(Number(box.dataset.task), box.checked);
    };
    el.addEventListener("change", change);
    return () => el.removeEventListener("change", change);
  }, [html, onTask]);
  return (
    <div
      ref={ref}
      className={`md ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        const copy = t.closest(".code-copy");
        if (copy) {
          const code = copy.parentElement?.querySelector("code")?.textContent ?? "";
          void navigator.clipboard?.writeText(code).then(() => {
            copy.textContent = "Copied";
            setTimeout(() => (copy.textContent = "Copy"), 1200);
          });
          return;
        }
        const link = t.closest<HTMLElement>(".wiki-link");
        if (link) {
          e.preventDefault();
          openNote({ target: link.dataset.wiki, heading: link.dataset.heading, from, create: link.classList.contains("missing") });
          return;
        }
        const tag = t.closest<HTMLElement>(".tag-chip");
        if (tag) {
          e.preventDefault();
          openNote({ tag: tag.dataset.tag });
        }
      }}
    />
  );
}

export function CharAvatar({ c, size = 24 }: { c: Character; size?: number }) {
  const src = c.art.portrait || c.art.still;
  return (
    <span className="avatar" style={{ width: size, height: size, background: c.accent, color: "#000" }}>
      {src ? <img src={src} alt="" /> : initials(c.name)}
    </span>
  );
}

export function PersonAvatar({ name, picture, size = 24 }: { name: string; picture?: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {picture ? <img src={picture} alt="" /> : initials(name) || "?"}
    </span>
  );
}

export function useSpeech() {
  return useSyncExternalStore(speech.subscribe, speech.get, speech.get);
}

export function Sensitive({ label = "Sensitive" }: { label?: string }) {
  return <span className="tag-sensitive">{label}</span>;
}

/** Asks for informed consent before a feature that could share something. */
export function RiskDialog({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const f = FEATURES.find((x) => x.id === feature)!;
  const [read, setRead] = useState(false);
  const privacy = useDesk((s) => s.privacy);
  const yes = () => {
    desk().set({ privacy: { ...privacy, consents: { ...privacy.consents, [feature]: true } } });
    desk().log(`Opted in: ${f.label}.`);
    onClose();
  };
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={f.label}>
        <h2>
          {f.label} <Sensitive />
        </h2>
        <p className="muted">{f.why}</p>
        <div className="note warn">
          <b>What this shares</b>
          <p style={{ marginTop: 6, marginBottom: 0 }}>{f.risk}</p>
        </div>
        {privacy.mode === "conditional" ? (
          <p className="small muted" style={{ marginTop: 10 }}>
            Privacy is Conditional, so this will only run between {privacy.hours.from} and {privacy.hours.to}.
          </p>
        ) : null}
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
          <span>I've read what this shares and I want to turn it on. I can turn it off again in Settings → Privacy.</span>
        </label>
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Keep it off
          </button>
          <button className="btn primary" disabled={!read} onClick={yes}>
            Turn it on
          </button>
        </div>
      </div>
    </div>
  );
}

export function Confirm({ title, body, yes, onYes, onClose, danger }: { title: string; body: ReactNode; yes: string; onYes: () => void; onClose: () => void; danger?: boolean }) {
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="muted">{body}</div>
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? "danger" : "primary"}`}
            onClick={() => {
              onYes();
              onClose();
            }}
          >
            {yes}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.id)} role="radio" aria-checked={value === o.id} className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function timeOf(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
