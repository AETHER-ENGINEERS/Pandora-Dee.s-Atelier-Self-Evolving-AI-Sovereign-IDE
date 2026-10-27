import { useEffect, useState } from "react";

/**
 * Where a server answers: an address you type (an IP, a name, or an outside service's https address). When it
 * still says macbook.local (a preset name many networks don't resolve) and the desktop knows the Mac's address
 * from its setup, one click puts that in.
 */
export function AddressField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [mac, setMac] = useState("");
  const local = /macbook\.local/i.test(value);
  useEffect(() => {
    if (!local) return;
    fetch("/api/mac")
      .then((r) => r.json())
      .then((j: { address?: string }) => setMac(j.address ?? ""))
      .catch(() => undefined);
  }, [local]);
  return (
    <label className="mini-field grow">
      <span>Address</span>
      <input className="input mono" value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder ?? "http://100.x.x.x:15666 or https://…"} spellCheck={false} />
      {local ? (
        <span className="small warn-text">
          “macbook.local” often doesn't work: type the computer's address (its Tailscale IP, say) or a service's address.
          {mac ? (
            <>
              {" "}
              <button type="button" className="btn small" onClick={() => onChange(value.replace(/macbook\.local/i, mac))}>
                Use the Mac's address ({mac})
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}

/** Ask for the address when adding an engine (pre-filled with the best guess), or null if cancelled. */
export function askAddress(name: string, guess: string): string | null {
  const v = prompt(`Where does ${name} answer? Type its address: an IP or name with the port (e.g. http://100.109.22.103:15666), or an online service's https address.`, guess);
  return v === null ? null : v.trim() || guess;
}
