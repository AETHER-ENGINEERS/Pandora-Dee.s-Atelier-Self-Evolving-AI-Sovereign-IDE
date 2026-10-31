import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { BUILT_IN, DEFAULT_ROOM, type Character, type Look } from "./characters.ts";
import { FLOOD_DEFAULT, judge, type FloodState, type Role } from "./flood.ts";
import { MODEL_DEFAULT, type ModelPrefs } from "./model.ts";
import { PRIVACY_DEFAULT, type Privacy } from "./privacy.ts";
import { MAX_IN_ROOM, type Message, type Source } from "./room.ts";
import { VOICE_DEFAULT, type VoicePrefs } from "./voice.ts";
import { VOICE_ENGINES_DEFAULT, type VoiceEnginePrefs } from "./voiceEngines.ts";
import type { Sealed } from "./secure.ts";
import { pythonFrom, type Via } from "./outbound.ts";
import { MUSIC_DEFAULT, type MusicPrefs } from "./musicPrefs.ts";
import { MEDIA_DEFAULT, type MediaPrefs } from "./mediaPrefs.ts";
import { BROWSER_DEFAULT, type BrowserPrefs } from "./browserPrefs.ts";
import type { AvatarAsset } from "../ui/FullAvatar.tsx";
import { CLOCK_DEFAULT, type ClockPrefs } from "./clock.ts";

export type AppId =
  | "room"
  | "presence"
  | "cast"
  | "files"
  | "explorer"
  | "notes"
  | "music"
  | "visualizer"
  | "create"
  | "browser"
  | "vector"
  | "journal"
  | "terminal"
  | "games"
  | "connections"
  | "sentry"
  | "keys"
  | "settings"
  | "welcome"
  | "studio";

export const APPS: { id: AppId; title: string; hint: string }[] = [
  { id: "room", title: "Room", hint: "Talk with everyone in the room" },
  { id: "presence", title: "Presence", hint: "See who's talking" },
  { id: "cast", title: "Characters", hint: "Who's here, who's available, and their profiles" },
  { id: "notes", title: "Notes", hint: "Your notes: links, tags, tasks, graph" },
  { id: "music", title: "Music", hint: "Your music, internet radio and visualizers" },
  { id: "visualizer", title: "Visualizer", hint: "The music's visualizer in its own window" },
  { id: "vector", title: "Vector", hint: "Your Vector messenger: chats, Communities and Mini Apps" },
  { id: "browser", title: "Browser", hint: "Web pages in tabs, with a reader view" },
  { id: "create", title: "Create", hint: "Pictures and PDFs: a gallery, a painter, and GIMP and other apps to open them in" },
  { id: "explorer", title: "Explorer", hint: "Your files: the vault, Vector's files, music, and more" },
  { id: "files", title: "Files", hint: "Each character's own files" },
  { id: "journal", title: "Journal", hint: "Quest journals and memory" },
  { id: "terminal", title: "Terminal", hint: "A shell over a character's files" },
  { id: "games", title: "Games & Apps", hint: "Games and Vector apps (webxdc) to play together" },
  { id: "studio", title: "XDC Studio", hint: "Open, edit and version webxdc apps" },
  { id: "connections", title: "Connections", hint: "Discord, Vector and tool servers" },
  { id: "sentry", title: "Sentry", hint: "Flood gate and device watch" },
  { id: "keys", title: "Keys", hint: "API keys and tokens, kept on this computer" },
  { id: "settings", title: "Settings", hint: "AI, look, voice, privacy, accounts" },
  { id: "welcome", title: "Getting started", hint: "What this is and how to start" },
];

/** Toddler mode: the fun things (making and watching media, games, notes, Hangout) with every AI feature off.
 *  The adult passcode turns it off again. Classic is AI too, so it waits as well. */
export const TODDLER_APPS: string[] = ["notes", "music", "visualizer", "create", "games", "welcome", "hangout"];
export const inToddler = (id: string) => TODDLER_APPS.includes(id);

export type Win = { open: boolean; min: boolean; max: boolean; x: number; y: number; w: number; h: number; z: number };

/** `travels`: this account's desktop is kept on the desktop's server, to pick up on the person's other devices (lib/travel.ts). */
export type Account = { name: string; role: Role; picture: string; sealed: Sealed | null; travels?: boolean };

export type BridgeId = "discord" | "vector";

export type Bridge = {
  enabled: boolean;
  url: string;
  keyName: string;
  /** Your own user id (Discord) or npub (Vector): gets keyholder treatment. */
  owner: string;
  /** Admin ids (residents): messenger powers, no files. Everyone else is the public. */
  residents: string;
  /** What the characters call you to other people. */
  ownerName: string;
  /** Which character answers there by default. Naming another character in the message works too. */
  answerAs: string;
  /** When to answer in group channels: mentioned or replied to, a trigger word, or every message. */
  trigger: "mention" | "name" | "all";
  /** Trigger words, besides the characters' names (comma separated). */
  words: string;
  /** Channel ids or names to take part in. Empty = only DMs and mentions. */
  channels: string;
  dms: "anyone" | "residents" | "owner" | "off";
  pollSeconds: number;
  /** Secretary: where messages for you go. "inbox" files them; "now" also messages you straight away. */
  notify: "inbox" | "now";
  /** File messages the characters didn't answer (DM policy) in the inbox too. */
  inboxUnanswered: boolean;
  /** Let the characters see pictures people send (needs a vision model). */
  images: boolean;
  /** Wake the characters when a Mini App they joined gets new moves. */
  xdcWake: boolean;
  /** Vector: accept community invites from admins only, or from anyone. */
  autoJoin: "admins" | "anyone";
  /** Discord: what you call the server archive. */
  archiveName: string;
};

