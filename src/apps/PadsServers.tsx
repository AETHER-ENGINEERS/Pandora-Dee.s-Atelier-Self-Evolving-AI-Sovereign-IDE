import { useEffect, useState } from "react";
import { Copy, Link2, Server as ServerIcon, Unlink } from "lucide-react";
import { padsApi, type Server, type ServersInfo } from "../lib/pads.ts";
import { askText, askUser } from "../ui/Ask.tsx";
import { copyText } from "../lib/clipboard.ts";
import { desk } from "../lib/store.ts";

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 90 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
};

/** PADS across devices that each run their own SEASIDE server: this server, the ones linked with it, and linking. */
export function LinkedServers({ live }: { live: Server[] }) {
  const [info, setInfo] = useState<ServersInfo | null>(null);
  const [invite, setInvite] = useState<{ code: string; expires: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // a server without linking yet (not restarted since) answers without its details: then there's nothing to show
  const load = () => void padsApi.servers().then((i) => setInfo(i?.me ? i : null), () => undefined);
  // again whenever the linked servers change (linked or unlinked here, or there)
  const known = live.map((s) => s.id).join();
  useEffect(load, [known]);
  if (!info?.me) return null;

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      desk().say(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      load();
    }
  };
  const rename = () =>
    void askText("This server's name", info.me.name, { body: "How it shows on your other servers and devices.", yes: "Rename" }).then(
      (name) => {
        if (name) void run(() => padsApi.serverOp({ op: "rename", name }));
      },
    );
  const makeInvite = () => run(async () => setInvite(await padsApi.serverOp<{ code: string; expires: number }>({ op: "invite" })));
  const link = async () => {
    const address = await askText("The other server's address", "http://", {
      body: "As it shows under “Invite a server” on that server's own computer, like http://192.168.1.20:15693",
      placeholder: "http://192.168.1.20:15693",
      yes: "Next",
    });
    if (!address) return;
    const code = await askText("Its invite code", "", { body: "From “Invite a server” there. It starts with pdl_ and works once, for 15 minutes.", placeholder: "pdl_…", yes: "Next" });
    if (!code) return;
    const yes = await askUser(
      "Link the two servers?",
      "Each will see the devices signed into the same account on the other (their names, screens and what's open, while PADS is on there), and things can be sent between them: to a device, or into the other's vault. Files and everything else stay where they are. Either side can unlink at any time.",
      "Link them",
      "Not now",
    );
    if (yes) await run(async () => desk().say(`Linked with ${(await padsApi.serverOp<{ name: string }>({ op: "link", address, code })).name}.`));
  };
  const unlink = (id: string, name: string) =>
    void askUser(`Unlink ${name}?`, "This server stops showing its devices and stops accepting things from it. Unlink it there too, or it will show this server as unreachable.", "Unlink", "Keep it").then(
      (yes) => {
        if (yes) void run(() => padsApi.serverOp({ op: "unlink", id }));
      },
    );

  return (
    <section className="pads-servers small">
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <ServerIcon size={14} />
        <b>Servers</b>
        <span className="faint">
          This one: {info.me.name}
          {info.canChange ? (
            <>
              {" "}
              <button className="btn small ghost" style={{ padding: "0 6px" }} onClick={rename}>
                rename
              </button>
            </>
          ) : null}
        </span>
        <span style={{ flex: 1 }} />
        {info.canChange ? (
          <>
            <button className="btn small ghost" disabled={busy} onClick={() => void makeInvite()}>
              Invite a server
            </button>
            <button className="btn small" disabled={busy} onClick={() => void link()}>
              <Link2 size={13} /> Link to a server…
            </button>
          </>
        ) : null}
      </div>
      {invite ? (
        <div className="pads-invite">
          <div>
            On the other server's own computer: PADS → <b>Link to a server…</b>, then give it one of these addresses and the code (it works once, until{" "}
            {new Date(invite.expires).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}).
          </div>
          <div className="faint">{info.addresses.filter((a) => !a.includes("localhost")).join("  ·  ") || info.addresses.join("  ·  ")}</div>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <code className="pads-code">{invite.code}</code>
            <button className="icon-btn" aria-label="Copy the code" data-tip="Copy the code" onClick={() => void copyText(invite.code)}>
              <Copy size={13} />
            </button>
          </div>
          {!info.lan ? <div className="warn-text">This server isn't shared on the network yet, so other computers can't reach it.</div> : null}
        </div>
      ) : null}
      {info.servers.length ? (
        <ul className="pads-list">
          {info.servers.map((p) => {
            const l = live.find((s) => s.id === p.id);
            return (
              <li key={p.id}>
                <span className={`pads-dot${l?.here ? " on" : ""}`} />
                <b>{p.name}</b>
                <span className="faint" title={l?.error || undefined}>
                  {p.url} · {l?.here ? "reachable" : l?.error ? `not reachable: ${l.error}` : `last answered ${ago(p.seen)}`}
                </span>
                <span style={{ flex: 1 }} />
                {info.canChange ? (
                  <button className="btn small ghost" disabled={busy} onClick={() => unlink(p.id, p.name)}>
                    <Unlink size={13} /> Unlink
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="faint" style={{ margin: "2px 0 0" }}>
          Each device can run its own SEASIDE server. Link them here and PADS shows every device on all of them, and “Send to” reaches them all.
          {info.canChange ? "" : " Linking is done on each server's own computer."}
        </p>
      )}
    </section>
  );
}
