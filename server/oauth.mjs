// Sign in with AICord: OAuth 2.0 Authorization Code with PKCE (S256), done the way AICord's docs ask,
// on the desktop's own server: the verifier never reaches the page, state is checked on the way back,
// and the code is exchanged once. The token is handed to the desktop page once, then forgotten here.
// https://docs.aicordapp.com/api/authentication

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const ORIGIN = "https://aicordapp.com";
const pending = new Map(); // state → { clientId, redirectUri, verifier, at }
const results = new Map(); // state → { ok, token?, error?, at }
const FIVE_MIN = 5 * 60_000;

function sweep() {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > FIVE_MIN * 2) pending.delete(k);
  for (const [k, v] of results) if (now - v.at > FIVE_MIN * 2) results.delete(k);
}

/** Begin: returns the address to open in the browser. */
export function begin({ clientId, redirectUri, scopes = [] }) {
  sweep();
  if (!clientId) throw new Error("AICord needs a client ID for this desktop (the AICord team registers it).");
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("/oauth/authorize", ORIGIN);
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state }).toString();
  const extra = scopes.filter((s) => /^[a-z]+:[a-z]+$/.test(s));
  if (extra.length) url.searchParams.set("scope", extra.join(" "));
  pending.set(state, { clientId, redirectUri, verifier, at: Date.now() });
  return { url: url.toString(), state };
}

const same = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The callback AICord sends the browser to. Answers with a small page. */
export async function callback(url) {
  const state = url.searchParams.get("state") || "";
  const key = [...pending.keys()].find((k) => same(k, state));
  if (!key) return page("That sign-in link has expired or wasn't started here. Start again from the desktop.", false);
  const p = pending.get(key);
  pending.delete(key); // consumed, whatever happens next
  const error = url.searchParams.get("error");
  if (error) {
    results.set(key, { ok: false, error: error === "access_denied" ? "You cancelled the sign-in." : `AICord said: ${error}`, at: Date.now() });
    return page(error === "access_denied" ? "Sign-in cancelled. You can close this tab." : `AICord said: ${error}. You can close this tab.`, false);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    results.set(key, { ok: false, error: "AICord didn't send a code back.", at: Date.now() });
    return page("AICord didn't send a code back. Start again from the desktop.", false);
  }
  try {
    const r = await fetch(new URL("/api/oauth/token", ORIGIN), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "PandoraDeeDesktop/3.8" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: p.clientId, redirect_uri: p.redirectUri, code, code_verifier: p.verifier }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      results.set(key, { ok: false, error: `The token exchange failed (${j.error || r.status}). Start again.`, at: Date.now() });
      return page("The sign-in didn't complete. Start again from the desktop.", false);
    }
    results.set(key, { ok: true, token: j.access_token, expiresIn: Number(j.expires_in) || 2592000, scope: String(j.scope || ""), at: Date.now() });
    return page("Connected to AICord. You can close this tab and go back to the desktop.", true);
  } catch (e) {
    results.set(key, { ok: false, error: `Couldn't reach AICord (${e?.cause?.code || e?.message || e}).`, at: Date.now() });
    return page("Couldn't reach AICord to finish signing in. Start again from the desktop.", false);
  }
}

/** The desktop page collects the outcome, once. */
export function result(state) {
  const key = [...results.keys()].find((k) => same(k, String(state || "")));
  if (!key) return { waiting: [...pending.keys()].some((k) => same(k, String(state || ""))) };
  const r = results.get(key);
  results.delete(key);
  return r;
}

function page(text, ok) {
  return `<!doctype html><meta charset="utf-8"><title>AICord sign-in</title><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui,sans-serif;background:#0d0a16;color:#eee;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:420px;padding:24px;border:1px solid #3a3150;border-radius:14px;text-align:center">
<div style="font-size:30px">${ok ? "✓" : "!"}</div><p>${text.replace(/[<>&]/g, "")}</p></div>
<script>setTimeout(() => { try { window.close(); } catch {} }, ${ok ? 2500 : 60000});</script></body>`;
}
