import { useEffect, useRef, useState } from "react";
import { desk, useDesk } from "../lib/store.ts";
import { run } from "../lib/shell.ts";
import { privately } from "../lib/agent.ts";
import { CharacterPicker } from "./Files.tsx";
import { findHost, openHost, sshOp } from "../lib/ssh.ts";
import type { SshHost } from "../lib/store.ts";

type Line = { kind: "in" | "out"; text: string; prompt?: string };

export function TerminalApp() {
  const s = useDesk();
  const [charId, setCharId] = useState(s.focus || "dee");
  const [cwd, setCwd] = useState("");
  const [lines, setLines] = useState<Line[]>([{ kind: "out", text: "Type help to see the commands. Each character has their own files." }]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // ssh: a live session takes over the terminal until it closes; `asking` waits for a password
  const [ssh, setSsh] = useState<{ session: string; label: string } | null>(null);
  const [screen, setScreen] = useState("");
  const [asking, setAsking] = useState<SshHost | null>(null);
  const c = s.character(charId);
  const user = (s.session ?? "you").toLowerCase().replace(/\s+/g, "-");
  const prompt = `${user}@${c?.short.toLowerCase() ?? "desk"}:/${cwd}$`;

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [lines, screen]);

  useEffect(() => {
    if (!ssh) return;
    const t = window.setInterval(async () => {
      const r = (await sshOp("screen", { session: ssh.session })) as { text?: string; alive?: boolean; error?: string };
      if (r.error || r.alive === false) {
        setLines((prev) => [...prev, { kind: "out", text: `${screen}\n[Connection to ${ssh.label} closed.]` }]);
        setScreen("");
        setSsh(null);
        return;
      }
      setScreen(r.text ?? "");
    }, 500);
    return () => window.clearInterval(t);
  }, [ssh]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (text: string) => setLines((prev) => [...prev, { kind: "out", text }]);

  const connect = async (h: SshHost) => {
    say(`Connecting to ${h.user}@${h.host}:${h.port || 22}…`);
    try {
      const r = await openHost(h, "You");
      if (r.error || !r.session) return say(String(r.error ?? "Couldn't connect."));
      setSsh({ session: String(r.session), label: h.name });
      setScreen(String(r.text ?? r.output ?? ""));
    } catch (e) {
      say(e instanceof Error ? e.message : String(e));
    }
  };

  /** ssh <saved host> | ssh user@host[:port] [-p port] */
  const startSsh = (arg: string) => {
    const words = arg.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      const saved = desk().sshHosts.map((h) => `  ${h.name}  (${h.user}@${h.host})`).join("\n");
      return say(`Usage: ssh <saved host> or ssh user@host [-p port]\n${saved ? `Saved hosts:\n${saved}` : "No saved hosts yet (Connections → SSH)."}`);
    }
    const saved = findHost(words[0]);
    if (saved) return void connect(saved);
    const m = /^([^@\s]+)@([^:\s]+)(?::(\d+))?$/.exec(words[0]);
    if (!m) return say(`No saved host called "${words[0]}". Use ssh user@host, or save it in Connections → SSH.`);
    const pi = words.indexOf("-p");
    const port = Number(pi >= 0 ? words[pi + 1] : m[3]) || 22;
    setAsking({ id: `once-${Date.now()}`, name: `${m[1]}@${m[2]}`, host: m[2], port, user: m[1], password: "", key: "", fingerprint: "", confirm: false });
    say(`${m[1]}@${m[2]}'s password:`);
  };

  const exec = async (cmd: string) => {
    if (/^\s*ssh(\s|$)/.test(cmd)) {
      setLines((prev) => [...prev, { kind: "in", text: cmd, prompt }]);
      return startSsh(cmd.trim().slice(3));
    }
    const st = desk();
    const tree = st.filesOf(charId);
    const conn = st.model.connections.find((x) => x.enabled);
    const res = run(cmd, cwd, tree, {
      who: `${st.session ?? "you"} (in ${c?.name}'s files)`,
      host: c?.name ?? "",
      room: st.roomCharacters().map((x) => `${x.short}  ${x.name}${st.focus === x.id ? "  (in focus)" : ""}`),
      env: st.env,
      model: conn ? `${conn.label}: ${conn.model || "(picks automatically)"}` : "",
      characters: st.visibleCharacters().map((x) => x.short),
    });
    if (res.clear) {
      setLines([]);
      return;
    }
    const add: Line[] = [{ kind: "in", text: cmd, prompt }];
    if (res.out) add.push({ kind: "out", text: res.out });
    setLines((prev) => [...prev, ...add]);
    setCwd(res.cwd);
    if (res.tree) desk().set({ files: { ...st.files, [charId]: res.tree } });
    if (res.action?.kind === "open") {
      sessionStorage.setItem("pdd-files-char", charId);
      window.dispatchEvent(new CustomEvent("pdd-files", { detail: { char: charId, path: res.action.path } }));
      desk().openApp("files");
    }
    if (res.action?.kind === "switch") {
      const name = res.action.id;
      const hit = st.visibleCharacters().find((x) => x.short === name);
      if (hit) setCharId(hit.id);
    }
    if (res.action?.kind === "ask") {
      setLines((prev) => [...prev, { kind: "out", text: `${c?.short} is thinking…` }]);
      const answer = await privately(charId, res.action.text);
      setLines((prev) => [...prev.slice(0, -1), { kind: "out", text: answer || "(no answer — is an AI connection set up?)" }]);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="toolbar">
        <CharacterPicker value={charId} onChange={(id) => (setCharId(id), setCwd(""))} />
      </div>
      <div className="term" ref={boxRef} onClick={() => inputRef.current?.focus()}>
        {lines.map((l, i) => (
          <div key={i}>
            {l.kind === "in" ? (
              <>
                <span className="prompt">{l.prompt}</span> {l.text}
              </>
            ) : (
              l.text
            )}
          </div>
        ))}
        {ssh ? <div className="ssh-screen">{screen}</div> : null}
        <div style={{ display: "flex", gap: 6 }}>
          <span className="prompt">{ssh ? `${ssh.label} ›` : asking ? "password:" : prompt}</span>
          <input
            type={asking ? "password" : "text"}
            ref={inputRef}
            value={input}
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
            aria-label="Command"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (asking) {
                if (e.key === "Enter") {
                  const h = { ...asking, password: input };
                  setInput("");
                  setAsking(null);
                  void connect(h);
                } else if (e.key === "Escape") (setAsking(null), setInput(""), say("Cancelled."));
                return;
              }
              if (ssh) {
                // ~. hangs up from this side, as in OpenSSH
                if (e.key === "Enter" && input.trim() === "~.") {
                  void sshOp("close", { session: ssh.session });
                  setInput("");
                  return;
                }
                if (e.key === "Enter") {
                  void sshOp("send", { session: ssh.session, text: input, enter: true });
                  if (input.trim()) setHistory((h) => [...h, input].slice(-100));
                  setInput("");
                  setHi(-1);
                  return;
                }
                if (e.ctrlKey && (e.key === "c" || e.key === "d") && !input) {
                  e.preventDefault();
                  void sshOp("send", { session: ssh.session, keys: [e.key === "c" ? "ctrl-c" : "ctrl-d"] });
                  return;
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  void sshOp("send", { session: ssh.session, text: `${input}\t` });
                  setInput("");
                  return;
                }
              }
              if (e.key === "Enter") {
                const cmd = input;
                setInput("");
                setHi(-1);
                if (cmd.trim()) setHistory((h) => [...h, cmd].slice(-100));
                void exec(cmd);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const n = hi < 0 ? history.length - 1 : Math.max(0, hi - 1);
                if (history[n] !== undefined) (setHi(n), setInput(history[n]));
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const n = hi + 1;
                if (n >= history.length) (setHi(-1), setInput(""));
                else (setHi(n), setInput(history[n]));
              } else if (e.key === "l" && e.ctrlKey) {
                e.preventDefault();
                setLines([]);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
