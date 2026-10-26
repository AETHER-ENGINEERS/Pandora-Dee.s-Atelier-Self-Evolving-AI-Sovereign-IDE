import { desk } from "../lib/store.ts";
import { snippet, VIA_OPTIONS, type Snippet, type Via } from "../lib/outbound.ts";
import { openMenuAt } from "./ContextMenu.tsx";

export type SampleRequest = { url: string; method: string; headers: Record<string, string>; body?: string };

/**
 * How requests to one service are sent, with a way to copy the request as cURL, Python,
 * JavaScript or plain HTTP (keys appear as their name, never their value).
 */
export function ViaPicker({ value, onChange, inherit, sample, label = "Connection method" }: { value?: Via; onChange: (v: Via | undefined) => void; inherit?: string; sample?: () => SampleRequest; label?: string }) {
  const current = value ?? (inherit ? "" : "desktop");
  const hint = VIA_OPTIONS.find((o) => o.id === (value ?? (inherit ? desk().net.via : "desktop")))?.hint;
  const copy = (kind: Snippet) => {
    const r = sample?.();
    if (!r) return;
    const secrets = Object.fromEntries(Object.entries(desk().env).filter(([, v]) => v && v.length >= 4));
    void navigator.clipboard?.writeText(snippet(kind, r.url, r, secrets)).then(() => desk().say(`Copied the request as ${kind === "js" ? "JavaScript" : kind === "http" ? "HTTP" : kind === "curl" ? "cURL" : "Python"}. Keys are written as their name.`));
  };
  return (
    <div className="field via-field" style={{ marginBottom: 0 }}>
      <span>{label}</span>
      <div className="row" style={{ gap: 6 }}>
        <select className="select grow" value={current} onChange={(e) => onChange((e.target.value || undefined) as Via | undefined)}>
          {inherit ? <option value="">{inherit}</option> : null}
          {VIA_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {sample ? (
          <button
            className="btn small"
            onClick={(e) =>
              openMenuAt(e.currentTarget, [
                { heading: "Copy the request as" },
                { label: "cURL", run: () => copy("curl") },
                { label: "Python", run: () => copy("python") },
                { label: "JavaScript (fetch)", run: () => copy("js") },
                { label: "HTTP", run: () => copy("http") },
              ])
            }
          >
            Copy as…
          </button>
        ) : null}
      </div>
      {hint ? <span className="small faint">{hint}</span> : null}
    </div>
  );
}
