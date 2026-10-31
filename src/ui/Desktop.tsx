import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Download, GripVertical, LayoutGrid } from "lucide-react";
import { APPS, desk, inToddler, useDesk, type AppId } from "../lib/store.ts";
import { ToddlerPill } from "./Toddler.tsx";
import { Window } from "./Window.tsx";
import { PersonAvatar } from "./common.tsx";
import { download, makeBackup, toClassic } from "../lib/backup.ts";
import { scopeOf } from "../lib/model.ts";
import { allowed } from "../lib/privacy.ts";
import { resumeBridges } from "../lib/bridges.ts";
import { connectServer, syncCharacterMcp } from "../lib/connections.ts";
import { useSensors } from "./sensors.ts";
import { LockScreen } from "./LockScreen.tsx";
import { Boundary } from "./Boundary.tsx";
import { Classic } from "./Classic.tsx";
import { Dock } from "./Dock.tsx";
import { VolumeControl } from "./Volume.tsx";
import { AskHost } from "./Ask.tsx";
import { SharedIn } from "./SharedIn.tsx";
import { TooltipHost } from "./Tooltip.tsx";
import { startBackupSchedule } from "../lib/serverBackup.ts";
import { applyInbound } from "../lib/inbound.ts";
import { startChatSync } from "../lib/chats.ts";
import { loadNotes } from "../lib/notes.ts";
import { ContextMenuHost, openMenu, openMenuAt, type MenuItem } from "./ContextMenu.tsx";
import { formatClock, validLocale, validZone, type ClockPrefs } from "../lib/clock.ts";
import { HangoutMode, Stage } from "./Hangout.tsx";
import { handleShortcut } from "./shortcuts.ts";
import { RoomApp } from "../apps/Room.tsx";
import { PresenceApp } from "../apps/Presence.tsx";
import { CastApp } from "../apps/Cast.tsx";
import { FilesApp } from "../apps/Files.tsx";
import { NotesApp } from "../apps/Notes.tsx";
import { MusicApp } from "../apps/Music.tsx";
import { Visualizer, VisualizerApp } from "../apps/Visualizer.tsx";
import "../lib/musicTalk.ts";
import { JournalApp } from "../apps/Journal.tsx";
import { TerminalApp } from "../apps/Terminal.tsx";
import { GameBack, GameBar, GamesApp } from "../apps/Games.tsx";
import { ConnectionsApp } from "../apps/Connections.tsx";
import { SentryApp } from "../apps/Sentry.tsx";
import { KeysApp } from "../apps/Keys.tsx";
import { SettingsApp } from "../apps/Settings.tsx";
import { WelcomeApp } from "../apps/Welcome.tsx";
import { StudioApp } from "../apps/Studio.tsx";
import { canPrompt, install, installed } from "../lib/install.ts";
import { CreateApp } from "../apps/Create.tsx";
import { BrowserApp } from "../apps/Browser.tsx";
import { VectorApp } from "../apps/Vector.tsx";
import { ExplorerApp, PickerHost } from "../apps/Explorer.tsx";
import { ICONS, loadBackupFile, openSettings, useWide } from "./desktopApi.tsx";
import { copyText } from "../lib/clipboard.ts";


const BODIES: Record<AppId, () => ReactNode> = {
  room: () => <RoomApp />,
  presence: () => <PresenceApp />,
  cast: () => <CastApp />,
  files: () => <FilesApp />,
  explorer: () => <ExplorerApp />,
  notes: () => <NotesApp />,
  music: () => <MusicApp />,
  visualizer: () => <VisualizerApp />,
  create: () => <CreateApp />,
  browser: () => <BrowserApp />,
  vector: () => <VectorApp />,
  journal: () => <JournalApp />,
  terminal: () => <TerminalApp />,
  games: () => <GamesApp />,
  connections: () => <ConnectionsApp />,
  sentry: () => <SentryApp />,
  keys: () => <KeysApp />,
  settings: () => <SettingsApp />,
  welcome: () => <WelcomeApp />,
  studio: () => <StudioApp />,
};



