import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** A question a tool needs answered before it goes on (trust an SSH host, run a command…), or a line of text to
 *  type (a name, an address): the desktop's own dialog, never the browser's, which pauses music and animations. */
type Question = {
  id: number;
  title: string;
  body: string;
  yes: string;
  no: string;
  /** a text box, with what it starts with */
  text?: { value: string; placeholder?: string };
  resolve: (answer: boolean | string | null) => void;
};

let queue: Question[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Ask the person at this computer. Resolves false if they decline (or after 5 minutes). */
export function askUser(title: string, body: string, yes = "Allow", no = "Don't allow"): Promise<boolean> {
  return new Promise((resolve) => {
    const q: Question = { id: ++seq, title, body, yes, no, resolve: (a) => resolve(a === true) };
    queue = [...queue, q];
    emit();
    window.setTimeout(() => answer(q.id, false), 5 * 60_000);
  });
}

/** Ask for a line of text (in place of the browser's prompt()). Resolves the text, or null if cancelled. */
export function askText(title: string, value = "", opts: { body?: string; placeholder?: string; yes?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const q: Question = {
      id: ++seq,
      title,
      body: opts.body ?? "",
      yes: opts.yes ?? "OK",
      no: "Cancel",
      text: { value, placeholder: opts.placeholder },
      resolve: (a) => resolve(typeof a === "string" ? a : null),
    };
    queue = [...queue, q];
    emit();
  });
}

function answer(id: number, a: boolean | string | null) {
  const q = queue.find((x) => x.id === id);
  if (!q) return;
  queue = queue.filter((x) => x.id !== id);
  emit();
  q.resolve(a);
}

function TextAnswer({ q }: { q: Question }) {
  const [value, setValue] = useState(q.text?.value ?? "");
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        answer(q.id, value);
      }}
    >
      <input
        ref={box}
        className="input"
        value={value}
        placeholder={q.text?.placeholder}
        aria-label={q.title}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), answer(q.id, null))}
      />
      <div className="actions">
        <button type="button" className="btn" onClick={() => answer(q.id, null)}>
          {q.no}
        </button>
        <button className="btn primary">{q.yes}</button>
      </div>
    </form>
  );
}

export function AskHost() {
  const list = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => queue,
    () => queue,
  );
  const q = list[0];
  if (!q) return null;
  return (
    <div className="scrim" style={{ zIndex: 99500 }} onPointerDown={(e) => q.text && e.target === e.currentTarget && answer(q.id, null)}>
      <div className="dialog" role={q.text ? "dialog" : "alertdialog"} aria-modal="true" aria-label={q.title}>
        <h2>{q.title}</h2>
        {q.text ? (
          <>
            {q.body ? <p className="small muted">{q.body}</p> : null}
            <TextAnswer key={q.id} q={q} />
          </>
        ) : (
          <>
            <pre className="mono small" style={{ whiteSpace: "pre-wrap", background: "rgba(0,0,0,.35)", padding: 10, borderRadius: 8, maxHeight: 300, overflow: "auto" }}>
              {q.body}
            </pre>
            {list.length > 1 ? <p className="small faint">{list.length - 1} more waiting.</p> : null}
            <div className="actions">
              {q.no ? (
                <button className="btn" onClick={() => answer(q.id, false)}>
                  {q.no}
                </button>
              ) : null}
              <button className="btn primary" autoFocus onClick={() => answer(q.id, true)}>
                {q.yes}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
