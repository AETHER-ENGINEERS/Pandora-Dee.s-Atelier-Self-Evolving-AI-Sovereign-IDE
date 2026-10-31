import { useEffect, useRef, useState } from "react";
import { FullAvatar } from "./FullAvatar.tsx";
import { runSlash } from "./slash.ts";
import { MessagesSquare, Monitor, Send, Square, Settings as SettingsIcon, Users } from "lucide-react";
import { APPS, desk, inToddler, useDesk } from "../lib/store.ts";
import type { Character } from "../lib/characters.ts";
import { letThemTalk, say, stopAll } from "../lib/agent.ts";
import { maskName, maskText } from "../lib/privacy.ts";
import { useSpeech } from "./common.tsx";
import { openSettings } from "./desktopApi.tsx";
import { VolumeControl } from "./Volume.tsx";
import { openMenu } from "./ContextMenu.tsx";
import { MicButton } from "./Mic.tsx";
import { characterMenu } from "./menus.ts";

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Default spots: spread along the ground, a little staggered. */
function defaultSpot(i: number, n: number) {
  return { x: (i + 1) / (n + 1), y: 0.82 - (i % 2) * 0.035 };
}

/** The characters standing in the scene. Used full screen in hangout mode and behind the windows. */
export function Stage({ interactive = true }: { interactive?: boolean }) {
  const s = useDesk();
  const room = s.roomCharacters();
  const sp = useSpeech();
  const ref = useRef<HTMLDivElement>(null);
  const [drift, setDrift] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());

  // Bubbles fade on a clock.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // A gentle wander, so they don't stand like statues.
  useEffect(() => {
    if (!s.hang.wander) return setDrift({});
    const t = window.setInterval(() => {
      const ids = desk().members;
      const id = ids[Math.floor(Math.random() * ids.length)];
      if (!id || desk().busy[id]) return;
      setDrift((d) => ({ ...d, [id]: clamp((d[id] ?? 0) + (Math.random() - 0.5) * 0.06, -0.08, 0.08) }));
    }, 5200);
    return () => window.clearInterval(t);
  }, [s.hang.wander]);

  const lastLine = (c: Character) => [...s.messages].reverse().find((m) => m.kind === "character" && m.who === c.id && !m.pass);

  return (
    <div
      className={`stage-layer${interactive ? "" : " passive"}`}
      ref={ref}
      onContextMenu={(e) =>
        e.target === e.currentTarget &&
        openMenu(e, [
          { label: desk().hangout ? "Back to the desktop" : "Hangout", run: () => desk().set({ hangout: !desk().hangout }) },
          { label: "Let them talk", run: () => void letThemTalk() },
          { label: "Invite someone…", run: () => (desk().set({ hangout: false }), desk().openApp("cast")) },
          { sep: true },
          { label: "Put everyone back in their spots", run: () => desk().set({ spots: {} }) },
          { label: "Let them wander", checked: desk().hang.wander, run: () => desk().set({ hang: { ...desk().hang, wander: !desk().hang.wander } }) },
          { label: "Speech bubbles", checked: desk().hang.bubbles, run: () => desk().set({ hang: { ...desk().hang, bubbles: !desk().hang.bubbles } }) },
          ...(desk().hangout
            ? [
                { sep: true as const },
                // windows over the scene, without leaving Hangout or darkening it
                { heading: "Windows in Hangout" },
                ...APPS.filter((a) => a.id !== "welcome" && (!desk().toddler || inToddler(a.id))).map((a) => {
                  const shown = desk().hang.windows.includes(a.id) && desk().wins[a.id].open && !desk().wins[a.id].min;
                  return {
                    label: a.title,
                    checked: shown,
                    run: () => {
                      const h = desk().hang;
                      if (shown) return desk().set({ hang: { ...h, windows: h.windows.filter((w) => w !== a.id) } });
                      desk().set({ hang: { ...h, windows: [...h.windows.filter((w) => w !== a.id), a.id] } });
                      desk().openApp(a.id);
                    },
                  };
                }),
                { sep: true as const },
                { heading: "Chat" },
                { label: "Conversation and typing bar", checked: desk().hang.chat === "full", run: () => desk().set({ hang: { ...desk().hang, chat: "full" as const } }) },
                { label: "Only the typing bar", checked: desk().hang.chat === "bar", run: () => desk().set({ hang: { ...desk().hang, chat: "bar" as const } }) },
                { label: "No chat (Enter still opens the bar)", checked: desk().hang.chat === "off", run: () => desk().set({ hang: { ...desk().hang, chat: "off" as const } }) },
              ]
            : []),
          { sep: true },
          { label: "Scene and hangout settings…", run: () => (desk().set({ hangout: false }), openSettings("hangout")) },
        ])
      }
    >
      {room.map((c, i) => {
        const spot = s.spots[c.id] ?? defaultSpot(i, room.length);
        const x = clamp(spot.x + (drift[c.id] ?? 0), 0.04, 0.96);
        const talking = sp.who === c.id;
        const busy = s.busy[c.id];
        const line = lastLine(c);
        const fresh = line && now - line.at < s.hang.bubbleSeconds * 1000;
        const bubble = talking && sp.text ? sp.text : busy ? (line && !line.text ? "…" : busy === "thinking" ? "…" : line?.text) : fresh ? line?.text : "";
        return (
          <Avatar
            key={c.id}
            c={c}
            x={x}
            y={spot.y}
            mouth={talking ? sp.mouth : 0}
            talking={talking}
            focus={s.focus === c.id}
            bubble={s.hang.bubbles ? (bubble ?? "") : ""}
            interactive={interactive}
            onMenu={(px, py) => {
              const box = ref.current?.getBoundingClientRect();
              openMenu({ clientX: px + (box?.left ?? 0), clientY: py + (box?.top ?? 0), preventDefault() {}, stopPropagation() {} }, [
                ...characterMenu(c.id),
                { sep: true },
                {
                  label: "Back to their spot",
                  run: () => {
                    const spots = { ...desk().spots };
                    delete spots[c.id];
                    desk().set({ spots });
                  },
                },
              ]);
            }}
            parent={ref}
          />
        );
      })}
    </div>
  );
}