export function Desktop() {
  const s = useDesk();
  const width = useWide();
  const phone = width < 760;
  const [drop, setDrop] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useSensors();

  // Phones: the back gesture (or button) closes what's on top — Classic, then Hangout, then the front window,
  // which shows the one under it — instead of leaving the page. With nothing open, back leaves as usual.
  useEffect(() => {
    if (!phone) return;
    const shown = () => {
      const d = desk();
      return APPS.filter((a) => d.wins[a.id].open && !d.wins[a.id].min).sort((a, b) => d.wins[b.id].z - d.wins[a.id].z);
    };
    const closable = () => desk().classic || desk().hangout || shown().length > 0;
    // one history step of our own stands in front of the page while there's something to close
    const arm = () => {
      if (closable() && !(history.state as { pddBack?: boolean } | null)?.pddBack) history.pushState({ pddBack: true }, "");
    };
    const back = () => {
      const d = desk();
      if (d.classic) d.set({ classic: false });
      else if (d.hangout) d.set({ hangout: false });
      else if (shown()[0]) d.closeApp(shown()[0].id);
      arm();
    };
    arm();
    const unsub = useDesk.subscribe(arm);
    window.addEventListener("popstate", back);
    return () => {
      unsub();
      window.removeEventListener("popstate", back);
    };
  }, [phone]);

  const locked = s.accounts.length > 0 && !s.session;
  const focusChar = s.character(s.focus);
  const accent = focusChar?.accent ?? "#b9a4ff";
  const front = APPS.filter((a) => s.wins[a.id].open && !s.wins[a.id].min).sort((a, b) => s.wins[b.id].z - s.wins[a.id].z)[0]?.id;
  const sceneChar = s.hang.scene === "focus" ? focusChar : s.character(s.hang.scene) ?? focusChar;
  // The chosen scene (or your own picture) is the backdrop in Hangout and, with wallpaper on, on the desktop.
  const wallpaper = s.hangout || s.wallpaper ? s.hang.customScene || sceneChar?.art.background : undefined;

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--fs", `${s.fontSize}px`);
    document.documentElement.style.setProperty("zoom", String(s.uiScale));
  }, [accent, s.fontSize, s.uiScale]);

  useEffect(() => {
    resumeBridges();
    const backups = startBackupSchedule();
    startChatSync();
    void loadNotes();
    if (desk().api.on) void applyInbound();
    for (const srv of desk().mcp) if (srv.enabled) void connectServer(srv);
    syncCharacterMcp();
    // A character's mcp.json is her own servers: follow it when her files change.
    const unFiles = useDesk.subscribe((s, prev) => {
      if (s.files !== prev.files || s.custom !== prev.custom) syncCharacterMcp();
    });
    if (desk().firstRun) desk().set({ firstRun: false });
    return () => {
      window.clearInterval(backups);
      unFiles();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleShortcut(e)) e.preventDefault();
    };
    // Shortcuts pressed while a game or app has the keyboard arrive from its frame.
    const onFrameKey = (e: MessageEvent) => {
      const d = e.data as { __pdd?: string; key?: string; code?: string; ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } | null;
      if (d?.__pdd !== "key" || !d.key) return;
      handleShortcut({ key: d.key, code: d.code ?? "", ctrlKey: Boolean(d.ctrl), metaKey: Boolean(d.meta), shiftKey: Boolean(d.shift), altKey: Boolean(d.alt) });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onFrameKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onFrameKey);
    };
  }, []);

  if (s.classic && !s.toddler) return <Classic />;

  return (
    <div
      className={`desktop${phone ? " phone" : ""}${s.menuBar && !s.bar.autoHide ? "" : " no-menu"}${s.menuBar && s.bar.edge === "bottom" && !s.bar.autoHide ? " bar-bottom" : ""}${s.menuBar && s.bar.autoHide ? " bar-auto" : ""}${s.hangout ? " hangout-on" : ""} dock-${phone && s.dock.edge !== "top" ? "bottom" : s.dock.edge}${s.dock.autoHide && (phone || s.dock.edge !== "float") ? " dock-auto" : ""}`}
      style={{ ["--dock-h" as string]: `${s.dock.size + (s.dock.labels ? 14 : 0) + 20}px` }}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          setDrop(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrop(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrop(false);
        const f = e.dataTransfer.files[0];
        if (f && /json$/i.test(f.name)) loadBackupFile(f);
        else if (f) desk().say("Drop a character backup (.json) to bring someone in.");
      }}
    >
      <div
        className={`wallpaper${wallpaper ? "" : " plain"}`}
        style={{ ...(wallpaper ? { backgroundImage: `url("${wallpaper}")` } : {}), ["--dim" as string]: s.hang.dim }}
      />
      {s.music.vizBackground && s.music.viz !== "off" && !s.hangout ? (
        <div className="viz-background" style={{ opacity: s.music.vizBackgroundOpacity }} aria-hidden>
          <Visualizer big />
        </div>
      ) : null}
      {!s.hangout && s.hang.onDesktop ? <Stage /> : null}
      {s.menuBar && !phone && s.bar.autoHide ? <div className={`bar-reveal ${s.bar.edge}`} aria-hidden /> : null}
      {s.menuBar && !phone ? <MenuBar onLoad={() => fileRef.current?.click()} /> : null}
      <div
        className="workspace"
        onContextMenu={(e) => e.target === e.currentTarget && openMenu(e, desktopMenu(() => fileRef.current?.click()))}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget && desk().touch.doubleTapScene) desk().set({ hangout: true });
        }}
      >
        {APPS.filter((a) => !s.toddler || inToddler(a.id)).map((a) => (
          <Window
            key={a.id}
            id={a.id}
            title={a.id === "games" && s.game ? s.game.title : a.title}
            icon={<span className="faint">{ICONS[a.id](15)}</span>}
            front={front === a.id}
            extra={a.id === "games" && s.game ? <GameBar /> : undefined}
            lead={a.id === "games" && s.game ? <GameBack /> : undefined}
          >
            <Boundary name={a.title}>{BODIES[a.id]()}</Boundary>
          </Window>
        ))}
      </div>
      <Dock front={front} phone={phone} />
      {drop ? <div className="drop-hint">Drop a character backup to bring them in</div> : null}
      <ContextMenuHost />
      <AskHost />
      <SharedIn />
      <PickerHost />
      <TooltipHost />
      {s.toast ? (
        <div className="toast" role="status" onClick={() => desk().set({ toast: "" })}>
          {s.toast}
        </div>
      ) : null}
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && loadBackupFile(e.target.files[0])} />
      {s.hangout ? <HangoutMode /> : null}
      {locked ? <LockScreen /> : null}
    </div>
  );
}