export const BRIDGE_DEFAULT = (id: BridgeId): Bridge => ({
  enabled: false,
  url: id === "discord" ? "http://localhost:8788/mcp" : "http://localhost:8787/mcp",
  keyName: id === "discord" ? "DISCORD_BRIDGE_TOKEN" : "VECTOR_BRIDGE_TOKEN",
  owner: "",
  residents: "",
  answerAs: "dee",
  trigger: "name",
  channels: "",
  dms: "anyone",
  pollSeconds: 5,
  ownerName: "",
  words: "",
  notify: "inbox",
  inboxUnanswered: true,
  images: true,
  xdcWake: true,
  autoJoin: "admins",
  archiveName: "",
});

export type Exposure = "codemode" | "deferred" | "direct" | "hidden";

export type Cat = { id: string; name: string; coat: string; marks: string; belly: string; eyes: string };

export const CAT_COATS: { label: string; coat: string; marks: string; belly: string }[] = [
  { label: "Grey tabby", coat: "#8a8794", marks: "#4e4b57", belly: "#d9d4de" },
  { label: "Orange tabby", coat: "#e3954a", marks: "#b05f22", belly: "#f6dcc0" },
  { label: "Black", coat: "#2b2733", marks: "#1a1720", belly: "#3a3542" },
  { label: "White", coat: "#f3f0f4", marks: "#d8d2dc", belly: "#ffffff" },
  { label: "Brown tabby", coat: "#9a7656", marks: "#5d4430", belly: "#e2d2c0" },
  { label: "Cream", coat: "#ecd9b4", marks: "#cfb88d", belly: "#faf1df" },
  { label: "Blue-grey", coat: "#7d8aa0", marks: "#5f6b80", belly: "#c9d0dc" },
];

export const CATS_DEFAULT: { on: boolean; size: number; list: Cat[] } = {
  on: false,
  size: 1,
  list: [{ id: "mrrowr-murrr", name: "Mrrowr-murrr", coat: "#8a8794", marks: "#4e4b57", belly: "#d9d4de", eyes: "#a6d96a" }],
};

export type McpServer = {
  id: string;
  name: string;
  url: string;
  /** Sent as Authorization: Bearer, from Keys. */
  keyName: string;
  enabled: boolean;
  /** How its tools reach the characters. */
  exposure?: Exposure;
  /** Per tool (exact name or * pattern) overrides of exposure. */
  toolExposure?: Record<string, Exposure>;
  /** Extra headers; values may use ${KEY_NAME} from Keys. */
  headers?: Record<string, string>;
  timeout?: number;
  description?: string;
  /** How requests are sent; empty follows Connections → Web's default. */
  via?: Via;
  /** A character's own server (from her mcp.json): only she gets its tools. Empty: every character. */
  owner?: string;
  /** A program the desktop runs and talks to over its stdin/stdout (mcp.json "command"), once the locksmith allows it.
   *  ${KEY_NAME} in args and env come from Keys. */
  stdio?: StdioSpec;
};

export type StdioSpec = { command: string; args?: string[]; env?: Record<string, string>; cwd?: string };

export type WebPrefs = { search: "auto" | "ollama" | "searxng" | "ddg" | "wikipedia"; searx: string };

/** How requests leave the desktop by default (web search, page reading, http_request, backups, bridges). */
export type NetPrefs = { via: Via; /** Python for the relay: an executable or its folder; empty = find it. */ python?: string };

/** The inbound API: other programs can talk to the characters. */
export type ApiPrefs = { on: boolean; port: number; lan: boolean; keyName: string };

export type BackupPrefs = {
  url: string;
  keyName: string;
  everyHours: number;
  what: "full" | "config";
  encrypt: boolean;
  /** Name of the key in Keys holding the passphrase. */
  passName: string;
  includeKeys: boolean;
  on: boolean;
  last: number;
  lastError: string;
  retryAt: number;
};

export type SshHost = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  key: string;
  /** Approved host key; a different one is refused. */
  fingerprint: string;
  /** Ask before each command. */
  confirm: boolean;
};

export type InboxItem = { id: string; at: number; from: string; where: string; via: "vector" | "discord" | "desk"; text: string; note?: string; urgent?: boolean; done?: boolean };

/** A saved conversation. The open one's messages live in `messages`; the others are files in the vault. */
export type ChatMeta = {
  id: string;
  title: string;
  created: number;
  updated: number;
  count: number;
  /** Summary of the earlier part, after compacting. */
  summary?: string;
  /** Messages up to this time are covered by the summary and no longer sent. */
  summaryUpTo?: number;
};

