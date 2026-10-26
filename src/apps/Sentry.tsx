import { useState } from "react";
import { desk, useDesk } from "../lib/store.ts";
import { FLOOD_RULES, type Role } from "../lib/flood.ts";
import { allowed } from "../lib/privacy.ts";
import { matches } from "../lib/secure.ts";
import { receive } from "../lib/agent.ts";
import { RiskDialog, Seg, Sensitive } from "../ui/common.tsx";
import type { Source } from "../lib/room.ts";

const ROLES: { id: Role; label: string }[] = [
  { id: "keyholder", label: "Keyholder" },
  { id: "resident", label: "Residents" },
  { id: "general", label: "Everyone else" },
];

export function SentryApp() {
  const s = useDesk();
  const keyholder = s.role() === "keyholder";
  const [risk, setRisk] = useState(false);
  const [pass, setPass] = useState("");
  const [passNote, setPassNote] = useState("");
  const [testFrom, setTestFrom] = useState<Exclude<Source, "desk">>("discord");
  const [testName, setTestName] = useState("Visitor");
  const [testText, setTestText] = useState("hello?");
  const sensorsOk = allowed(s.privacy, "sensors");
  const gateOpen = s.adultOpen || s.sensorPass;

  return (
    <div className="section">
      <h2>Flood gate</h2>
      <p className="lead small">
        Paces what reaches the characters so their effort (and your tokens) isn't spent answering everything at once. A burst of messages, the same message again and again, or one
        huge paste (often just someone sharing enthusiastically) shuts the gate: the characters rest, and only the keyholder can wake them until the keyholder reopens it.
      </p>
      <div className="row" style={{ marginBottom: 10 }}>
        {s.flood.shut ? <span className="pill bad">Shut</span> : s.flood.armed ? <span className="pill good">On guard</span> : <span className="pill warn">Off</span>}
        {s.flood.shut ? <span className="small">{s.flood.reason}</span> : null}
        <span className="grow" />
        {s.flood.shut ? (
          <button className="btn primary" disabled={!keyholder} onClick={() => desk().reopenGate()}>
            Reopen the gate
          </button>
        ) : null}
      </div>
      <label className="check">
        <input type="checkbox" checked={s.flood.armed} disabled={!keyholder} onChange={(e) => desk().set({ flood: { ...s.flood, armed: e.target.checked } })} />
        <span>
          Watch for floods (recommended). It shuts on {FLOOD_RULES.join("; ")}.{!keyholder ? " Only the keyholder can change this." : ""}
        </span>
      </label>
      <h4 style={{ marginTop: 16 }}>Who can wake the characters</h4>
      {(["desk", "discord", "vector"] as Source[]).map((src) => (
        <div key={src} className="row" style={{ marginBottom: 8 }}>
          <span style={{ width: 90 }}>{src === "desk" ? "This desktop" : src === "discord" ? "Discord" : "Vector"}</span>
          {ROLES.map((r) => (
            <label key={r.id} className="check" style={{ padding: 0 }}>
              <input
                type="checkbox"
                checked={r.id === "keyholder" || s.wake[src].includes(r.id)}
                disabled={!keyholder || r.id === "keyholder"}
                onChange={(e) => {
                  const list = new Set(s.wake[src]);
                  if (e.target.checked) list.add(r.id);
                  else list.delete(r.id);
                  desk().set({ wake: { ...s.wake, [src]: [...list] } });
                }}
              />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
      ))}
      <details style={{ marginTop: 8 }}>
        <summary className="small muted" style={{ cursor: "pointer" }}>
          Test it: deliver a message the way a bridge would
        </summary>
        <div className="card" style={{ marginTop: 8 }}>
          <div className="row">
            <Seg value={testFrom} options={[{ id: "discord", label: "Discord" }, { id: "vector", label: "Vector" }]} onChange={setTestFrom} />
            <input className="input" style={{ maxWidth: 140 }} value={testName} onChange={(e) => setTestName(e.target.value)} aria-label="From" />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input grow" value={testText} onChange={(e) => setTestText(e.target.value)} aria-label="Message" />
            <button
              className="btn"
              onClick={() =>
                void receive(
                  { source: testFrom, chatId: "test", author: testName, authorId: `test-${testName}`, text: testText, isGroup: false, mentionsMe: true },
                  // A test message has nowhere to send the reply; it only shows in the Room.
                  { send: async () => {}, typing: async () => {}, image: async () => null },
                )
              }
            >
              Deliver
            </button>
          </div>
          <p className="small faint" style={{ marginTop: 6 }}>It shows in the Room as if it came from {testFrom === "discord" ? "Discord" : "Vector"}; send it several times quickly to trip the gate. Streamer mode hides it.</p>
        </div>
      </details>

      <div className="divider" />
      <h2>
        Device watch <Sensitive />
      </h2>
      <p className="lead small">Jade can keep watch on this computer: battery, network, and whether someone is using the desktop. Off unless you turn it on. Nothing leaves the computer; notes go to Jade's journal/sentry.md.</p>
      {!sensorsOk ? (
        <div className="note small">
          The watch needs permission first.{" "}
          <button className="btn small" onClick={() => (s.privacy.mode === "none" ? desk().say("Privacy is set to None. Change it in Settings → Privacy first.") : setRisk(true))}>
            Read what it records…
          </button>
        </div>
      ) : !gateOpen ? (
        <div className="note small">
          <p>The watch also needs the adult shelf open, or the adult passcode for this session.</p>
          {s.adult ? (
            <form
              className="row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (s.adult && (await matches(pass, s.adult))) {
                  desk().set({ sensorPass: true });
                  setPassNote("");
                } else setPassNote("That passcode doesn't match.");
                setPass("");
              }}
            >
              <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Adult passcode" style={{ maxWidth: 200 }} />
              <button className="btn">Approve for this session</button>
              {passNote ? <span className="small" style={{ color: "var(--bad)" }}>{passNote}</span> : null}
            </form>
          ) : (
            <span className="small">Set a passcode in Settings → Adult shelf first.</span>
          )}
        </div>
      ) : (
        <>
          {(
            [
              ["battery", "Battery and charger"],
              ["network", "Network going up or down"],
              ["screen", "Someone leaving or returning to the desktop"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={s.sensors[k]} onChange={(e) => desk().set({ sensors: { ...s.sensors, [k]: e.target.checked } })} />
              <span>{label}</span>
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={s.sensors.tellRoom} onChange={(e) => desk().set({ sensors: { ...s.sensors, tellRoom: e.target.checked } })} />
            <span>Mention it in the Room when Jade is there</span>
          </label>
          <p className="small faint">Calls, texts, location, camera and microphone are phone features and aren't watched here.</p>
        </>
      )}

      <div className="divider" />
      <h4>Log</h4>
      <div className="mono small" style={{ maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap" }}>
        {s.sentryLog.length ? s.sentryLog.join("\n") : <span className="faint">Nothing yet.</span>}
      </div>
      {risk ? <RiskDialog feature="sensors" onClose={() => setRisk(false)} /> : null}
    </div>
  );
}
