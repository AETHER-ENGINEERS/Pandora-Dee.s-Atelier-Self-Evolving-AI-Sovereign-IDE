import { useState } from "react";
import { APPS, desk, inToddler, useDesk } from "../lib/store.ts";
import { matches } from "../lib/secure.ts";
import { stopAll } from "../lib/agent.ts";

/** Turn toddler mode on: AI stops, the adult shelf locks, and only the toddler apps stay open. Needs a passcode to exist,
 *  since the passcode is what turns it off again. */
export function startToddler(): string {
  const s = desk();
  if (!s.adult) return "Set the adult passcode first (Settings → Adult shelf): it's what turns toddler mode off.";
  stopAll();
  const wins = { ...s.wins };
  for (const a of APPS) if (!inToddler(a.id) && wins[a.id].open) wins[a.id] = { ...wins[a.id], open: false };
  s.set({
    toddler: true,
    classic: false,
    adultOpen: false,
    sensorPass: false,
    wins,
    members: s.members.filter((id) => s.character(id)?.shelf !== "adult"),
  });
  return "";
}

/** The status-bar pill while toddler mode is on; the passcode turns it off. */
export function ToddlerPill() {
  const on = useDesk((s) => s.toddler);
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  if (!on) return null;
  const close = () => {
    setAsking(false);
    setCode("");
    setNote("");
  };
  const tryCode = async () => {
    const sealed = desk().adult;
    let ok = false;
    try {
      ok = Boolean(sealed && ((await matches(code.normalize("NFC"), sealed)) || (await matches(code, sealed))));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e)); // e.g. a plain-http address, where browsers can't check passcodes
      return;
    }
    if (ok) {
      desk().set({ toddler: false });
      close();
      desk().say("Toddler mode is off. The AI is back.");
    } else {
      setNote("That passcode doesn't match.");
      setCode("");
    }
  };
  return (
    <>
      <button className="pill good" onClick={() => setAsking(true)} data-tip="Media, games and notes, with the AI resting. Click to turn it off (passcode).">
        🧸 Toddler mode
      </button>
      {asking ? (
        <div className="scrim" style={{ zIndex: 99500 }} onClick={(e) => e.target === e.currentTarget && close()}>
          <form
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Turn off toddler mode"
            onSubmit={(e) => {
              e.preventDefault();
              void tryCode();
            }}
          >
            <h2>Turn off toddler mode</h2>
            <p className="small">The adult passcode brings back the AI and every app.</p>
            <input className="input" type="password" autoFocus placeholder="Passcode" value={code} onChange={(e) => setCode(e.target.value)} />
            {note ? <p className="small" style={{ color: "var(--bad)" }}>{note}</p> : null}
            <div className="actions">
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button className="btn primary">Turn it off</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