/** How conversations are handled. Everything beyond the basics starts off. */
export type ChatPrefs = {
  /** Most recent messages sent with each turn. */
  historyLimit: number;
  /** Ollama context window (num_ctx); 0 leaves the model's own. */
  numCtx: number;
  /** Compact once this many messages have built up since the last summary; 0 = never. */
  compactAfter: number;
  /** Messages kept word for word when compacting. */
  keepRecent: number;
  /** Compact when the conversation is about this % of the context window; 0 = never. */
  compactAtPct: number;
  /** Connection and model that write summaries; empty = the character's own. */
  compactConn: string;
  compactModel: string;
  /** Put the date and time on every message the characters read. */
  stampTimes: boolean;
  /** When a chat ends (new chat, switching away), characters journal it. */
  autoJournal: boolean;
  /** ...and keep what they learned in memory. */
  learnFacts: boolean;
  /** Log each reply for fine-tuning (kept on this computer). */
  trajectories: boolean;
  /** With many skills: hide the list and let characters look skills up with find. */
  skillRouter: boolean;
  /** A reasoning model's thinking: folded above the reply, open, or not shown. */
  thinking: "collapsed" | "open" | "hidden";
  /** Ask Ollama's reasoning models to think (think: true). */
  askThink: boolean;
  /** Only the MEMORY.md lines that fit what's being talked about go in the prompt. */
  rankMemory: boolean;
  /** How many lines when ranking. */
  memoryTopK: number;
};

export const CHAT_DEFAULT: ChatPrefs = {
  historyLimit: 40,
  numCtx: 0,
  compactAfter: 0,
  keepRecent: 12,
  compactAtPct: 0,
  compactConn: "",
  compactModel: "",
  stampTimes: false,
  autoJournal: false,
  learnFacts: false,
  trajectories: false,
  skillRouter: false,
  thinking: "collapsed",
  askThink: false,
  rankMemory: false,
  memoryTopK: 12,
};

/** Notes: where daily notes and templates live, and how notes open. */
export type NotesPrefs = {
  templates: string;
  daily: string;
  dailyFormat: string;
  /** A note in the templates folder used for new daily notes; empty = a plain heading. */
  dailyTemplate: string;
  view: "read" | "edit" | "split";
  /** The links, tags and properties panel. */
  panel: boolean;
  /** Starter notes were offered once. */
  seeded: boolean;
};

export const NOTES_DEFAULT: NotesPrefs = { templates: "Templates", daily: "Daily", dailyFormat: "YYYY-MM-DD", dailyTemplate: "", view: "split", panel: true, seeded: false };

/** One character's own settings. Anything left out follows the shared defaults. */
export type CharPrefs = {
  look: Look;
  connection?: string;
  model?: string;
  temperature?: number;
  tools?: boolean;
  maxSteps?: number;
  /** How much they tend to say. */
  length?: "short" | "normal" | "long";
  /** volume here is relative to the master voice volume, 0..1.5. */
  voice?: {
    on?: boolean;
    voiceName?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    engine?: string;
    engineVoice?: string;
    /** A recording of how they should sound (a vault path), what's said in it, and how long it is: for engines that clone. */
    sample?: string;
    sampleText?: string;
    sampleSeconds?: number;
  };
  /** Their full avatar (Live2D, VRM, or an animated picture), kept in the vault. */
  avatar?: AvatarAsset;
  /** Vector memory, as in Classic (Config → Embeddings): her memory, journal and notes searchable by meaning. */
  memory?: MemoryPrefs;
};

export type MemoryPrefs = {
  /** Keep her index of memory, journal (and notes) with embeddings. Off: keyword search only. */
  vectors?: boolean;
  /** Only the memory lines that fit the conversation go in the prompt, ranked by meaning and keywords. */
  rag?: boolean;
  /** How many lines when ranking. */
  ragK?: number;
  /** Index her other notes too, not only memory and journal. */
  notes?: boolean;
  /** The connection and model that make the embeddings (empty: her own connection, then Ollama on this computer). */
  connection?: string;
  model?: string;
};

export type ClassicApp = "pandora" | "jade";

export type GameState = {
  kind: "game" | "xdc";
  /** Built-in game slug, or the app's group key for webxdc. */
  slug: string;
  title: string;
  players: string[];
  /** webxdc only: which version is open and whose shared state it uses. */
  pkgId?: string;
  scope?: string;
  /** Path of the built-in game version being played. */
  path?: string;
};

export type HangPrefs = {
  /** How the characters appear in the scene. */
  style: "chibi" | "talking";
  /** Height of a character, as a share of the screen height. */
  size: number;
  bubbles: boolean;
  bubbleSeconds: number;
  wander: boolean;
  /** Also stand the characters on the normal desktop, behind the windows. */
  onDesktop: boolean;
  /** Whose scene fills the background: the character in focus, or one picked. */
  scene: "focus" | string;
  /** A picture from this device, used instead of a character's scene. */
  customScene: string;
  /** How many recent lines float above the chat bar. */
  lines: number;
  /** The chat in hangout mode: the conversation and the typing bar, only the bar, or neither (right-click the scene). */
  chat: "full" | "bar" | "off";
  /** Keep the controls on screen instead of hiding them when idle. */
  pinControls: boolean;
  /** How dark the scene is, 0 (bright) to 0.8, in Hangout and behind the desktop's windows alike. */
  dim: number;
  /** Windows shown over the scene in Hangout (picked from its right-click menu); the rest stay out of the way. */
  windows: AppId[];
};