/** Right-click on the empty desktop. */
function desktopMenu(load: () => void): MenuItem[] {
  const s = desk();
  return [
    { label: "Hangout", hint: "Ctrl Shift H", run: () => s.set({ hangout: true }) },
    { label: "Characters on the desktop", checked: s.hang.onDesktop, run: () => s.set({ hang: { ...s.hang, onDesktop: !s.hang.onDesktop } }) },
    { label: "Character wallpaper", checked: s.wallpaper, run: () => s.set({ wallpaper: !s.wallpaper }) },
    { sep: true },
    { label: "Invite someone…", run: () => s.openApp("cast") },
    { label: "Load a character backup…", run: load },
    { label: "Games & Apps", run: () => s.openApp("games") },
    { sep: true },
    { label: "Tile windows", run: () => s.arrange("tile") },
    { label: "Cascade windows", run: () => s.arrange("cascade") },
    { label: "Reset the layout", run: () => s.resetLayout() },
    { sep: true },
    { label: "Dock settings…", run: () => openSettings("dock") },
    { label: "Settings…", hint: "Ctrl ,", run: () => openSettings() },
    ...(s.accounts.length ? [{ sep: true } as MenuItem, { label: "Lock the desktop", run: () => s.lock() }] : []),
  ];
}

function clockMenu(): MenuItem[] {
  const c = desk().clock;
  const set = (p: Partial<ClockPrefs>) => desk().set({ clock: { ...desk().clock, ...p } });
  return [
    { heading: "Show" },
    { label: "Date", checked: c.date, run: () => set({ date: !c.date }) },
    { label: "Day of the week", checked: c.weekday, run: () => set({ weekday: !c.weekday }) },
    { label: "Seconds", checked: c.seconds, run: () => set({ seconds: !c.seconds }) },
    { sep: true },
    { heading: "Hours" },
    { label: "As the region does", checked: c.hours === "auto", run: () => set({ hours: "auto" }) },
    { label: "12-hour (2:30 PM)", checked: c.hours === "12", run: () => set({ hours: "12" }) },
    { label: "24-hour (14:30)", checked: c.hours === "24", run: () => set({ hours: "24" }) },
    { sep: true },
    { heading: "Date style" },
    { label: "Numbers (26/10/2026)", checked: c.dateStyle === "numeric", run: () => set({ dateStyle: "numeric", date: true }) },
    { label: "Short (26 Oct)", checked: c.dateStyle === "short", run: () => set({ dateStyle: "short", date: true }) },
    { label: "Long (26 October 2026)", checked: c.dateStyle === "long", run: () => set({ dateStyle: "long", date: true }) },
    { sep: true },
    { label: "Time zone and region…", hint: c.zone || "This computer's", run: () => openSettings("clock") },
  ];
}