function Avatar({
  c,
  x,
  y,
  mouth,
  talking,
  focus,
  bubble,
  interactive,
  onMenu,
  parent,
}: {
  c: Character;
  x: number;
  y: number;
  mouth: number;
  talking: boolean;
  focus: boolean;
  bubble: string;
  interactive: boolean;
  onMenu: (x: number, y: number) => void;
  parent: React.RefObject<HTMLDivElement | null>;
}) {
  const hang = useDesk((s) => s.hang);
  const look = useDesk((s) => s.charPrefs[c.id]?.look);
  const avatar = useDesk((s) => s.charPrefs[c.id]?.avatar);
  const el = useRef<HTMLDivElement>(null);
  // their own look first (right-click → Show as), then the scene's style
  const style = look === "avatar" && avatar ? "avatar" : look === "photo" && c.art.portrait ? "photo" : look === "chibi" || (hang.style === "chibi" && look !== "talking" && look !== "photo") ? "chibi" : "talking";
  const sc = c.art.scene;
  const still = style === "photo" ? c.art.portrait : sc ? (style === "chibi" ? sc.chibi ?? sc.still : sc.still) : c.art.portrait || c.art.still;
  const open = sc && style === "talking" ? sc.open : undefined;
  const framed = style === "photo" || (!sc && style !== "avatar");

  const down = (e: React.PointerEvent) => {
    if (!interactive || e.button > 0) return;
    e.stopPropagation();
    const box = parent.current?.getBoundingClientRect();
    if (!box) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let held = false;
    const press = window.setTimeout(() => {
      held = true;
      onMenu(e.clientX - box.left, e.clientY - box.top);
    }, 550);
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      window.clearTimeout(press);
      const nx = clamp((ev.clientX - box.left) / box.width, 0.04, 0.96);
      const ny = clamp((ev.clientY - box.top + (el.current?.offsetHeight ?? 0) * 0.45) / box.height, 0.3, 1);
      if (el.current) {
        el.current.style.left = `${nx * 100}%`;
        el.current.style.top = `${ny * 100}%`;
      }
      desk().set({ spots: { ...desk().spots, [c.id]: { x: nx, y: ny } } });
    };
    const up = () => {
      window.clearTimeout(press);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved && !held) desk().setFocus(c.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={el}
      className={`avatar-sprite ${style === "avatar" ? "full-look" : style}${talking ? " speaking" : ""}${focus ? " focus" : ""}${framed ? " framed" : ""}`}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, height: `${hang.size * 100}vh`, ...(style === "avatar" ? { width: `${hang.size * 75 * ((avatar?.scale ?? 1) > 1 ? avatar!.scale : 1)}vh` } : {}), ["--c" as string]: c.accent }}
      onPointerDown={down}
      onContextMenu={(e) => {
        e.preventDefault();
        const box = parent.current?.getBoundingClientRect();
        if (box) onMenu(e.clientX - box.left, e.clientY - box.top);
      }}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? `${c.short}${focus ? ", answers by default" : ""}. Tap to talk to them, drag to move, hold for options.` : undefined}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === "Enter") desk().setFocus(c.id);
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          const r = el.current!.getBoundingClientRect();
          const box = parent.current!.getBoundingClientRect();
          onMenu(r.left - box.left + r.width / 2, r.top - box.top + r.height / 2);
        }
      }}
    >
      {bubble ? <div className="speech">{bubble.length > 260 ? `${bubble.slice(0, 260)}…` : bubble}</div> : null}
      <div className="sprite-body">
        {style === "avatar" && avatar ? (
          <FullAvatar charId={c.id} a={avatar} />
        ) : still ? (
          <img src={still} alt="" draggable={false} />
        ) : (
          <span className="sprite-initials">{c.short.slice(0, 2)}</span>
        )}
        {open ? <img className="open" src={open} alt="" draggable={false} style={{ opacity: talking ? Math.min(1, mouth * 0.95) : 0 }} /> : null}
      </div>
      <span className="sprite-name">{c.short}</span>
    </div>
  );
}