export const HANG_DEFAULT: HangPrefs = {
  style: "chibi",
  size: 0.42,
  bubbles: true,
  bubbleSeconds: 14,
  wander: true,
  onDesktop: false,
  scene: "focus",
  customScene: "",
  lines: 4,
  chat: "full",
  pinControls: false,
  dim: 0.15,
  windows: [],
};

export type DockItem = AppId | "hangout" | "classic" | "|";

export type DockPrefs = {
  /** An edge, or "float": wherever it was dropped. */
  edge: "bottom" | "top" | "left" | "right" | "float";
  /** Where a floating dock sits (its top-left corner) and whether it stands upright. */
  float?: { x: number; y: number; vertical: boolean };
  /** Hidden until the pointer reaches its edge (or a swipe from it). */
  autoHide: boolean;
  /** Icon size in pixels. */
  size: number;
  /** Names under the icons. */
  labels: boolean;
  items: DockItem[];
  /** Set once Notes has been offered a place in the dock. */
  notesAdded?: boolean;
  musicAdded?: boolean;
  createAdded?: boolean;
  browserAdded?: boolean;
  vectorAdded?: boolean;
  explorerAdded?: boolean;
};

export const DOCK_DEFAULT: DockPrefs = {
  edge: "bottom",
  autoHide: false,
  size: 46,
  labels: false,
  items: ["room", "presence", "cast", "|", "notes", "music", "files", "journal", "terminal", "games", "studio", "|", "connections", "sentry", "keys", "settings", "|", "hangout", "classic"],
};

export type LibView = "grid" | "covers" | "list" | "compact";
export type LibSort = "name" | "played" | "added" | "size";
export type LibSection = "all" | "games" | "xdc" | "favourites" | "recent";

/** Per app (keyed by game slug or webxdc app key). */
/** wake: the characters playing answer when a person makes a move (default on for Jade Link). */
export type AppPrefs = { fav?: boolean; version?: string; separate?: boolean; played?: number; plays?: number; wake?: boolean };

export type State = {
  // desktop
  wins: Record<AppId, Win>;
  zTop: number;
  menuBar: boolean;
  /** Where the menu bar sits, and whether it hides until the pointer reaches its edge. */
  bar: { edge: "top" | "bottom"; autoHide: boolean };
  clock: ClockPrefs;
  wallpaper: boolean;
  fontSize: number;
  uiScale: number;
  classic: boolean;
  classicApp: ClassicApp;
  /** Chosen version per app; empty means the latest. */
  classicVersion: Record<ClassicApp, string>;
  firstRun: boolean;
  // characters
  custom: Character[];
  files: Record<string, Record<string, string>>;
  charPrefs: Record<string, CharPrefs>;
  // room
  members: string[];
  focus: string;
  messages: Message[];
  loopBreak: boolean;
  freeTalk: boolean;
  // AI
  model: ModelPrefs;
  mcp: McpServer[];
  bridges: Record<BridgeId, Bridge>;
  env: Record<string, string>;
  // people and safety
  accounts: Account[];
  kept: string | null;
  adult: Sealed | null;
  privacy: Privacy;
  flood: FloodState;
  wake: Record<Source, Role[]>;
  voice: VoicePrefs;
  /** Voice engines (speaking and listening) and which one turns your speech into text. */
  voices: VoiceEnginePrefs;
  sentryLog: string[];
  sensors: { battery: boolean; network: boolean; screen: boolean; tellRoom: boolean };
  hangout: boolean;
  hang: HangPrefs;
  dock: DockPrefs;
  chats: ChatMeta[];
  chatId: string;
  chat: ChatPrefs;
  notes: NotesPrefs;
  music: MusicPrefs;
  /** Engines for making pictures and songs, and the songs made. */
  media: MediaPrefs;
  /** The Browser's tabs, bookmarks and start page. */
  browser: BrowserPrefs;
  /** Shortcut bindings the person changed, by action id. */
  keys: Record<string, string>;
  touch: { edgeSwipe: boolean; doubleTapScene: boolean; longPress: boolean };
  /** Cats on the desktop; the first one listed is the senior cat. */
  cats: { on: boolean; size: number; list: Cat[] };
  /** Where each character stands in the scene, as shares of the screen (feet position). */
  spots: Record<string, { x: number; y: number }>;
  web: WebPrefs;
  net: NetPrefs;
  /** How the Classic apps' outside requests are sent. */
  classicVia: Via;
  api: ApiPrefs;
  backup: BackupPrefs;
  sshHosts: SshHost[];
  sshOn: boolean;
  inbox: InboxItem[];
  libView: LibView;
  libSort: LibSort;
  libSection: LibSection;
  appPrefs: Record<string, AppPrefs>;
  /** The webxdc version open in XDC Studio. */
  studioPkg: string;
  /** Toddler mode (kept across restarts until the passcode turns it off). */
  toddler: boolean;

  // memory only (not saved)
  session: string | null;
  adultOpen: boolean;
  sensorPass: boolean;
  busy: Record<string, string>;
  game: GameState | null;
  toast: string;
};

