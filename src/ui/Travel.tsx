import { useEffect, useState } from "react";
import { desk, useDesk, type Account } from "../lib/store.ts";
import { bringHere, setTravels, travellers, type Traveller } from "../lib/travel.ts";
import { PersonAvatar } from "./common.tsx";

/** The switch on an account: its desktop travels to the person's other devices, or stays on this one. */
export function TravelSwitch({ account }: { account: Account }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  return (
    <label className="check small" style={{ gridColumn: "2 / -1", marginTop: -4 }}>
      <input
        type="checkbox"
        checked={Boolean(account.travels)}
        disabled={busy}
        onChange={(e) => {
          const on = e.target.checked;
          setBusy(true);
          setNote("");
          void setTravels(account.name, on)
            .then(() => setNote(on ? "Kept on this desktop's server now: sign in from your other devices to pick it up." : "Not travelling any more; the copy on the server is gone."))
            .catch((err: Error) => setNote(err.message))
            .finally(() => setBusy(false));
        }}
      />
      <span>
        Travels to my other devices
        <span className="faint">
          {" "}
          (the desktop as you leave it: characters, settings, windows, the open chat. Kept on this desktop's server, not encrypted for now, so anyone who can
          open the desktop could read it; Keys and passcodes stay on each device)
        </span>
        {note ? <span className="muted"> · {note}</span> : null}
      </span>
    </label>
  );
}

/** Accounts that travel and aren't on this device yet (or are, to pick up again): pick one to bring it here. */
export function FromOtherDevices({ compact = false }: { compact?: boolean }) {
  const here = useDesk((s) => s.accounts);
  const [list, setList] = useState<Traveller[]>([]);
  const [who, setWho] = useState<Traveller | null>(null);
  const [pass, setPass] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    void travellers().then(setList, () => setList([]));
  }, []);
  const shown = list.filter((t) => !here.some((a) => a.name.toLowerCase() === t.name.toLowerCase() && a.travels));
  if (!shown.length) return null;
  const bring = async (t: Traveller, password = "") => {
    setNote("");
    try {
      await bringHere(t.name, password);
      desk().say(`Welcome, ${t.name}: here's your desktop as you left it.`);
      setWho(null);
      setPass("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div style={{ marginTop: compact ? 18 : 16 }}>
      <h4 style={{ margin: "0 0 6px" }}>From your other devices</h4>
      <div className="faces" style={compact ? undefined : { justifyContent: "flex-start" }}>
        {shown.map((t) => (
          <button key={t.name} className="face-btn" onClick={() => (t.password ? (setWho(t), setPass(""), setNote("")) : void bring(t))} title={`Last saved ${new Date(t.at).toLocaleString()} on ${t.device.split(" · ")[0]}`}>
            <PersonAvatar name={t.name} picture={t.picture} size={compact ? 64 : 44} />
            <span>{t.name}</span>
            <span className="faint small">{t.device.split(" · ")[0]}</span>
          </button>
        ))}
      </div>
      {who ? (
        <form
          className="row"
          style={{ marginTop: 8, justifyContent: compact ? "center" : undefined }}
          onSubmit={(e) => {
            e.preventDefault();
            void bring(who, pass);
          }}
        >
          <input className="input" type="password" autoFocus style={{ maxWidth: 220 }} placeholder={`${who.name}'s password`} value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Password" />
          <button className="btn primary">Bring it here</button>
          <button type="button" className="btn" onClick={() => setWho(null)}>
            Cancel
          </button>
        </form>
      ) : null}
      {note ? <div className="note bad small" style={{ marginTop: 6 }}>{note}</div> : null}
    </div>
  );
}
