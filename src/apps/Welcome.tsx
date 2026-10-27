import { desk, useDesk } from "../lib/store.ts";
import { openSettings } from "../ui/desktopApi.tsx";

export function WelcomeApp() {
  const connected = useDesk((s) => s.model.connections.some((c) => c.enabled && c.model));
  return (
    <div className="section" style={{ padding: "14px 16px" }}>
      <h3>Welcome to Pandora Dee</h3>
      <p className="small">A desktop you share with Pandora Dee, Jade and their friends. They talk with you and with each other, keep their own files, journals and memories, and play games with you.</p>
      <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.7, margin: "0 0 10px" }}>
        <li>
          {connected ? "AI is connected." : "Connect an AI model."}{" "}
          <button className="btn small" onClick={() => openSettings("ai")}>
            {connected ? "AI settings" : "Connect"}
          </button>
        </li>
        <li>Say hello in the Room. Name someone to talk to them, or say “everyone”.</li>
        <li>
          Invite more characters from{" "}
          <button className="btn small" onClick={() => desk().openApp("cast")}>
            Characters
          </button>
        </li>
        <li>Drag a character backup (.json) anywhere to bring someone new in.</li>
      </ol>
      <p className="small muted">Nothing leaves this computer unless you turn it on in Privacy. Classic Pandora Dee is on the right of the dock.</p>
    </div>
  );
}
