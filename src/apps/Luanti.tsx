import { useEffect, useState } from "react";
import { Copy, Download, ExternalLink, Globe, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import { copyText } from "../lib/clipboard.ts";
import { fileApi, pickInExplorer } from "../lib/explorer.ts";
import { askText, askUser } from "../ui/Ask.tsx";
import { desk } from "../lib/store.ts";

type Saved = { id: string; name: string; address: string; port: number; note: string };
type Status = { servers: Saved[]; program: string; picked: boolean; platform: string; canLaunch: boolean };
type Web = {
  installed: { tag: string; made: string; sha256: string } | null;
  busy: { step: string; done: number; total: number } | null;
  latest?: { tag: string; made: string; size: number } | null;
  canInstall: boolean;
};
type Public = { name: string; description: string; address: string; port: number; game: string; version: string; players: number; max: number; url: string };

const NAME_KEY = "pdd-luanti-name";
const myName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `The desktop answered ${r.status}.`);
  return j as T;
}

/** Luanti: the family's servers (Cryptechtest first), the public list, and the real Luanti program on the desktop's
 *  computer, started straight into a server. Phones and tablets use the Luanti app with the same address. */
export function LuantiApp() {
  const [s, setS] = useState<Status | null>(null);
  const [name, setName] = useState(myName());
  const [note, setNote] = useState("");
  const [find, setFind] = useState("");
  const [pub, setPub] = useState<Public[] | null>(null);
  const [web, setWeb] = useState<Web | null>(null);
  const load = () => void call<Status>("/api/luanti").then(setS, (e) => setNote(e instanceof Error ? e.message : String(e)));
  const loadWeb = (check = false) => void call<Web>(`/api/luanti/web${check ? "?check=1" : ""}`).then(setWeb, () => setWeb(null));
  useEffect(load, []);
  useEffect(() => loadWeb(true), []);
  // while it's being fetched, show how far along it is
  useEffect(() => {
    if (!web?.busy) return;
    const t = window.setTimeout(() => loadWeb(), 800);
    return () => window.clearTimeout(t);
  }, [web]);
  // the client runs only where the page is cross-origin isolated, which needs a secure address
  const secure = window.isSecureContext;
  const playInside = (sv?: Saved) => {
    if (sv && !nameOk) return setNote("First, your name in Luanti (letters, numbers, - and _, up to 20).");
    const q = sv ? `?address=${encodeURIComponent(sv.address)}&port=${sv.port}&name=${encodeURIComponent(name)}&go` : "";
    window.open(`/luanti-web/play${q}`, "_blank");
    if (sv) setNote(`Luanti is opening in its own tab, joining ${sv.name} as ${name}. It asks for your password there (or to register, the first time).`);
  };
  const setUp = () =>
    void run(async () => {
      setWeb((w) => (w ? { ...w, busy: { step: "Looking for the newest build…", done: 0, total: 0 } } : w));
      const p = call<Web>("/api/luanti/web", {});
      window.setTimeout(() => loadWeb(), 500);
      setWeb({ ...(await p), canInstall: true });
      desk().say("Luanti for the browser is ready.");
    }).finally(() => loadWeb());

  const run = async (f: () => Promise<unknown>) => {
    try {
      setNote("");
      await f();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  const keepName = (n: string) => {
    setName(n);
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* this browser keeps nothing: asked again next time */
    }
  };
  const nameOk = /^[A-Za-z0-9_-]{1,20}$/.test(name);

  const play = (sv: Saved) =>
    void run(async () => {
      if (!nameOk) throw new Error("First, your name in Luanti (letters, numbers, - and _, up to 20).");
      await call("/api/luanti", { op: "launch", address: sv.address, port: sv.port, name });
      setNote(`Luanti is starting on this computer, joining ${sv.name} as ${name}. It asks for your password there (or to register, the first time).`);
    });
  const edit = (sv?: Saved) =>
    void run(async () => {
      const address = await askText(sv ? `${sv.name}: address` : "The server's address", sv ? `${sv.address}:${sv.port}` : "", { placeholder: "cryptechcraft.xyz:30000", yes: "Next" });
      if (!address) return;
      const m = /^(.*?)(?::(\d+))?$/.exec(address.trim());
      const label = await askText("What to call it", sv?.name ?? m?.[1] ?? "", { yes: "Save" });
      if (label === null) return;
      setS({ ...(await call<Status>("/api/luanti", { op: "save-server", id: sv?.id, name: label, address: m?.[1], port: Number(m?.[2] || 30000), note: sv?.note ?? "" })), canLaunch: s?.canLaunch ?? false });
      load();
    });
  const remove = (sv: Saved) =>
    void askUser(`Remove ${sv.name}?`, "It leaves this list (on every device using this desktop). Its world and your account there aren't touched.", "Remove", "Keep it").then(
      (yes) => yes && void run(async () => (await call("/api/luanti", { op: "remove-server", id: sv.id }), load())),
    );
  const chooseProgram = () =>
    void run(async () => {
      const ov = await fileApi.overview();
      if (!ov.wholePc.on) {
        const yes = await askUser(
          "Let Explorer reach this whole computer?",
          "Luanti's program is outside the desktop's own places, so Explorer needs its whole-computer switch to find it. It applies only on this computer itself. You can turn it off again in Explorer once Luanti is chosen.",
          "Turn it on",
          "Not now",
        );
        if (!yes) return;
        await fileApi.setWholePc(true);
      }
      const win = s?.platform === "win32";
      const picked = await pickInExplorer({ mode: "open", title: "Choose Luanti's program (luanti.exe)", filters: win ? [{ name: "Programs", extensions: ["exe"] }] : undefined, start: win ? "C:\\Program Files" : s?.platform === "darwin" ? "/Applications" : "/usr/bin" });
      if (picked?.[0]) (await call("/api/luanti", { op: "set-program", path: picked[0] }), load());
    });
  const search = () => void run(async () => setPub((await call<{ servers: Public[] }>("/api/luanti/public")).servers));
  const shown = (pub ?? []).filter((p) => !find.trim() || `${p.name} ${p.description} ${p.game} ${p.address}`.toLowerCase().includes(find.trim().toLowerCase())).sort((a, b) => b.players - a.players).slice(0, 60);

  if (!s) return <div className="luanti small faint" style={{ padding: 14 }}>{note || "Loading…"}</div>;
  return (
    <div className="luanti">
      <section className="luanti-me">
        <p className="small muted" style={{ margin: 0 }}>
          Luanti is the open-source voxel game engine (formerly Minetest). Your servers are kept on the desktop for the whole family; your name is kept on this
          device.
        </p>
        <label className="field" style={{ maxWidth: 300, marginTop: 8 }}>
          <span>Your name in Luanti</span>
          <input className="input" value={name} placeholder="letters, numbers, - and _" onChange={(e) => keepName(e.target.value.trim())} aria-invalid={Boolean(name) && !nameOk} />
        </label>
      </section>

      <h4>Servers</h4>
      <ul className="luanti-list">
        {s.servers.map((sv) => (
          <li key={sv.id}>
            <div className="luanti-srv">
              <b>{sv.name}</b>
              <span className="small faint">
                {sv.address}:{sv.port}
                {sv.note ? ` · ${sv.note}` : ""}
              </span>
            </div>
            <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
              {web?.installed ? (
                <button className="btn small primary" disabled={!secure} onClick={() => playInside(sv)} title={secure ? "The real Luanti, in its own tab" : "Needs SEASIDE's secure (https) address"}>
                  <Globe size={13} /> Play in SEASIDE
                </button>
              ) : null}
              {s.canLaunch ? (
                <button className={`btn small${web?.installed ? "" : " primary"}`} disabled={!s.program} onClick={() => play(sv)} title={s.program ? undefined : "Luanti isn't installed on this computer yet"}>
                  <Play size={13} /> Play on this computer
                </button>
              ) : null}
              <button className="btn small ghost" onClick={() => void copyText(`${sv.address}:${sv.port}`).then(() => desk().say(`Copied ${sv.address}:${sv.port}`))}>
                <Copy size={13} /> Copy address
              </button>
              <button className="icon-btn" aria-label={`Change ${sv.name}`} data-tip="Change" onClick={() => edit(sv)}>
                <Pencil size={13} />
              </button>
              <button className="icon-btn" aria-label={`Remove ${sv.name}`} data-tip="Remove" onClick={() => remove(sv)}>
                <Trash2 size={13} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn small" onClick={() => edit()}>
        <Plus size={13} /> Add a server
      </button>

      <h4>How to play</h4>
      <ul className="small luanti-how">
        <li>
          <b>On the desktop's computer:</b>{" "}
          {s.program ? (
            <>
              Luanti is ready ({s.program}). “Play on this computer” starts it and joins.{" "}
              {s.canLaunch ? (
                <button className="btn small ghost" onClick={() => void run(async () => (await call("/api/luanti", { op: "launch" }), setNote("Luanti is starting at its own menu.")))}>
                  Open Luanti's menu
                </button>
              ) : null}
            </>
          ) : (
            <>
              Luanti isn't installed yet. Get it from{" "}
              <a href="https://www.luanti.org/downloads/" target="_blank" rel="noopener">
                luanti.org <ExternalLink size={11} />
              </a>
              {s.canLaunch ? (
                <>
                  {" "}
                  and it's found by itself, or{" "}
                  <button className="btn small ghost" onClick={chooseProgram}>
                    choose it in Explorer…
                  </button>
                </>
              ) : null}
            </>
          )}
          {s.picked && s.canLaunch ? (
            <button className="btn small ghost" onClick={chooseProgram}>
              Choose another…
            </button>
          ) : null}
        </li>
        <li>
          <b>Other computers, phones and tablets:</b> the Luanti app (luanti.org, Google Play or F-Droid), then add the server with “Copy address”.
        </li>
        <li>
          <b>In SEASIDE, on every device:</b> the real Luanti client built for the browser, in its own tab, connecting through the desktop.{" "}
          {web?.installed ? (
            <>
              Ready (build {web.installed.tag.replace("luanti-web-", "")}).{" "}
              {!secure ? (
                <span className="warn-text">This device reaches SEASIDE at a plain-http address; open SEASIDE at its https (Tailscale) address to play here.</span>
              ) : (
                <button className="btn small ghost" onClick={() => playInside()}>
                  Open Luanti's menu here
                </button>
              )}
              {web.canInstall && web.latest && web.latest.tag !== web.installed.tag ? (
                <button className="btn small ghost" disabled={Boolean(web.busy)} onClick={setUp}>
                  <Download size={13} /> Get the newer build
                </button>
              ) : null}
            </>
          ) : web?.busy ? (
            <span>
              {web.busy.step}
              {web.busy.total ? ` ${Math.round((web.busy.done / web.busy.total) * 100)}% of ${Math.round(web.busy.total / 1048576)} MB` : ""}
            </span>
          ) : web?.canInstall ? (
            web.latest ? (
              <button className="btn small" onClick={setUp}>
                <Download size={13} /> Set it up ({Math.round(web.latest.size / 1048576)} MB, checked)
              </button>
            ) : (
              <span className="faint">GitHub is still building it (an hour or two the first time); check back soon.</span>
            )
          ) : (
            <span className="faint">It's set up on the desktop's own computer, once.</span>
          )}
        </li>
      </ul>

      <h4>Find servers</h4>
      <div className="row" style={{ gap: 6 }}>
        <input className="input" style={{ maxWidth: 280 }} value={find} placeholder="Name, game, description…" onChange={(e) => setFind(e.target.value)} onFocus={() => !pub && search()} />
        <button className="btn small" onClick={search}>
          <Search size={13} /> {pub ? "Refresh" : "Show the public list"}
        </button>
      </div>
      {pub ? (
        <ul className="luanti-list">
          {shown.map((p) => (
            <li key={`${p.address}:${p.port}`}>
              <div className="luanti-srv">
                <b>{p.name}</b>
                <span className="small faint">
                  {p.address}:{p.port} · {p.game || "game?"} · {p.players}/{p.max} playing · Luanti {p.version}
                </span>
                {p.description ? <span className="small muted luanti-desc">{p.description.replace(/\\(.)/g, "$1")}</span> : null}
              </div>
              <button
                className="btn small ghost"
                onClick={() => void run(async () => (await call("/api/luanti", { op: "save-server", name: p.name.replace(/\\(.)/g, "$1"), address: p.address, port: p.port, note: p.url }), load(), desk().say(`${p.name} saved.`)))}
              >
                <Plus size={13} /> Save
              </button>
            </li>
          ))}
          {!shown.length ? <li className="small faint">Nothing matches.</li> : null}
        </ul>
      ) : null}
      {note ? <div className="note small" style={{ marginTop: 10 }}>{note}</div> : null}
    </div>
  );
}