/** Full-screen scene: everything else steps aside, with a slim chat bar and a few controls. */
export function HangoutMode() {
  const s = useDesk();
  const [draft, setDraft] = useState("");
  const [awake, setAwake] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef(0);
  const busy = Object.keys(s.busy).length > 0;
  const chat = s.hang.chat ?? "full";
  // the conversation panel shows whole replies (the characters' too) and scrolls; the old floating lines were clipped
  const recent = s.messages.filter((m) => !m.pass && m.kind !== "notice").slice(-Math.max(s.hang.lines, 30));
  const [opened, setOpened] = useState(false); // the bar shown for a moment while the chat is off
  const log = useRef<HTMLDivElement>(null);
  const lastId = recent[recent.length - 1]?.id;
  const lastText = recent[recent.length - 1]?.text;
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, lastText]);
  const showControls = awake || s.hang.pinControls;

  const poke = () => {
    setAwake(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAwake(false), 3500);
  };
  useEffect(() => {
    poke();
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement === inputRef.current;
      if (e.key === "Escape") {
        if (typing && draft) return setDraft("");
        if (typing) return inputRef.current?.blur(), setOpened(false);
        desk().set({ hangout: false });
      } else if (!typing && (e.key === "Enter" || e.key === "/")) {
        e.preventDefault();
        poke();
        setOpened(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (!typing && /^[1-6]$/.test(e.key)) {
        const c = desk().roomCharacters()[Number(e.key) - 1];
        if (c) desk().setFocus(c.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer.current);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    if (t.startsWith("/") && !t.startsWith("//")) void runSlash(t);
    else void say(t.startsWith("//") ? t.slice(1) : t);
  };

  // Swipe up from the bottom edge opens the chat bar on touch screens.
  const touch = useRef<{ y: number } | null>(null);

  return (
    <div
      className={`hangout${showControls ? "" : " idle"}`}
      onPointerMove={poke}
      onPointerDown={poke}
      onTouchStart={(e) => (touch.current = { y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (start && start.y > window.innerHeight - 90 && start.y - e.changedTouches[0].clientY > 40) inputRef.current?.focus();
      }}
    >
      <Stage />
      <div className="hang-top">
        <span className="hang-title">{s.roomCharacters().map((c) => c.short).join(" · ") || "Nobody's here yet"}</span>
        {/* one button for both: it shows while they're talking, and stops them when pressed again */}
        <button
          className={`icon-btn${busy ? " on" : ""}`}
          data-tip={busy ? "They're talking: press to stop them" : s.freeTalk ? "Let them talk (free talk is on: until the loop breaker stops them)" : "Let them talk (one round; free talk is off)"}
          aria-label={busy ? "Stop them talking" : "Let them talk"}
          aria-pressed={busy}
          onClick={() => (busy ? stopAll() : void letThemTalk())}
        >
          <MessagesSquare size={17} />
        </button>
        <VolumeControl size={17} />
        {busy ? (
          <button className="icon-btn" data-tip="Stop" aria-label="Stop" onClick={stopAll}>
            <Square size={16} />
          </button>
        ) : null}
        <button className="icon-btn" data-tip="Invite someone" aria-label="Invite someone" onClick={() => (desk().set({ hangout: false }), desk().openApp("cast"))}>
          <Users size={17} />
        </button>
        <button className="icon-btn" data-tip="Hangout settings" aria-label="Hangout settings" onClick={() => (desk().set({ hangout: false }), openSettings("hangout"))}>
          <SettingsIcon size={17} />
        </button>
        <button className="btn small" onClick={() => desk().set({ hangout: false })} title="Esc">
          <Monitor size={14} /> Desktop
        </button>
      </div>
      <div className="hang-bottom">
        {chat === "full" && recent.length ? (
          <div className="hang-lines" aria-live="polite" ref={log}>
            {recent.map((m) => {
              const c = m.kind === "character" ? s.character(m.who) : undefined;
              const bridge = m.source !== "desk";
              const text = c ? m.text : maskText(s.privacy, m.text, bridge);
              return (
                <div key={m.id} className={`hang-line${c ? " from-character" : ""}`}>
                  <b style={{ color: c?.accent }}>{c ? c.short : maskName(s.privacy, m.name, bridge)}</b> {text || (s.busy[m.who] ? "…" : "")}
                </div>
              );
            })}
          </div>
        ) : null}
        <form
          hidden={chat === "off" && !opened}
          onBlur={(e) => chat === "off" && !draft && !e.currentTarget.contains(e.relatedTarget as Node) && setOpened(false)}
          className="hang-chat"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={poke}
            placeholder={`Talk to ${s.character(s.focus)?.short ?? "the room"}… (Enter to type, Esc for the desktop)`}
            aria-label="Message"
          />
          <MicButton className="btn" onText={(t) => (setDraft((d) => (d.trim() ? `${d.trimEnd()} ${t}` : t)), inputRef.current?.focus())} />
          <button className="btn primary" disabled={!draft.trim()} aria-label="Send">
            <Send size={15} />
          </button>
          <button type="button" className="btn" onClick={() => (desk().set({ hangout: false }), desk().openApp("room"))} title="Open the full Room">
            Room
          </button>
        </form>
      </div>
    </div>
  );
}
