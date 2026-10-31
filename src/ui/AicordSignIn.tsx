import { useEffect, useRef, useState } from "react";
import { desk, useDesk } from "../lib/store.ts";
import type { Connection } from "../lib/model.ts";
import { Seg } from "./common.tsx";
import { copyText } from "../lib/clipboard.ts";

const EXTRA = [
  { id: "characters:read", label: "See the list of your characters" },
  { id: "skills:write", label: "Let characters use custom skills (AICord approves this per app)" },
];

/** AICord: an API key, or "Sign in with AICord" (OAuth with PKCE, done by the desktop's server). */
export function AicordSignIn({ c, patch }: { c: Connection; patch: (p: Partial<Connection>) => void }) {
  const env = useDesk((s) => s.env);
  const o = c.oauth ?? { clientId: "", scopes: [], tokenName: "AICORD_OAUTH_TOKEN" };
  const token = env[o.tokenName] ?? "";
  const expired = Boolean(o.expires && o.expires < Date.now());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  const redirect = `${location.origin}/oauth/aicord/callback`;
  useEffect(() => () => void (stop.current = true), []);
  const setO = (p: Partial<typeof o>) => patch({ oauth: { ...o, ...p } });

  const signIn = async () => {
    setBusy(true);
    setNote("Opening AICord's sign-in page…");
    stop.current = false;
    try {
      const r = await fetch("/api/oauth/aicord/start", { method: "POST", body: JSON.stringify({ clientId: o.clientId.trim(), redirectUri: redirect, scopes: o.scopes }) });
      const j = (await r.json()) as { url?: string; state?: string; error?: string };
      if (!j.url || !j.state) throw new Error(j.error || "Couldn't start signing in.");
      window.open(j.url, "_blank", "noopener");
      setNote("Finish signing in on AICord's page (it opened in a new tab). This waits up to 6 minutes.");
      const until = Date.now() + 6 * 60_000;
      while (!stop.current && Date.now() < until) {
        await new Promise((x) => setTimeout(x, 1500));
        const res = (await (await fetch(`/api/oauth/aicord/result?state=${encodeURIComponent(j.state)}`)).json()) as { waiting?: boolean; ok?: boolean; token?: string; expiresIn?: number; scope?: string; error?: string };
        if (res.waiting) continue;
        if (res.ok && res.token) {
          desk().set({ env: { ...desk().env, [o.tokenName]: res.token } });
          setO({ expires: Date.now() + (res.expiresIn ?? 2592000) * 1000, scope: res.scope ?? "" });
          setNote("Signed in.");
        } else setNote(res.error || "The sign-in didn't complete.");
        return;
      }
      if (!stop.current) setNote("Nothing came back in time. Start again.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="note small" style={{ marginTop: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>How to sign in to AICord</b>
        <Seg value={c.auth ?? "key"} onChange={(auth) => patch({ auth })} options={[{ id: "key", label: "API key" }, { id: "oauth", label: "Sign in with AICord" }]} />
      </div>
      {(c.auth ?? "key") === "key" ? (
        <p style={{ margin: "6px 0 0" }}>The key from AICord's dashboard (Settings → API Key), kept in Keys under the name above. This is what AICord's chat API takes today.</p>
      ) : (
        <>
          <p style={{ margin: "6px 0 8px" }}>
            You sign in on AICord's own page and approve this desktop; it never sees your AICord password. AICord's chat and character list still take API keys for now, so
            this is ready for when AICord switches them over. Sign-ins last 30 days.
          </p>
          <label className="field" style={{ marginBottom: 6 }}>
            <span>This desktop's client ID (the AICord team registers it, with the callback address below)</span>
            <input className="input mono" value={o.clientId} placeholder="from the AICord team" onChange={(e) => setO({ clientId: e.target.value })} />
          </label>
          <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 6 }}>
            <span className="muted">Callback address:</span>
            <span className="mono">{redirect}</span>
            <button className="btn small" onClick={() => void copyText(redirect).then((ok) => ok && desk().say("Callback address copied."))}>
              Copy
            </button>
          </div>
          <div style={{ marginBottom: 6 }}>
            <span className="muted">Always included: your account details, using your characters, and your cores. Also ask for:</span>
            {EXTRA.map((x) => (
              <label key={x.id} className="check" style={{ padding: "2px 0" }}>
                <input type="checkbox" checked={o.scopes.includes(x.id)} onChange={(e) => setO({ scopes: e.target.checked ? [...o.scopes, x.id] : o.scopes.filter((s) => s !== x.id) })} />
                <span>
                  {x.label} <span className="mono faint">{x.id}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn primary small" disabled={busy || !o.clientId.trim()} onClick={() => void signIn()}>
              {token && !expired ? "Sign in again" : "Sign in with AICord"}
            </button>
            {busy ? (
              <button className="btn small" onClick={() => (stop.current = true)}>
                Stop waiting
              </button>
            ) : null}
            {token ? (
              <button
                className="btn small"
                onClick={() => {
                  const next = { ...desk().env };
                  delete next[o.tokenName];
                  desk().set({ env: next });
                  setO({ expires: undefined, scope: undefined });
                  setNote("Signed out here. To revoke it on AICord too, use your AICord account settings.");
                }}
              >
                Sign out
              </button>
            ) : null}
            <span className={token && !expired ? "" : "faint"} style={{ color: token && !expired ? "var(--good)" : undefined }}>
              {token
                ? expired
                  ? "The sign-in has expired: sign in again."
                  : `Signed in until ${new Date(o.expires ?? 0).toLocaleDateString()}${o.scope ? ` · ${o.scope}` : ""}`
                : "Not signed in."}
            </span>
          </div>
          {note ? <div style={{ marginTop: 6 }}>{note}</div> : null}
        </>
      )}
    </div>
  );
}
