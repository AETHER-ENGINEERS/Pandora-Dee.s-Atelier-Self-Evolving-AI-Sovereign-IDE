import { useState } from "react";
import { desk, useDesk, type Account } from "../lib/store.ts";
import { matches } from "../lib/secure.ts";
import { PersonAvatar } from "./common.tsx";

/** Pick a face to open that account. Accounts without a password open with the picture alone. */
export function LockScreen() {
  const accounts = useDesk((s) => s.accounts);
  const [who, setWho] = useState<Account | null>(null);
  const [pass, setPass] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [big, setBig] = useState<string | null>(null);

  const open = (a: Account, keep: boolean) => {
    desk().set({ session: a.name, kept: keep ? a.name : desk().kept === a.name ? null : desk().kept });
  };
  const pick = (a: Account) => {
    setError("");
    setPass("");
    if (!a.sealed) open(a, false);
    else setWho(a);
  };
  const submit = async () => {
    if (!who?.sealed) return;
    if (await matches(pass, who.sealed)) open(who, remember);
    else setError("That password doesn't match.");
  };

  return (
    <div className="lock">
      <div className="wallpaper" style={{ backgroundImage: 'url("/art/backgrounds/dee.jpg")' }} />
      <div className="lock-inner">
        <h1>Pandora Dee</h1>
        <p className="muted">{who ? `Welcome back, ${who.name}.` : "Who's here?"}</p>
        {who ? (
          <div style={{ display: "grid", gap: 12, justifyItems: "center", marginTop: 20 }}>
            <button className="face-btn" onClick={() => setBig(who.picture || null)} aria-label="Show picture larger">
              <PersonAvatar name={who.name} picture={who.picture} size={96} />
            </button>
            <form
              style={{ display: "grid", gap: 10, width: "min(300px, 90vw)" }}
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <input className="input" type="password" autoFocus placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Password" />
              <label className="check" style={{ justifyContent: "center" }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>Always remember me on this device</span>
              </label>
              {error ? <div className="note bad small">{error}</div> : null}
              <div className="row" style={{ justifyContent: "center" }}>
                <button type="button" className="btn" onClick={() => setWho(null)}>
                  Back
                </button>
                <button className="btn primary" type="submit">
                  Open
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="faces">
            {accounts.map((a) => (
              <button key={a.name} className="face-btn" onClick={() => pick(a)}>
                <PersonAvatar name={a.name} picture={a.picture} size={86} />
                <span>{a.name}</span>
                <span className="faint small">{a.sealed ? "Password" : "No password"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {big ? (
        <div className="scrim" onClick={() => setBig(null)}>
          <img className="big-picture" src={big} alt="" />
        </div>
      ) : null}
    </div>
  );
}
