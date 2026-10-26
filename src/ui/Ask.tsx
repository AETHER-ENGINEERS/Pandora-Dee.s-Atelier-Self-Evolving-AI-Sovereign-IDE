import { useSyncExternalStore } from "react";

/** A question a tool needs answered before it goes on (trust an SSH host, run a command…). */
type Question = { id: number; title: string; body: string; yes: string; no: string; resolve: (ok: boolean) => void };

let queue: Question[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Ask the person at this computer. Resolves false if they decline (or after 5 minutes). */
export function askUser(title: string, body: string, yes = "Allow", no = "Don't allow"): Promise<boolean> {
  return new Promise((resolve) => {
    const q: Question = { id: ++seq, title, body, yes, no, resolve };
    queue = [...queue, q];
    emit();
    window.setTimeout(() => answer(q.id, false), 5 * 60_000);
  });
}

function answer(id: number, ok: boolean) {
  const q = queue.find((x) => x.id === id);
  if (!q) return;
  queue = queue.filter((x) => x.id !== id);
  emit();
  q.resolve(ok);
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
    <div className="scrim" style={{ zIndex: 99500 }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={q.title}>
        <h2>{q.title}</h2>
        <pre className="mono small" style={{ whiteSpace: "pre-wrap", background: "rgba(0,0,0,.35)", padding: 10, borderRadius: 8, maxHeight: 300, overflow: "auto" }}>
          {q.body}
        </pre>
        {list.length > 1 ? <p className="small faint">{list.length - 1} more waiting.</p> : null}
        <div className="actions">
          <button className="btn" onClick={() => answer(q.id, false)}>
            {q.no}
          </button>
          <button className="btn primary" autoFocus onClick={() => answer(q.id, true)}>
            {q.yes}
          </button>
        </div>
      </div>
    </div>
  );
}