function Clock() {
  const prefs = useDesk((s) => s.clock);
  const hold = useDesk((s) => s.touch.longPress);
  const [now, setNow] = useState(() => new Date());
  const press = useRef(0);
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), prefs.seconds ? 1000 : 5000);
    return () => window.clearInterval(t);
  }, [prefs.seconds]);
  const zone = (validZone(prefs.zone) && prefs.zone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = (validLocale(prefs.locale) && prefs.locale) || undefined;
  return (
    <span
      className="clock"
      role="button"
      tabIndex={0}
      aria-label="Clock. Right-click or hold for clock options."
      data-tip={`${new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: zone }).format(now)} · ${zone}. Right-click for clock options.`}
      onContextMenu={(e) => openMenu(e, clockMenu())}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " " || e.key === "ContextMenu") && (e.preventDefault(), openMenuAt(e.currentTarget, clockMenu()))}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" || !hold) return;
        const el = e.currentTarget;
        press.current = window.setTimeout(() => openMenuAt(el, clockMenu()), 500);
      }}
      onPointerUp={() => window.clearTimeout(press.current)}
      onPointerLeave={() => window.clearTimeout(press.current)}
      onPointerCancel={() => window.clearTimeout(press.current)}
    >
      {formatClock(now, prefs)}
    </span>
  );
}

/** Right-click on the menu bar: where it sits and whether it hides. */
function barMenu(): MenuItem[] {
  const b = desk().bar;
  const set = (p: Partial<typeof b>) => desk().set({ bar: { ...desk().bar, ...p } });
  return [
    { heading: "Menu bar" },
    { label: "At the top", checked: b.edge === "top", run: () => set({ edge: "top" }) },
    { label: "At the bottom", checked: b.edge === "bottom", run: () => set({ edge: "bottom" }) },
    { sep: true },
    { label: "Hide until the pointer reaches its edge", checked: b.autoHide, run: () => set({ autoHide: !b.autoHide }) },
    { label: "Turn the menu bar off", hint: "Settings → Look brings it back", run: () => desk().set({ menuBar: false }) },
  ];
}