const W = (x: number, y: number, w: number, h: number, open = false): Win => ({ open, min: false, max: false, x, y, w, h, z: 1 });

/** New apps (Notes in 3.4, Music in 3.5) join a dock someone already arranged, once each. */
function withNotes(d: DockPrefs): DockPrefs {
  const items = [...d.items];
  if (!items.includes("notes") && !d.notesAdded) {
    const at = items.indexOf("files");
    items.splice(at < 0 ? items.length : at, 0, "notes");
  }
  if (!items.includes("music") && !d.musicAdded) {
    const at = items.indexOf("notes");
    items.splice(at < 0 ? items.length : at + 1, 0, "music");
  }
  if (!items.includes("create") && !d.createAdded) {
    const at = items.indexOf("music");
    items.splice(at < 0 ? items.length : at + 1, 0, "create");
  }
  if (!items.includes("browser") && !d.browserAdded) {
    const at = items.indexOf("create");
    items.splice(at < 0 ? items.length : at + 1, 0, "browser");
  }
  if (!items.includes("vector") && !d.vectorAdded) {
    const at = items.indexOf("room");
    items.splice(at < 0 ? 0 : at + 1, 0, "vector");
  }
  if (!items.includes("explorer") && !d.explorerAdded) {
    const at = items.indexOf("files");
    items.splice(at < 0 ? items.length : at, 0, "explorer");
  }
  return { ...d, items, notesAdded: true, musicAdded: true, createAdded: true, browserAdded: true, vectorAdded: true, explorerAdded: true };
}

export function defaultWins(): Record<AppId, Win> {
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight - 110;
  const wide = vw >= 1180;
  const presW = Math.min(360, Math.max(280, Math.round(vw * 0.3)));
  const presX = vw - presW - 16;
  const castW = wide ? 220 : 0;
  const roomX = wide ? castW + 30 : 12;
  const roomW = Math.max(300, presX - roomX - 12);
  const presH = Math.min(440, Math.round(vh * 0.62));
  return {
    room: W(roomX, 12, roomW, Math.max(320, vh - 20), true),
    presence: W(presX, 12, presW, presH, true),
    cast: W(12, 12, castW || 260, Math.max(320, vh - 20), wide),
    files: W(140, 80, 760, 520),
    explorer: W(120, 40, Math.min(1000, vw - 40), Math.min(640, vh - 10)),
    notes: W(110, 30, Math.min(1080, vw - 40), Math.min(700, vh - 10)),
    music: W(150, 40, Math.min(960, vw - 40), Math.min(620, vh - 10)),
    visualizer: W(220, 60, Math.min(720, vw - 40), Math.min(440, vh - 10)),
    create: W(100, 30, Math.min(1120, vw - 40), Math.min(720, vh - 10)),
    browser: W(80, 24, Math.min(1180, vw - 40), Math.min(760, vh - 10)),
    vector: W(140, 40, Math.min(980, vw - 40), Math.min(680, vh - 10)),
    journal: W(180, 90, 640, 520),
    terminal: W(200, 120, 640, 400),
    games: W(160, 40, Math.min(980, vw - 40), Math.min(660, vh - 10)),
    studio: W(120, 50, Math.min(980, vw - 40), Math.min(640, vh - 10)),
    connections: W(200, 70, 660, 580),
    sentry: W(220, 80, 620, 560),
    keys: W(240, 90, 520, 460),
    settings: W(180, 60, 760, 600),
    welcome: W(presX, presH + 24, presW, Math.max(180, Math.min(300, vh - presH - 30)), true),
  };
}

const builtInFiles = () => Object.fromEntries(BUILT_IN.map((c) => [c.id, { ...c.files }]));

const now = () => Date.now();
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

type Actions = {
  set: (partial: Partial<State>) => void;
  openApp: (id: AppId) => void;
  focusApp: (id: AppId) => void;
  closeApp: (id: AppId) => void;
  minimizeApp: (id: AppId) => void;
  toggleMax: (id: AppId) => void;
  moveApp: (id: AppId, box: Partial<Pick<Win, "x" | "y" | "w" | "h">>) => void;
  arrange: (how: "cascade" | "tile") => void;
  resetLayout: () => void;

  allCharacters: () => Character[];
  character: (id: string) => Character | undefined;
  visibleCharacters: () => Character[];
  roomCharacters: () => Character[];
  join: (id: string) => string;
  leave: (id: string) => void;
  setFocus: (id: string) => void;
  addCharacter: (c: Character) => void;
  updateCharacter: (id: string, patch: Partial<Character>) => void;
  removeCharacter: (id: string) => void;
  setCharPrefs: (id: string, patch: Partial<CharPrefs>) => void;
  setAppPrefs: (key: string, patch: Partial<AppPrefs>) => void;

  writeFile: (charId: string, path: string, body: string) => void;
  appendFile: (charId: string, path: string, text: string) => void;
  deleteFile: (charId: string, path: string) => void;
  renameFile: (charId: string, from: string, to: string) => void;
  filesOf: (charId: string) => Record<string, string>;

  post: (m: Omit<Message, "id" | "at"> & { at?: number }) => string;
  patchMessage: (id: string, patch: Partial<Message>) => void;
  notice: (text: string) => void;
  clearRoom: () => void;
  removeMessage: (id: string) => void;

  role: () => Role;
  /** Weigh incoming text with the flood gate. Returns a reason when it was blocked or tripped. */
  weigh: (text: string, source: Source, role: Role) => string;
  reopenGate: () => void;
  /** Back to the account list. The adult shelf locks too. */
  lock: (forget?: boolean) => void;
  log: (line: string) => void;
  say: (text: string) => void;
};

