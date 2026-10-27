// PDA SEASIDE host bridge: runs in Vector's hidden window, relays the desktop's calls into Vector's engine and
// the events the desktop asks for back. It talks only to the desktop's bridge address, with its token.
(() => {
  const cfg = window.__PDA_BRIDGE__;
  if (!cfg) return;
  const T = window.__TAURI__;
  const q = `?t=${encodeURIComponent(cfg.token)}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const subs = new Map();
  const out = [];
  let sending = false;

  const b64 = (u8) => {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  // bytes travel as base64, both ways
  const enc = (v) =>
    v instanceof ArrayBuffer ? { __b64: b64(new Uint8Array(v)) } : ArrayBuffer.isView(v) ? { __b64: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) } : v;
  const dec = (v) => (v && typeof v === "object" && typeof v.__b64 === "string" ? unb64(v.__b64) : v);

  async function flush() {
    if (sending || !out.length) return;
    sending = true;
    const batch = out.splice(0);
    try {
      // text/plain: a simple request, so no preflight
      await fetch(`${cfg.url}/reply${q}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(batch) });
    } catch {
      out.unshift(...batch);
      await sleep(1000);
    }
    sending = false;
    flush();
  }
  const send = (m) => {
    out.push(m);
    flush();
  };

  async function handle(m) {
    try {
      if (m.sub) {
        if (!subs.has(m.sub)) subs.set(m.sub, await T.event.listen(m.sub, (e) => send({ event: m.sub, payload: e.payload })));
        return;
      }
      if (m.emit) return void (await T.event.emit(m.emit, m.payload));
      send({ id: m.id, ok: enc(await T.core.invoke(m.cmd, dec(m.args ?? {}))) });
    } catch (e) {
      if (m.id != null) send({ id: m.id, err: typeof e === "string" ? e : e?.message ?? String(e) });
    }
  }

  (async () => {
    for (;;) {
      try {
        const r = await fetch(`${cfg.url}/next${q}`);
        // the desktop no longer knows this run (it restarted, or started another): nothing left to serve
        if (r.status === 403) return void (await T.process.exit(0));
        if (!r.ok) throw new Error(String(r.status));
        for (const m of await r.json()) handle(m);
      } catch {
        await sleep(1500);
      }
    }
  })();
})();