function MenuBar({ onLoad }: { onLoad: () => void }) {
  const s = useDesk();
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Hiding: the bar comes in when the pointer reaches its edge (or the edge strip is tapped) and
  // goes again a moment after the pointer leaves it, unless one of its menus is open.
  const [shown, setShown] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!s.bar.autoHide) return setShown(false);
    let timer = 0;
    const move = (e: PointerEvent) => {
      const bottom = desk().bar.edge === "bottom";
      const atEdge = bottom ? e.clientY >= window.innerHeight - 4 : e.clientY <= 4;
      const onBar = barRef.current?.contains(e.target as Node);
      if (atEdge || onBar) {
        window.clearTimeout(timer);
        timer = 0;
        setShown(true);
      } else if (!openRef.current && !timer) timer = window.setTimeout(() => ((timer = 0), setShown(false)), 700);
    };
    const tap = (e: PointerEvent) => (e.target as HTMLElement).classList?.contains("bar-reveal") && setShown(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", tap);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", tap);
    };
  }, [s.bar.autoHide]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !barRef.current?.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const act = (fn: () => void) => () => {
    fn();
    setOpen(null);
  };
  const focusChar = s.character(s.focus);
  const enabled = s.model.connections.filter((c) => c.enabled);
  // Everything that is currently sending something off this computer.
  const offDevice = [
    ...enabled.filter((c) => scopeOf(c.baseUrl) !== "device" && allowed(s.privacy, scopeOf(c.baseUrl) === "network" ? "network-models" : "online-models")).map((c) => c.label),
    ...(s.bridges.discord.enabled && allowed(s.privacy, "bridges") ? ["Discord"] : []),
    ...(s.bridges.vector.enabled && allowed(s.privacy, "bridges") ? ["Vector"] : []),
    ...(allowed(s.privacy, "web") ? ["web tools"] : []),
    ...s.mcp.filter((m) => m.enabled && scopeOf(m.url) !== "device" && allowed(s.privacy, "remote-tools")).map((m) => `${m.name} (MCP)`),
    ...(s.sshOn && allowed(s.privacy, "ssh") && s.sshHosts.length ? ["SSH"] : []),
    ...(s.api.on && s.api.lan && allowed(s.privacy, "api") ? ["inbound API on Wi-Fi"] : []),
    ...(s.backup.url && allowed(s.privacy, "backup") ? ["backups"] : []),
  ];
  const account = s.accounts.find((a) => a.name === s.session);

  const Menu = ({ id, label, children, right }: { id: string; label: ReactNode; children: ReactNode; right?: boolean }) => (
    <div className={`menu-root${open === id ? " open" : ""}`}>
      <button onClick={() => setOpen(open === id ? null : id)} onPointerEnter={() => open && open !== id && setOpen(id)} aria-haspopup="menu" aria-expanded={open === id}>
        {label}
      </button>
      {open === id ? (
        <div className={`menu${right ? " right" : ""}`} role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
  const Tick = ({ on }: { on: boolean }) => <span className="check-mark">{on ? <Check size={13} /> : null}</span>;

  return (
    <div
      className={`menubar ${s.bar.edge}${open ? " open" : ""}${shown ? " shown" : ""}`}
      ref={barRef}
      onContextMenu={(e) => (e.target as HTMLElement).closest("button, .menu, input") ? undefined : openMenu(e, barMenu())}
    >
      <span
        className="bar-grip"
        role="separator"
        aria-label="Drag to move the menu bar to the top or bottom"
        data-tip="Drag to move the menu bar; right-click for its options"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const up = (ev: PointerEvent) => {
            window.removeEventListener("pointerup", up);
            const edge = ev.clientY > window.innerHeight / 2 ? "bottom" : "top";
            if (edge !== desk().bar.edge) desk().set({ bar: { ...desk().bar, edge } });
          };
          window.addEventListener("pointerup", up);
        }}
      >
        <GripVertical size={13} />
      </span>
      <Menu
        id="logo"
        label={
          <span className="logo">
            <img src="/favicon.svg" width={16} height={16} alt="" /> Pandora Dee
          </span>
        }
      >
        <button onClick={act(() => desk().openApp("welcome"))}>Getting started</button>
        <button onClick={act(() => openSettings())}>
          Settings… <span className="kbd">Ctrl ,</span>
        </button>
        <div className="sep" />
        {s.toddler ? null : <button onClick={act(() => desk().set({ classic: true }))}>Classic Pandora Dee</button>}
        <div className="sep" />
        <button disabled={!s.accounts.length} onClick={act(() => desk().lock())}>
          Lock the desktop
        </button>
      </Menu>
      <Menu id="file" label="File">
        <button onClick={act(() => desk().openApp("cast"))}>New character…</button>
        <button onClick={act(onLoad)}>Load a character backup…</button>
        <button
          disabled={!focusChar}
          onClick={act(() => focusChar && download(`${focusChar.id}-backup.json`, makeBackup(focusChar, desk().filesOf(focusChar.id))))}
        >
          Save {focusChar?.short ?? "character"}'s backup
        </button>
        <button
          disabled={!focusChar}
          onClick={act(() => focusChar && download(`${focusChar.id}-classic-config.json`, toClassic(focusChar, desk().filesOf(focusChar.id), desk().charPrefs[focusChar.id], desk().model.connections)))}
        >
          Export {focusChar?.short ?? "character"} for Classic (Pandora Dee / Jade Vault)
        </button>
        <div className="sep" />
        <button onClick={act(() => openSettings("backup"))}>Export or import everything…</button>
      </Menu>
      <Menu id="edit" label="Edit">
        <button
          onClick={act(() => {
            const text = desk()
              .messages.filter((m) => !m.pass)
              .map((m) => `${m.name}: ${m.text}`)
              .join("\n\n");
            copyText(text).then((ok) => ok && desk().say("Conversation copied."));
          })}
        >
          Copy the conversation
        </button>
        <button onClick={act(() => desk().clearRoom())}>Clear the conversation</button>
        <div className="sep" />
        <button onClick={act(() => openSettings())}>Preferences…</button>
      </Menu>
      <Menu id="view" label="View">
        <button onClick={act(() => desk().set({ hangout: true }))}>
          <Tick on={false} /> Hangout: just the scene and the characters <span className="kbd">Ctrl Shift H</span>
        </button>
        <button onClick={act(() => desk().set({ hang: { ...s.hang, onDesktop: !s.hang.onDesktop } }))}>
          <Tick on={s.hang.onDesktop} /> Characters on the desktop
        </button>
        <div className="sep" />
        <button onClick={act(() => desk().set({ wallpaper: !s.wallpaper }))}>
          <Tick on={s.wallpaper} /> Character wallpaper
        </button>
        <button onClick={act(() => desk().set({ menuBar: false }))}>
          <Tick on={s.menuBar} /> Menu bar (Settings brings it back)
        </button>
        <div className="sep" />
        <button onClick={act(() => desk().set({ fontSize: Math.min(22, s.fontSize + 1) }))}>Bigger text</button>
        <button onClick={act(() => desk().set({ fontSize: Math.max(12, s.fontSize - 1) }))}>Smaller text</button>
        <div className="sep" />
        {s.toddler ? null : <button onClick={act(() => desk().set({ classic: true }))}>Classic Pandora Dee</button>}
        <button onClick={act(() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()))}>Full screen</button>
      </Menu>
      <Menu id="window" label="Window">
        {APPS.filter((a) => !s.toddler || inToddler(a.id)).map((a) => (
          <button key={a.id} onClick={act(() => desk().openApp(a.id))}>
            <Tick on={s.wins[a.id].open} /> {a.title}
          </button>
        ))}
        <div className="sep" />
        <button onClick={act(() => desk().arrange("tile"))}>
          <LayoutGrid size={14} /> Tile windows
        </button>
        <button onClick={act(() => desk().arrange("cascade"))}>Cascade windows</button>
        <button onClick={act(() => desk().resetLayout())}>Reset the layout</button>
      </Menu>
      <Menu id="help" label="Help">
        <button onClick={act(() => desk().openApp("welcome"))}>Getting started</button>
        <button onClick={act(() => openSettings("ai"))}>Connect an AI model</button>
        <button onClick={act(() => openSettings("privacy"))}>Privacy, explained</button>
        {!installed() ? (
          <button onClick={act(() => void install().then((m) => m && desk().say(m)))}>
            <Download size={14} /> Install as an app{canPrompt() ? "" : "…"}
          </button>
        ) : null}
      </Menu>

      <div className="status">
        {s.flood.shut ? (
          <button className="pill bad" onClick={() => desk().openApp("sentry")} data-tip="The characters stopped after a burst of messages">
            Flood gate shut
          </button>
        ) : null}
        {offDevice.length ? (
          <button className="pill warn" onClick={() => openSettings("privacy")} data-tip={`Going off this computer: ${offDevice.join(", ")}`}>
            Sharing on ({offDevice.length})
          </button>
        ) : (
          <button className="pill good" onClick={() => openSettings("privacy")} data-tip="Nothing leaves this computer">
            Local only
          </button>
        )}
        {s.sensors.battery || s.sensors.network || s.sensors.screen ? (
          allowed(s.privacy, "sensors") && (s.adultOpen || s.sensorPass) ? <span className="pill warn">Sentry watching</span> : null
        ) : null}
        {s.privacy.streamer.on ? <span className="pill warn">Streamer mode</span> : null}
        {s.adultOpen ? (
          <button className="pill warn" onClick={() => desk().set({ adultOpen: false, members: desk().members.filter((id) => desk().character(id)?.shelf !== "adult") })} data-tip="Click to lock the adult shelf">
            Adult shelf open
          </button>
        ) : null}
        <ToddlerPill />
        <VolumeControl />
        <Clock />
        {s.accounts.length ? (
          <Menu id="account" right label={<PersonAvatar name={account?.name ?? "?"} picture={account?.picture} size={22} />}>
            <div className="small muted" style={{ padding: "6px 10px" }}>
              Signed in as <b>{account?.name}</b> ({account?.role})
            </div>
            <div className="sep" />
            <button onClick={act(() => desk().lock())}>Switch account</button>
            <button
              onClick={act(() => desk().lock(true))}
            >
              Sign out and forget this device
            </button>
            <button onClick={act(() => openSettings("accounts"))}>Accounts…</button>
          </Menu>
        ) : null}
      </div>
    </div>
  );
}