export type Store = State & Actions;

const INITIAL: State = {
  wins: defaultWins(),
  zTop: 10,
  menuBar: true,
  bar: { edge: "top", autoHide: false },
  clock: CLOCK_DEFAULT,
  wallpaper: true,
  fontSize: 15,
  uiScale: 1,
  classic: false,
  classicApp: "pandora",
  classicVersion: { pandora: "", jade: "" },
  firstRun: true,
  custom: [],
  files: builtInFiles(),
  charPrefs: {},
  members: [...DEFAULT_ROOM],
  focus: DEFAULT_ROOM[0],
  messages: [],
  loopBreak: true,
  freeTalk: false,
  model: MODEL_DEFAULT,
  mcp: [],
  bridges: { discord: BRIDGE_DEFAULT("discord"), vector: BRIDGE_DEFAULT("vector") },
  env: { OPENAI_API_KEY: "", OLLAMA_API_KEY: "", GROQ_API_KEY: "", OPENROUTER_API_KEY: "", AICORD_API_KEY: "", DISCORD_BRIDGE_TOKEN: "", VECTOR_BRIDGE_TOKEN: "" },
  accounts: [],
  kept: null,
  adult: null,
  privacy: PRIVACY_DEFAULT,
  flood: FLOOD_DEFAULT,
  wake: { desk: ["keyholder", "resident", "general"], discord: ["keyholder", "resident", "general"], vector: ["keyholder", "resident", "general"] },
  voice: VOICE_DEFAULT,
  voices: VOICE_ENGINES_DEFAULT,
  sentryLog: [],
  sensors: { battery: false, network: false, screen: false, tellRoom: false },
  hangout: false,
  hang: HANG_DEFAULT,
  dock: DOCK_DEFAULT,
  chats: [],
  chatId: "room",
  chat: CHAT_DEFAULT,
  notes: NOTES_DEFAULT,
  music: MUSIC_DEFAULT,
  media: MEDIA_DEFAULT,
  browser: BROWSER_DEFAULT,
  keys: {},
  touch: { edgeSwipe: true, doubleTapScene: true, longPress: true },
  cats: CATS_DEFAULT,
  spots: {},
  web: { search: "auto", searx: "" },
  net: { via: "desktop" },
  classicVia: "desktop",
  api: { on: false, port: 15700, lan: false, keyName: "DESKTOP_API_TOKEN" },
  backup: { url: "", keyName: "BACKUP_SERVER_TOKEN", everyHours: 24, what: "full", encrypt: true, passName: "BACKUP_PASSPHRASE", includeKeys: false, on: false, last: 0, lastError: "", retryAt: 0 },
  sshHosts: [],
  sshOn: false,
  inbox: [],
  libView: "grid",
  libSort: "name",
  libSection: "all",
  appPrefs: {},
  studioPkg: "",
  toddler: false,
  session: null,
  adultOpen: false,
  sensorPass: false,
  busy: {},
  game: null,
  toast: "",
};

export const useDesk = create<Store>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      set: (partial) => set(partial),

      openApp: (id) =>
        set((s) => {
          if (s.toddler && !inToddler(id)) return {};
          // Keep the window on screen if the screen got smaller since it was last placed.
          const vw = window.innerWidth;
          const vh = window.innerHeight - 100;
          const w0 = s.wins[id];
          const w = Math.min(w0.w, vw - 16);
          const h = Math.min(w0.h, vh - 10);
          const x = Math.max(4, Math.min(w0.x, vw - w - 8));
          const y = Math.max(0, Math.min(w0.y, vh - h));
          return { zTop: s.zTop + 1, wins: { ...s.wins, [id]: { ...w0, x, y, w, h, open: true, min: false, z: s.zTop + 1 } } };
        }),
      focusApp: (id) =>
        set((s) => (s.wins[id].z === s.zTop ? s : { zTop: s.zTop + 1, wins: { ...s.wins, [id]: { ...s.wins[id], z: s.zTop + 1 } } })),
      closeApp: (id) => set((s) => ({ wins: { ...s.wins, [id]: { ...s.wins[id], open: false, max: false } } })),
      minimizeApp: (id) => set((s) => ({ wins: { ...s.wins, [id]: { ...s.wins[id], min: true } } })),
      toggleMax: (id) =>
        set((s) => ({ zTop: s.zTop + 1, wins: { ...s.wins, [id]: { ...s.wins[id], max: !s.wins[id].max, z: s.zTop + 1 } } })),
      moveApp: (id, box) => set((s) => ({ wins: { ...s.wins, [id]: { ...s.wins[id], ...box } } })),
      arrange: (how) =>
        set((s) => {
          const open = APPS.filter((a) => s.wins[a.id].open && !s.wins[a.id].min).map((a) => a.id);
          const vw = window.innerWidth;
          const vh = window.innerHeight - 110;
          const wins = { ...s.wins };
          if (how === "cascade") {
            open.forEach((id, i) => (wins[id] = { ...wins[id], max: false, x: 30 + i * 32, y: 44 + i * 30, w: Math.min(720, vw - 80), h: Math.min(520, vh - 40) }));
          } else {
            const cols = Math.ceil(Math.sqrt(open.length || 1));
            const rows = Math.ceil((open.length || 1) / cols);
            const cw = Math.floor((vw - 16) / cols);
            const rh = Math.floor(vh / rows);
            open.forEach((id, i) => (wins[id] = { ...wins[id], max: false, x: 8 + (i % cols) * cw, y: 40 + Math.floor(i / cols) * rh, w: cw - 8, h: rh - 8 }));
          }
          return { wins };
        }),
      resetLayout: () => set({ wins: defaultWins() }),

      allCharacters: () => [...BUILT_IN, ...get().custom],
      character: (id) => get().allCharacters().find((c) => c.id === id),
      visibleCharacters: () => get().allCharacters().filter((c) => c.shelf !== "adult" || get().adultOpen),
      roomCharacters: () => {
        const all = get().visibleCharacters();
        return get()
          .members.map((id) => all.find((c) => c.id === id))
          .filter((c): c is Character => Boolean(c));
      },
      join: (id) => {
        const s = get();
        const c = s.character(id);
        if (!c) return "That character isn't on this desktop.";
        if (c.shelf === "adult" && !s.adultOpen) return "That character is on the adult shelf. Unlock it in Settings → Adult shelf.";
        if (s.members.includes(id)) {
          set({ focus: id });
          return "";
        }
        if (s.roomCharacters().length >= MAX_IN_ROOM) return `The room holds ${MAX_IN_ROOM} characters at a time, so it stays quick. Ask someone to step out first.`;
        if (!s.files[id]) set({ files: { ...s.files, [id]: { ...c.files } } });
        set({ members: [...s.members, id], focus: id });
        s.notice(`${c.short} joined the room.`);
        return "";
      },
      leave: (id) => {
        const s = get();
        const c = s.character(id);
        const members = s.members.filter((m) => m !== id);
        set({ members, focus: s.focus === id ? members[0] ?? "" : s.focus });
        if (c) s.notice(`${c.short} stepped out.`);
      },
      setFocus: (id) => set({ focus: id }),
      addCharacter: (c) =>
        set((s) => ({
          custom: [...s.custom.filter((x) => x.id !== c.id), { ...c, builtIn: false }],
          files: { ...s.files, [c.id]: { ...c.files, ...(s.files[c.id] ?? {}) } },
        })),
      updateCharacter: (id, patch) => set((s) => ({ custom: s.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeCharacter: (id) =>
        set((s) => {
          const files = { ...s.files };
          delete files[id];
          return { custom: s.custom.filter((c) => c.id !== id), members: s.members.filter((m) => m !== id), files };
        }),
      setCharPrefs: (id, patch) => set((s) => ({ charPrefs: { ...s.charPrefs, [id]: { ...{ look: "talking" as Look }, ...s.charPrefs[id], ...patch } } })),

      setAppPrefs: (key, patch) => set((s) => ({ appPrefs: { ...s.appPrefs, [key]: { ...s.appPrefs[key], ...patch } } })),
      filesOf: (charId) => {
        const s = get();
        return s.files[charId] ?? s.character(charId)?.files ?? {};
      },
      writeFile: (charId, path, body) => set((s) => ({ files: { ...s.files, [charId]: { ...s.filesOf(charId), [path]: body } } })),
      appendFile: (charId, path, text) =>
        set((s) => {
          const tree = s.filesOf(charId);
          const prev = tree[path] ?? "";
          return { files: { ...s.files, [charId]: { ...tree, [path]: prev ? `${prev.replace(/\n*$/, "")}\n${text}\n` : `${text}\n` } } };
        }),
      deleteFile: (charId, path) =>
        set((s) => {
          const tree = { ...s.filesOf(charId) };
          delete tree[path];
          return { files: { ...s.files, [charId]: tree } };
        }),
      renameFile: (charId, from, to) =>
        set((s) => {
          const tree = { ...s.filesOf(charId) };
          if (tree[from] === undefined || !to) return s;
          tree[to] = tree[from];
          delete tree[from];
          return { files: { ...s.files, [charId]: tree } };
        }),

      post: (m) => {
        const id = uid();
        set((s) => ({ messages: [...s.messages, { ...m, id, at: m.at ?? now() }].slice(-Math.min(5000, Math.max(400, s.chat.historyLimit + 50))) }));
        return id;
      },
      patchMessage: (id, patch) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      notice: (text) => {
        get().post({ kind: "notice", who: "desk", name: "Desk", text, source: "desk" });
      },
      clearRoom: () => set({ messages: [] }),
      removeMessage: (id) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

      role: () => {
        const s = get();
        if (!s.accounts.length) return "keyholder";
        return s.accounts.find((a) => a.name === s.session)?.role ?? "general";
      },
      weigh: (text, source, role) => {
        const s = get();
        if (role !== "keyholder" && !s.wake[source].includes(role)) return "Your account can't wake the characters from here. The keyholder can change that in Sentry.";
        if (s.flood.shut) {
          if (role === "keyholder") return "";
          return "The flood gate is shut, so the characters aren't reading or acting. The keyholder can reopen it in Sentry.";
        }
        if (!s.flood.armed) return "";
        const j = judge(s.flood.recent, text, now());
        if (j.trip) {
          set({ flood: { ...s.flood, shut: true, reason: j.trip, at: now(), recent: [] } });
          s.log(`Flood gate shut: ${j.trip}`);
          s.openApp("sentry");
          return `Flood gate shut: ${j.trip} The characters stopped and general access is off. The keyholder can still talk with them, and can reopen the gate in Sentry.`;
        }
        set({ flood: { ...s.flood, recent: j.recent } });
        return "";
      },
      lock: (forget = false) =>
        set((s) => ({
          session: null,
          kept: forget && s.kept === s.session ? null : s.kept,
          adultOpen: false,
          sensorPass: false,
          members: s.members.filter((id) => s.character(id)?.shelf !== "adult"),
        })),
      reopenGate: () => {
        set((s) => ({ flood: { ...s.flood, shut: false, reason: "", recent: [] } }));
        get().log("Flood gate reopened by the keyholder.");
      },
      log: (line) => set((s) => ({ sentryLog: [`${new Date().toLocaleString()} · ${line}`, ...s.sentryLog].slice(0, 200) })),
      say: (text) => {
        set({ toast: text });
        window.setTimeout(() => {
          if (get().toast === text) set({ toast: "" });
        }, 4200);
      },
    }),
    {
      name: "pandora-dee-desktop",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { session: _session, adultOpen: _adultOpen, sensorPass: _sensorPass, busy: _busy, game: _game, toast: _toast, ...rest } = s;
        void _session;
        void _adultOpen;
        void _sensorPass;
        void _busy;
        void _game;
        void _toast;
        const out: Partial<Store> = {};
        for (const [k, v] of Object.entries(rest)) if (typeof v !== "function") (out as Record<string, unknown>)[k] = v;
        return out as Store;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const files = { ...builtInFiles(), ...(p.files ?? {}) };
        return {
          ...current,
          ...p,
          wins: { ...defaultWins(), ...(p.wins ?? {}) },
          files,
          model: { ...MODEL_DEFAULT, ...(p.model ?? {}) },
          cats: { ...CATS_DEFAULT, ...(p.cats ?? {}) },
          privacy: { ...PRIVACY_DEFAULT, ...(p.privacy ?? {}), streamer: { ...PRIVACY_DEFAULT.streamer, ...(p.privacy?.streamer ?? {}) } },
          bridges: {
            discord: { ...BRIDGE_DEFAULT("discord"), ...(p.bridges?.discord ?? {}) },
            vector: { ...BRIDGE_DEFAULT("vector"), ...(p.bridges?.vector ?? {}) },
          },
          voice: { ...VOICE_DEFAULT, ...(p.voice ?? {}), remote: undefined },
          voices: { ...VOICE_ENGINES_DEFAULT, ...(p.voices ?? {}), listen: { ...VOICE_ENGINES_DEFAULT.listen, ...(p.voices?.listen ?? {}) } },
          hang: { ...HANG_DEFAULT, ...(p.hang ?? {}) },
          web: { ...current.web, ...(p.web ?? {}) },
          net: { ...current.net, ...(p.net ?? {}) },
          // 8787 is the Vector bridge's port, so the inbound API moved off it
          api: { ...current.api, ...(p.api ?? {}), ...(p.api?.port === 8787 ? { port: 15700 } : {}) },
          backup: { ...current.backup, ...(p.backup ?? {}) },
          dock: withNotes({ ...DOCK_DEFAULT, ...(p.dock ?? {}) }),
          clock: { ...CLOCK_DEFAULT, ...(p.clock ?? {}) },
          bar: { edge: "top", autoHide: false, ...(p.bar ?? {}) },
          chat: { ...CHAT_DEFAULT, ...(p.chat ?? {}) },
          notes: { ...NOTES_DEFAULT, ...(p.notes ?? {}) },
          music: { ...MUSIC_DEFAULT, ...(p.music ?? {}) },
          media: { ...MEDIA_DEFAULT, ...(p.media ?? {}) },
          browser: { ...BROWSER_DEFAULT, ...(p.browser ?? {}) },
          flood: { ...FLOOD_DEFAULT, ...(p.flood ?? {}) },
        };
      },
    },
  ),
);

export const desk = () => useDesk.getState();

// The relay needs to know where Python is, when it was set in Connections → Web.
pythonFrom(() => useDesk.getState().net.python);
