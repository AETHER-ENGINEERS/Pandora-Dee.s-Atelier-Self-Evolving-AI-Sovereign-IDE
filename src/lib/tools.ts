// What characters can do besides talk. Every tool works on the character's own files
// unless it says otherwise; anything that reaches past this computer checks privacy first.

import { desk } from "./store.ts";
import { allowed } from "./privacy.ts";
import type { ToolSpec } from "./model.ts";
import { links } from "./connections.ts";
import { httpRequest, webFetch, webSearch, type HttpArgs } from "./net.ts";
import { discordHistory, discordTool, notifyLocksmith, saveToVault, vectorTool } from "./messengers.ts";
import { allMcp, callMcp, listResources, readResource, runCodemode, searchMcp, specOf } from "./mcptools.ts";
import { sshTool } from "./ssh.ts";
import { backupTool } from "./serverBackup.ts";
import { gameScreen } from "./bus.ts";
import { describeRows, library, recentLive, sendLive, sendUpdate } from "./xdc.ts";
import { findSkill, searchSkills, skillsOf } from "./skills.ts";
import { allTasks, baseOf, cleanVaultPath, isNote, loadNotes, noteName, noteTags, resolveNote, searchNotes, tasksIn, toggleTaskText, useNotes, vaultIndex, writeNote } from "./notes.ts";
import { openNote } from "../ui/noteNav.ts";

/** Who is asking: the locksmith (the person who holds the keys: everything), an admin (messenger powers) or the public (their own chat). */
export type Scope = "locksmith" | "admin" | "public";

/** One character's turn: who it's for and where it came from. */
export type TurnCtx = {
  charId: string;
  scope: Scope;
  source: "desk" | "discord" | "vector";
  chatId?: string;
  msgId?: string;
  isGroup?: boolean;
  senderName?: string;
  /** Deferred MCP tools loaded with tool_search during this turn. */
  loaded: Set<string>;
};

type Tool = ToolSpec & { run: (charId: string, args: Record<string, unknown>, ctx: TurnCtx) => Promise<string> };

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : v == null ? fallback : String(v));

export function cleanPath(p: string) {
  return p
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function obj(props: Record<string, { type: string; description: string }>, required: string[] = []) {
  return { type: "object", properties: props, required };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function addToMemory(charId: string, fact: string, section = "What I've learned") {
  const s = desk();
  const tree = s.filesOf(charId);
  const memo = tree["MEMORY.md"] ?? "# Memory\n";
  const heading = `## ${section}`;
  let next: string;
  if (memo.includes(heading)) {
    const at = memo.indexOf(heading) + heading.length;
    const rest = memo.slice(at);
    const nextHeading = rest.search(/\n## /);
    const insertAt = nextHeading >= 0 ? at + nextHeading : memo.length;
    next = `${memo.slice(0, insertAt).replace(/\n*$/, "")}\n- ${fact}\n${memo.slice(insertAt)}`;
  } else {
    next = `${memo.replace(/\n*$/, "")}\n\n${heading}\n- ${fact}\n`;
  }
  s.writeFile(charId, "MEMORY.md", next);
}

export function addJournal(charId: string, title: string, story: string, nextStep: string) {
  const path = `journal/${today()}.md`;
  const entry = `## ${today()} · ${title.trim() || "Untitled"}\n\n${story.trim()}\n\n**Next:** ${nextStep.trim() || "—"}\n`;
  const s = desk();
  const prev = s.filesOf(charId)[path];
  s.writeFile(charId, path, prev ? `${prev.replace(/\n*$/, "")}\n\n${entry}` : `# Journal · ${today()}\n\n${entry}`);
  return path;
}

/** The lines of MEMORY.md that are kept facts ("- ..."), numbered from 1. */
export function memoryLines(charId: string) {
  const body = desk().filesOf(charId)["MEMORY.md"] ?? "";
  let section = "";
  const out: { n: number; line: number; section: string; text: string }[] = [];
  body.split("\n").forEach((l, i) => {
    const h = /^##\s+(.*)$/.exec(l);
    if (h) section = h[1].trim();
    const b = /^\s*[-*]\s+(.*)$/.exec(l);
    if (b) out.push({ n: out.length + 1, line: i, section, text: b[1].trim() });
  });
  return out;
}

/** Remove kept lines by number or by matching text. Returns how many went. */
export function forgetMemory(charId: string, which: string) {
  const lines = memoryLines(charId);
  const n = Number(which);
  const q = which.trim().toLowerCase();
  const gone = Number.isInteger(n) && n > 0 ? lines.filter((l) => l.n === n) : q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : [];
  if (!gone.length) return 0;
  const drop = new Set(gone.map((l) => l.line));
  const body = desk().filesOf(charId)["MEMORY.md"] ?? "";
  desk().writeFile(charId, "MEMORY.md", body.split("\n").filter((_, i) => !drop.has(i)).join("\n"));
  return gone.length;
}

const MEMORY: Tool = {
  name: "memory",
  description:
    "Your long-term memory (MEMORY.md). save: keep one short line; list: every kept line, numbered; search: lines matching words; forget: remove a line by its number or by words it contains.",
  parameters: obj(
    {
      action: { type: "string", description: "save, list, search or forget" },
      text: { type: "string", description: "save: the line to keep · search: words to look for · forget: the line's number, or words it contains" },
      section: { type: "string", description: "save: one of What I've learned, How I work now, Open threads that still pull, Notes to self" },
    },
    ["action"],
  ),
  run: async (id, a) => {
    const action = str(a.action).toLowerCase();
    const text = str(a.text);
    if (action === "save") {
      if (!text.trim()) return "Nothing to save.";
      addToMemory(id, text.replace(/\n+/g, " ").slice(0, 400), str(a.section, "What I've learned") || "What I've learned");
      return "Kept in MEMORY.md.";
    }
    const lines = memoryLines(id);
    if (action === "list") return lines.length ? lines.map((l) => `${l.n}. [${l.section || "Memory"}] ${l.text}`).join("\n") : "Your memory has no kept lines yet.";
    if (action === "search") {
      const words = text.toLowerCase().split(/\W+/).filter(Boolean);
      const hits = lines.filter((l) => words.some((w) => l.text.toLowerCase().includes(w)));
      return hits.length ? hits.map((l) => `${l.n}. [${l.section || "Memory"}] ${l.text}`).join("\n") : "Nothing in your memory matches.";
    }
    if (action === "forget") {
      const n = forgetMemory(id, text);
      return n ? `Forgot ${n} line${n === 1 ? "" : "s"}.` : "Nothing matched, so nothing was forgotten. Use list to see the numbers.";
    }
    return "Use save, list, search or forget.";
  },
};

const SKILL: Tool = {
  name: "skill",
  description:
    "Your skills (skills/<name>/SKILL.md in your files): instructions for particular tasks. list: every skill; find: skills that fit a task; load: read one before you start. Make a new one by writing skills/<name>/SKILL.md with a name and description at the top.",
  parameters: obj(
    {
      action: { type: "string", description: "list, find or load" },
      name: { type: "string", description: "load: the skill's name" },
      query: { type: "string", description: "find: what the task is about" },
    },
    ["action"],
  ),
  run: async (id, a) => {
    const files = desk().filesOf(id);
    const action = str(a.action).toLowerCase();
    if (action === "load") {
      const s = findSkill(files, str(a.name));
      return s ? `# Skill: ${s.name}\n\n${s.body}`.slice(0, 16000) : `There's no skill called ${str(a.name)}. Try list or find.`;
    }
    const list = action === "find" ? searchSkills(files, str(a.query)) : skillsOf(files);
    if (!list.length) return action === "find" ? "No skill fits that." : "You have no skills yet.";
    return list.map((s) => `- ${s.name}: ${s.description || "(no description)"}`).join("\n");
  },
};

const BASE: Tool[] = [
  {
    name: "files_list",
    description: "List the files in your own file space, optionally inside one folder.",
    parameters: obj({ folder: { type: "string", description: "Folder to list, e.g. journal. Empty for everything." } }),
    run: async (id, a) => {
      const folder = cleanPath(str(a.folder));
      const paths = Object.keys(desk().filesOf(id))
        .filter((p) => !folder || p.startsWith(`${folder}/`))
        .sort();
      return paths.length ? paths.join("\n") : "No files there.";
    },
  },
  {
    name: "file_read",
    description: "Read one of your own files.",
    parameters: obj({ path: { type: "string", description: "Path such as SOUL.md or notes/plan.md" } }, ["path"]),
    run: async (id, a) => {
      const body = desk().filesOf(id)[cleanPath(str(a.path))];
      return body === undefined ? `There's no file at ${str(a.path)}.` : body.slice(0, 12000);
    },
  },
  {
    name: "file_write",
    description: "Create or replace one of your own files with new content. Prefer file_append for adding to an existing file.",
    parameters: obj({ path: { type: "string", description: "Path to write" }, content: { type: "string", description: "The whole new content" } }, ["path", "content"]),
    run: async (id, a) => {
      const path = cleanPath(str(a.path));
      if (!path) return "That path is empty.";
      desk().writeFile(id, path, str(a.content));
      return `Saved ${path}.`;
    },
  },
  {
    name: "file_append",
    description: "Add text to the end of one of your own files (creating it if needed).",
    parameters: obj({ path: { type: "string", description: "Path" }, text: { type: "string", description: "Text to add" } }, ["path", "text"]),
    run: async (id, a) => {
      const path = cleanPath(str(a.path));
      if (!path) return "That path is empty.";
      desk().appendFile(id, path, str(a.text));
      return `Added to ${path}.`;
    },
  },
  {
    name: "files_search",
    description: "Search your own files for words. Returns matching lines with their file.",
    parameters: obj({ query: { type: "string", description: "Words to look for" } }, ["query"]),
    run: async (id, a) => {
      const q = str(a.query).toLowerCase().trim();
      if (!q) return "Nothing to search for.";
      const out: string[] = [];
      for (const [path, body] of Object.entries(desk().filesOf(id))) {
        body.split("\n").forEach((line, i) => {
          if (line.toLowerCase().includes(q) && out.length < 40) out.push(`${path}:${i + 1}: ${line.trim().slice(0, 200)}`);
        });
      }
      return out.length ? out.join("\n") : "No matches.";
    },
  },
  {
    name: "remember",
    description: "Keep something in your MEMORY.md: an observation about your own growth, a way of working that held, or an open thread. One short line.",
    parameters: obj(
      {
        fact: { type: "string", description: "The line to keep" },
        section: { type: "string", description: "One of: What I've learned, How I work now, Open threads that still pull, Notes to self" },
      },
      ["fact"],
    ),
    run: async (id, a) => {
      addToMemory(id, str(a.fact).replace(/\n+/g, " ").slice(0, 400), str(a.section, "What I've learned") || "What I've learned");
      return "Kept in MEMORY.md.";
    },
  },
  {
    name: "journal_write",
    description: "Write today's quest-journal entry: your own story of what happened with the people you were with, the humour that fit, and the clear next step.",
    parameters: obj(
      {
        title: { type: "string", description: "Quest-style title" },
        story: { type: "string", description: "A few short paragraphs, in your voice" },
        next: { type: "string", description: "The clear next step" },
      },
      ["title", "story", "next"],
    ),
    run: async (id, a) => `Written to ${addJournal(id, str(a.title), str(a.story), str(a.next))}.`,
  },
  {
    name: "game_screen",
    description: "Read the text currently showing in the open game or app, so you can play along.",
    parameters: obj({}),
    run: async () => {
      const g = desk().game;
      if (!g) return "No game or app is open.";
      return `${g.title}:
${(await gameScreen.read()).slice(0, 4000) || "(the screen has no readable text)"}`;
    },
  },
  {
    name: "app_updates",
    description: "For the open Vector app (webxdc): read the recent shared updates everyone (and you) sent, to see the game state and whose move it is.",
    parameters: obj({ since: { type: "number", description: "Only updates after this serial number. 0 for the latest few." } }),
    run: async (id, a) => {
      const g = desk().game;
      if (!g || g.kind !== "xdc" || !g.scope) return "No Vector app is open.";
      const rows = await library.updates(g.scope, Number(a.since ?? 0));
      const live = recentLive(g.scope);
      const parts = [
        `You play as address "ai:${id}" and name "${desk().character(id)?.short ?? id}".`,
        rows.length ? `Saved updates:\n${describeRows(rows, 20)}` : "No saved updates yet.",
        live.length ? `Live messages (recent):\n${live.map((l) => `${l.name}: ${l.text}`).join("\n")}` : "No live messages yet.",
      ];
      return parts.join("\n\n");
    },
  },
  {
    name: "app_send_live",
    description: "For the open Vector app (webxdc): send a live message, the way the app talks between devices in real time. Copy the shape of the live messages you saw in app_updates, with your own address and name (often this is how you join as a player: a hello or presence message).",
    parameters: obj({ message: { type: "string", description: "The message, usually JSON text" } }, ["message"]),
    run: async (id, a) => {
      const s = desk();
      const g = s.game;
      if (!g || g.kind !== "xdc" || !g.scope) return "No Vector app is open.";
      if (!g.players.includes(id)) return "You're not one of the players in this app.";
      const msg = typeof a.message === "string" ? a.message : JSON.stringify(a.message);
      sendLive(g.scope, `ai:${id}`, s.character(id)?.short ?? id, msg);
      return "Sent.";
    },
  },
  {
    name: "app_send_update",
    description: "For the open Vector app (webxdc): send an update as yourself, the same way another player's device would. Match the payload shape you see in app_updates. Use it to make your move.",
    parameters: obj(
      {
        payload: { type: "object", description: "The update payload, shaped like the app's own updates" },
        info: { type: "string", description: "Optional short line shown in chat, like 'Dee moved e7-e5'" },
      },
      ["payload"],
    ),
    run: async (id, a) => {
      const s = desk();
      const g = s.game;
      if (!g || g.kind !== "xdc" || !g.scope) return "No Vector app is open.";
      if (!g.players.includes(id)) return "You're not one of the players in this app. Someone can add you above the game list.";
      const c = s.character(id);
      const payload = typeof a.payload === "string" ? JSON.parse(a.payload) : a.payload;
      const row = await sendUpdate(g.scope, `ai:${id}`, c?.short ?? id, { payload, ...(a.info ? { info: str(a.info) } : {}) });
      return `Sent as update #${row.serial}.`;
    },
  },
];

const WEB: Tool[] = [
  {
    name: "web_search",
    description: "Search the web. Returns titles, addresses and snippets. Use it for current information, docs and error messages.",
    parameters: obj({ query: { type: "string", description: "What to search for" }, max: { type: "number", description: "How many results (1-10)" } }, ["query"]),
    run: async (_id, a) => webSearch(str(a.query), Number(a.max) || 5),
  },
  {
    name: "web_fetch",
    description: "Read a web page as plain text.",
    parameters: obj({ url: { type: "string", description: "The page address" } }, ["url"]),
    run: async (_id, a) => webFetch(str(a.url)),
  },
];

const HTTP: Tool = {
  name: "http_request",
  description:
    "Call an HTTP API: any method (GET, POST, PUT, PATCH, DELETE, HEAD) with query, headers and a JSON, form or raw body. Returns the status, key headers and the body (JSON pretty-printed). Binary answers (pictures, PDFs, .xdc apps) are saved under /vault/downloads and the path returned. Write keys as {{NAME}} from Keys; never ask anyone to paste a key into chat.",
  parameters: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] },
      url: { type: "string" },
      query: { type: "object", description: "Query parameters" },
      headers: { type: "object" },
      json: { description: "A JSON body" },
      form: { type: "object", description: "A form body" },
      body: { type: "string", description: "A raw body" },
      timeout: { type: "number", description: "Seconds, 1-120 (default 30)" },
      save_to: { type: "string", description: "File name for a binary answer" },
    },
    required: ["url"],
  },
  run: async (_id, a) => httpRequest(a as HttpArgs, (bytes, name) => saveToVault(`downloads/${new Date().toISOString().slice(0, 10)}/${name.replace(/[^\w.\- ]+/g, "_")}`, bytes)),
};

const VECTOR_TOOL: Tool = {
  name: "vector",
  description:
    'Vector messenger, where you are a bot account. Message people and channels, reply, react, show typing, send or download files, read chats, see profiles, manage communities (join with an invite link, accept invites, leave, invite, moderate) and play Mini Apps (xdc_apps → xdc_join → xdc_read / xdc_send → xdc_leave). "to" takes an npub, a channel id, "locksmith", or "here" (the chat you are answering). raw calls any vector-agent tool (locksmith only).',
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["send", "reply", "react", "typing", "edit", "delete", "send_file", "download", "read", "chats", "profile", "set_profile", "communities", "join", "invites", "accept_invite", "leave", "invite", "invite_link", "members", "kick", "ban", "block", "sync", "create_community", "xdc_apps", "xdc_join", "xdc_read", "xdc_send", "xdc_leave", "raw"] },
      to: { type: "string" },
      text: { type: "string" },
      message_id: { type: "string" },
      emoji: { type: "string" },
      path: { type: "string", description: "A file: one of yours, or /vault/…" },
      index: { type: "number" },
      limit: { type: "number" },
      npub: { type: "string" },
      community_id: { type: "string" },
      invite_url: { type: "string" },
      name: { type: "string" },
      about: { type: "string" },
      topic: { type: "string" },
      frame: { description: "A Mini App frame in the app's own format" },
      wait_ms: { type: "number" },
      tool: { type: "string" },
      args: { type: "object" },
    },
    required: ["action"],
  },
  run: async (_id, a, ctx) => vectorTool(a, ctx),
};

const DISCORD_TOOL: Tool = {
  name: "discord",
  description:
    'Discord, where you are a bot account. Message people (DM by user id) and channels, reply, react, show typing, send or download files, read channels, look people up, list servers and channels, and (for admins) kick, ban, unban or leave servers. A plain answer in a Discord chat is already sent as a reply: use this for anything else. "to" takes a channel id, "locksmith" or "here". Messages never ping @everyone, @here or roles.',
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["send", "reply", "react", "typing", "edit", "delete", "send_file", "download", "read", "profile", "guilds", "channels", "members", "leave", "kick", "ban", "unban"] },
      to: { type: "string" },
      user_id: { type: "string" },
      guild_id: { type: "string" },
      text: { type: "string" },
      message_id: { type: "string" },
      emoji: { type: "string" },
      path: { type: "string" },
      index: { type: "number" },
      limit: { type: "number" },
    },
    required: ["action"],
  },
  run: async (_id, a, ctx) => discordTool(a, ctx),
};

const DISCORD_HISTORY: Tool = {
  name: "discord_history",
  description:
    "Search the server's Discord archive without reading channels page by page. action: search (query in FTS5 syntax: words, \"a phrase\", OR, NOT, prefix*; optional channel, author, since, until as YYYY-MM-DD, limit), context (message_id, before, after), timeline (channel, since, until), channels, status.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["search", "context", "timeline", "channels", "status"] },
      query: { type: "string" },
      channel: { type: "string" },
      author: { type: "string" },
      since: { type: "string" },
      until: { type: "string" },
      message_id: { type: "string" },
      before: { type: "number" },
      after: { type: "number" },
      limit: { type: "number" },
      include_noise: { type: "boolean" },
    },
    required: ["action"],
  },
  run: async (_id, a, ctx) => discordHistory(a, ctx),
};

const NOTIFY: Tool = {
  name: "notify_locksmith",
  description: "Secretary: pass a message on to your locksmith (the person who holds the keys to your tools). It goes into their inbox and, depending on their setting, straight to them on Vector or Discord. Use it whenever someone asks you to tell them something, or something needs their attention.",
  parameters: obj({ message: { type: "string", description: "A clear summary: who, and what they want" }, urgent: { type: "boolean", description: "Only when it truly is" } }, ["message"]),
  run: async (_id, a, ctx) => notifyLocksmith(a, ctx),
};

const SSH: Tool = {
  name: "ssh",
  description:
    "Interactive SSH sessions to machines the person saved. hosts: saved names (you never see passwords or keys). open (host) starts a shell and returns a session id; the first time, the person approves the host key. send (session, text, enter, keys like [\"ctrl-c\"]) types and reads back; run (command, with a session or a host) runs and returns the output; read waits for more (wait_ms, quiet_ms, until); put/get write or read a remote text file; list; close; close_all. Some hosts ask the person before each command.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["hosts", "open", "send", "read", "run", "resize", "put", "get", "list", "close", "close_all"] },
      host: { type: "string" },
      session: { type: "string" },
      text: { type: "string" },
      keys: { type: "array", items: { type: "string" } },
      enter: { type: "boolean" },
      command: { type: "string" },
      read: { type: "boolean" },
      wait_ms: { type: "number" },
      quiet_ms: { type: "number" },
      until: { type: "string" },
      max_chars: { type: "number" },
      timeout_ms: { type: "number" },
      cols: { type: "number" },
      rows: { type: "number" },
      path: { type: "string" },
    },
    required: ["action"],
  },
  run: async (id, a) => sshTool(a, desk().character(id)?.short ?? "A character"),
};

const BACKUP: Tool = {
  name: "backup",
  description: "The scheduled backup to the person's own server. status: when it last ran and how it's set; now: back up right away; list: what's on the server. You can't restore; only the person can.",
  parameters: obj({ action: { type: "string", description: "status, now or list" } }, ["action"]),
  run: async (_id, a) => backupTool(a),
};

const APPS: Tool = {
  name: "apps",
  description:
    "The Vector apps (webxdc) in Games & Apps. list: installed apps and versions. read (app, since): an app's shared updates. send (app, payload): post an update in the app's own protocol (read its updates or source first). open (app): open it for the person. files / source (app, path): look inside. install (path): install a .xdc saved under /vault. export (app): save the chosen version as a .xdc under /vault/apps.",
  parameters: obj(
    {
      action: { type: "string", description: "list, read, send, open, files, source, install or export" },
      app: { type: "string", description: "App name, or a version id" },
      since: { type: "number", description: "read: only updates after this serial" },
      payload: { type: "object", description: "send: the update payload" },
      info: { type: "string", description: "send: a short line about it" },
      path: { type: "string", description: "source: a file inside the app; install: a .xdc under /vault" },
    },
    ["action"],
  ),
  run: async (id, a) => appsTool(id, a),
};

async function appsTool(charId: string, a: Record<string, unknown>) {
  const all = await library.list();
  const s = desk();
  const act = str(a.action);
  if (act === "list") {
    const groups = new Map<string, typeof all>();
    for (const p of all) groups.set(p.appKey, [...(groups.get(p.appKey) ?? []), p]);
    return [...groups.values()].map((v) => `${v[0].name} (${v[0].appKey}): ${v.map((p) => `${p.version || "?"} [${p.id}]`).join(", ")}${v[0].description ? ` — ${v[0].description.slice(0, 120)}` : ""}`).join("\n") || "No apps installed.";
  }
  if (act === "install") {
    const p = str(a.path).replace(/^\/vault\//, "");
    const res = await fetch(`/api/vault/file?path=${encodeURIComponent(p)}`);
    if (!res.ok) throw new Error(`There's no file at /vault/${p}.`);
    const r = await library.import(new File([await res.blob()], p.split("/").pop() || "app.xdc"));
    window.dispatchEvent(new Event("pdd-xdc-changed"));
    return r.added.length ? `Installed ${r.added.map((x) => `${x.name} ${x.version}`).join(", ")}.` : r.duplicates ? "That exact version is already installed." : `Couldn't install: ${r.errors.join(" ")}`;
  }
  const key = str(a.app).toLowerCase();
  const matches = all.filter((p) => p.id === key || p.appKey === key || p.name.toLowerCase() === key || p.name.toLowerCase().includes(key));
  if (!matches.length) throw new Error(`No app called ${str(a.app)}. Use list.`);
  const prefs = s.appPrefs[`xdc:${matches[0].appKey}`] ?? {};
  const pkg = matches.find((p) => p.id === key) ?? matches.find((p) => p.id === prefs.version) ?? matches[0];
  const scope = prefs.separate ? `${pkg.appKey}@${pkg.id}` : pkg.appKey;
  if (act === "read") {
    const rows = await library.updates(scope, Number(a.since) || 0);
    return rows.length ? describeRows(rows, 30) : "No updates yet.";
  }
  if (act === "send") {
    const c = s.character(charId);
    const row = await sendUpdate(scope, `ai:${charId}`, c?.short ?? charId, { payload: a.payload ?? {}, ...(a.info ? { info: str(a.info) } : {}) });
    return `Sent as update #${row.serial}.`;
  }
  if (act === "open") {
    const room = s.roomCharacters().map((x) => x.id);
    s.set({ game: { kind: "xdc", slug: pkg.appKey, title: pkg.name, players: room.includes(charId) ? [charId] : [], pkgId: pkg.id, scope } });
    s.openApp("games");
    return `Opened ${pkg.name} ${pkg.version} for the person.`;
  }
  if (act === "files") return (await library.files(pkg.id)).join("\n");
  if (act === "source") return (await library.read(pkg.id, str(a.path, "index.html"))).slice(0, 15000);
  if (act === "export") {
    const res = await fetch(library.exportUrl(pkg.id));
    const bytes = new Uint8Array(await res.arrayBuffer());
    return `Saved to ${await saveToVault(`apps/${pkg.appKey}-${(pkg.version || "version").replace(/[^\w.-]+/g, "_")}.xdc`, bytes)}.`;
  }
  throw new Error(`Unknown apps action "${act}".`);
}

// ---------- MCP ----------

const TOOL_SEARCH: Tool = {
  name: "tool_search",
  description: "Find MCP tools that aren't loaded yet and load them, so you can call them directly on your next step.",
  parameters: obj({ query: { type: "string", description: "What you need the tool to do" } }, ["query"]),
  run: async (_id, a, ctx) => {
    const found = searchMcp(str(a.query), allMcp().filter((e) => e.exposure === "deferred"));
    for (const e of found) ctx.loaded.add(e.name);
    return found.length ? `Loaded:\n${found.map((e) => `- ${e.name}: ${(e.tool.description ?? "").slice(0, 160)}`).join("\n")}` : "Nothing matched.";
  },
};

const CODEMODE: Tool = {
  name: "codemode",
  description:
    "Run JavaScript in a sandbox that can call MCP tools (no network of its own). Call a tool with await tools.mcp__server__tool({...}); find tools with searchTools('words'), inspect one with describeTool(name), list them with describeNamespace() or ALL_TOOLS. store(k, v) / load(k) keep values between steps. Only what you console.log or return reaches you.",
  parameters: obj({ code: { type: "string", description: "The script (top-level await works)" }, timeout: { type: "number", description: "Seconds (default 60)" } }, ["code"]),
  run: async (_id, a) => runCodemode(str(a.code), Number(a.timeout) || 60),
};

const RESOURCES: Tool[] = [
  {
    name: "list_mcp_resources",
    description: "List resources (files, records, documents) offered by MCP servers.",
    parameters: obj({}),
    run: async () => listResources(false),
  },
  {
    name: "list_mcp_resource_templates",
    description: "List resource templates offered by MCP servers.",
    parameters: obj({}),
    run: async () => listResources(true),
  },
  {
    name: "read_mcp_resource",
    description: "Read one MCP resource by server and uri.",
    parameters: obj({ server: { type: "string", description: "Server name" }, uri: { type: "string", description: "Resource uri" } }, ["server", "uri"]),
    run: async (_id, a) => readResource(str(a.server), str(a.uri)),
  },
];

function mcpTools(ctx: TurnCtx): Tool[] {
  const all = allMcp();
  if (!all.length) return [];
  const out: Tool[] = [];
  for (const e of all) {
    if (e.exposure === "direct" || (e.exposure === "deferred" && ctx.loaded.has(e.name))) out.push({ ...specOf(e), run: async (_id, a) => callMcp(e, a) });
  }
  if (all.some((e) => e.exposure === "deferred")) out.push(TOOL_SEARCH);
  if (all.some((e) => e.exposure === "codemode")) out.push(CODEMODE);
  out.push(...RESOURCES);
  return out;
}

/** The tools a character gets for this turn, by who is asking. */
// ---------- your notes (the vault) ----------

/** A note someone named, forgiving about ".md", case and folders. */
function findNote(raw: string): string | null {
  const p = cleanVaultPath(raw);
  if (!p) return null;
  const texts = useNotes.getState().texts;
  if (texts[p] !== undefined) return p;
  const want = [p.toLowerCase(), `${p.toLowerCase()}.md`];
  const hit = Object.keys(texts).find((k) => want.includes(k.toLowerCase()));
  return hit ?? resolveNote(p);
}

/** Where a write goes: an existing note, or a new path, refusing a near-duplicate of another note's name. */
function notePathForWrite(raw: string): string {
  let p = cleanVaultPath(raw);
  if (!p) throw new Error("Say which note: a path like Projects/Plan.md.");
  const found = findNote(raw);
  if (found && [p.toLowerCase(), `${p.toLowerCase()}.md`].includes(found.toLowerCase())) return found;
  if (!/\.[a-z0-9]{1,8}$/i.test(p)) p += ".md";
  if (isNote(p) && useNotes.getState().texts[p] === undefined) {
    const k = noteName(p).toLowerCase().replace(/[\s_-]+/g, " ").trim();
    const twin = vaultIndex().notes.find((q) => noteName(q).toLowerCase().replace(/[\s_-]+/g, " ").trim() === k);
    if (twin && !/^(readme|index)\.md$/i.test(baseOf(p)))
      throw new Error(`A note named "${noteName(twin)}" already exists at ${twin}. Read it and use note_edit to change it, or write to exactly "${twin}" to replace it. If you really need a separate note, pick a clearly different name.`);
  }
  return p;
}

const NOTES_TOOLS: Tool[] = [
  {
    name: "note_read",
    description: "Read one of your locksmith's notes (the shared vault), by path or name. Long notes come in parts: use offset to read on.",
    parameters: obj({ path: { type: "string", description: "e.g. Projects/Plan.md, or just Plan" }, offset: { type: "number", description: "Character to start from (for long notes)" } }, ["path"]),
    run: async (_id, a) => {
      await loadNotes();
      const p = findNote(str(a.path));
      if (!p) return `There's no note called ${str(a.path)}. Try notes_search.`;
      const text = useNotes.getState().texts[p] ?? "";
      const from = Math.max(0, Number(a.offset) || 0);
      const part = text.slice(from, from + 16000);
      return `${p}${from ? ` (from character ${from})` : ""}:\n${part}${from + 16000 < text.length ? `\n… ${text.length - from - 16000} more characters: read again with offset ${from + 16000}` : ""}`;
    },
  },
  {
    name: "note_write",
    description:
      "Create a note in the shared vault, or replace one completely. Prefer note_edit for changes to an existing note. Use [[Note name]] to link notes and #tags to group them.",
    parameters: obj({ path: { type: "string", description: "e.g. Projects/Plan.md" }, content: { type: "string", description: "The whole note, in markdown" } }, ["path", "content"]),
    run: async (_id, a) => {
      await loadNotes();
      const p = notePathForWrite(str(a.path));
      const had = useNotes.getState().texts[p] !== undefined;
      await writeNote(p, str(a.content));
      return `${had ? "Replaced" : "Created"} ${p}.`;
    },
  },
  {
    name: "note_edit",
    description: "Change part of a note: find this exact text and put the new text in its place. The old text must appear exactly once (add surrounding words to make it unique), or set all to replace every one.",
    parameters: obj(
      {
        path: { type: "string", description: "The note" },
        old: { type: "string", description: "Exact text to find" },
        new: { type: "string", description: "What to put instead (empty to delete it)" },
        all: { type: "boolean", description: "Replace every occurrence" },
      },
      ["path", "old", "new"],
    ),
    run: async (_id, a) => {
      await loadNotes();
      const p = findNote(str(a.path));
      if (!p) return `There's no note called ${str(a.path)}.`;
      const text = useNotes.getState().texts[p] ?? "";
      const old = str(a.old);
      if (!old) return "Say which text to change (old).";
      const n = text.split(old).length - 1;
      if (!n) return `That text isn't in ${p}. Read it again: the text must match exactly, spaces and line breaks included.`;
      if (n > 1 && !a.all) return `That text appears ${n} times in ${p}. Add some of the words around it so it's unique, or set all to change every one.`;
      await writeNote(p, a.all ? text.split(old).join(str(a.new)) : text.replace(old, () => str(a.new)));
      return `Changed ${a.all ? n : 1} place${a.all && n > 1 ? "s" : ""} in ${p}.`;
    },
  },
  {
    name: "notes_search",
    description: 'Search your locksmith\'s notes. Ranked by name, then how often the words appear, then how many notes link there. Search "#tag" for a tag. Returns paths with a snippet.',
    parameters: obj({ query: { type: "string", description: "Words, or #tag" }, limit: { type: "number", description: "Most results (default 10)" } }, ["query"]),
    run: async (_id, a) => {
      await loadNotes();
      const hits = searchNotes(str(a.query), Math.min(40, Number(a.limit) || 10));
      return hits.length ? hits.map((h) => `${h.path}\n  ${h.snippet}`).join("\n") : "Nothing matches.";
    },
  },
  {
    name: "note_links",
    description: "A note's connections: what it links to, what links to it (backlinks), links it has to notes that don't exist yet, and its tags. Without a path: the tags in use and notes nothing links to.",
    parameters: obj({ path: { type: "string", description: "The note (empty for the whole vault)" } }),
    run: async (_id, a) => {
      await loadNotes();
      const idx = vaultIndex();
      if (!str(a.path).trim()) {
        const tags = [...idx.tags.entries()].map(([t, s]) => `#${t} (${s.size})`).sort();
        const orphans = idx.notes.filter((p) => !idx.back.get(p)?.size && !idx.out.get(p)?.size);
        return `${idx.notes.length} notes, ${idx.words.toLocaleString()} words.\nTags: ${tags.join(", ") || "none"}\nNotes with no links either way: ${orphans.slice(0, 40).join(", ") || "none"}`;
      }
      const p = findNote(str(a.path));
      if (!p) return `There's no note called ${str(a.path)}.`;
      const list = (s?: Set<string>) => [...(s ?? [])].sort().join(", ") || "none";
      return `${p}\nLinks to: ${list(idx.out.get(p))}\nLinked from: ${list(idx.back.get(p))}\nNot written yet: ${list(idx.missing.get(p))}\nTags: ${noteTags(p).map((t) => `#${t}`).join(" ") || "none"}`;
    },
  },
  {
    name: "open_note",
    description: "Show a note to your locksmith: it opens in their Notes window.",
    parameters: obj({ path: { type: "string", description: "The note" } }, ["path"]),
    run: async (_id, a) => {
      await loadNotes();
      const p = findNote(str(a.path));
      if (!p) return `There's no note called ${str(a.path)}.`;
      openNote({ target: p });
      return `Opened ${p} for them.`;
    },
  },
  {
    name: "tasks",
    description: "Task checkboxes across the notes. list: open tasks (or all with done=true); tick or untick: one task, by its note and its text (or number from list).",
    parameters: obj(
      {
        action: { type: "string", description: "list, tick or untick" },
        path: { type: "string", description: "list: only this note · tick/untick: the task's note" },
        task: { type: "string", description: "tick/untick: words from the task, or its number in that note's list" },
        done: { type: "boolean", description: "list: include finished tasks" },
      },
      ["action"],
    ),
    run: async (_id, a) => {
      await loadNotes();
      const action = str(a.action, "list").toLowerCase();
      if (action === "list") {
        const only = str(a.path) ? findNote(str(a.path)) : null;
        const rows = allTasks(!a.done, [desk().notes.templates]).filter((t) => !only || t.path === only);
        return rows.length ? rows.slice(0, 80).map((t) => `${t.path} #${t.n + 1} [${t.done ? "x" : " "}] ${t.text}`).join("\n") : "No tasks there.";
      }
      const p = findNote(str(a.path));
      if (!p) return "Say which note the task is in (path).";
      const text = useNotes.getState().texts[p] ?? "";
      const list = tasksIn(text, p);
      const want = str(a.task).trim();
      const t = /^\d+$/.test(want) ? list[Number(want) - 1] : list.find((x) => x.text.toLowerCase().includes(want.toLowerCase()));
      if (!t) return `No task like that in ${p}.`;
      await writeNote(p, toggleTaskText(text, t.n, action !== "untick"));
      return `${action === "untick" ? "Unticked" : "Ticked"}: ${t.text}`;
    },
  },
];

const MUSIC_TOOL: Tool = {
  name: "music",
  description:
    "The desktop's music player. now: what's playing; play / pause / next / previous; search: songs in the library (title, artist, album, genre); play_song: play matching songs (query); queue: add matching songs after the current one; stations: saved radio stations; play_station: a saved station by name. Only when your locksmith asks, or clearly would like it.",
  parameters: obj(
    {
      action: { type: "string", description: "now, play, pause, next, previous, search, play_song, queue, stations or play_station" },
      query: { type: "string", description: "search / play_song / queue: words from the title, artist, album or genre · play_station: the station's name" },
    },
    ["action"],
  ),
  run: async (_id, a) => {
    const m = await import("./music.ts");
    const act = str(a.action).toLowerCase();
    const q = str(a.query);
    if (!m.useMusic.getState().loaded) await m.loadLibrary().catch(() => undefined);
    if (act === "now") return m.nowPlayingText();
    if (act === "play" || act === "pause") {
      const playing = m.useMusic.getState().playing;
      if ((act === "play") !== playing) m.toggle();
      return act === "play" ? `Playing. ${m.nowPlayingText()}` : "Paused.";
    }
    if (act === "next" || act === "previous") {
      if (act === "next") await m.next();
      else m.previous();
      await new Promise((r) => setTimeout(r, 300));
      return m.nowPlayingText();
    }
    if (act === "stations") {
      const st = desk().music.stations;
      return st.length ? st.map((s) => `- ${s.name}${s.tags ? ` (${s.tags.split(",").slice(0, 3).join(", ")})` : ""}`).join("\n") : "No saved stations.";
    }
    if (act === "play_station") {
      const st = desk().music.stations;
      const i = st.findIndex((s) => s.name.toLowerCase().includes(q.toLowerCase()));
      if (i < 0) return `No saved station called ${q}.`;
      m.playList(st.map((s) => ({ kind: "radio", ...s })), i);
      return `Playing ${st[i].name}.`;
    }
    const hits = m.searchLibrary(q, act === "search" ? 25 : 200);
    if (act === "search") return hits.length ? hits.map((t) => `- ${t.title}${t.artist ? ` · ${t.artist}` : ""}${t.album ? ` (${t.album})` : ""}`).join("\n") : "Nothing in the library matches.";
    if (!hits.length) return "Nothing in the library matches.";
    const items = hits.map((t) => ({ kind: "track" as const, ...t }));
    if (act === "queue") {
      m.useMusic.setState((s) => ({ queue: [...s.queue.slice(0, s.index + 1), ...items, ...s.queue.slice(s.index + 1)] }));
      if (m.useMusic.getState().index < 0) m.playList(items);
      return `Queued ${items.length} song${items.length === 1 ? "" : "s"}.`;
    }
    m.playList(items);
    return `Playing ${hits.length} song${hits.length === 1 ? "" : "s"}: ${hits[0].title}${hits.length > 1 ? " first" : ""}.`;
  },
};

const SIZES: Record<string, [number, number]> = { square: [1024, 1024], portrait: [832, 1216], landscape: [1216, 832], wide: [1344, 768] };

const MAKE_PICTURE: Tool = {
  name: "make_picture",
  description:
    "Make a picture with the desktop's picture engine. Describe it fully (subject, setting, light, style). It's saved in the vault; show it in your reply with the Markdown the result gives you. Only when your locksmith asks, or clearly would like one.",
  parameters: obj(
    {
      prompt: { type: "string", description: "What the picture shows, in detail" },
      size: { type: "string", description: "square, portrait, landscape or wide (default square)" },
      leave_out: { type: "string", description: "Things to keep out of it (optional)" },
    },
    ["prompt"],
  ),
  run: async (_id, a) => {
    const engine = desk().media.images.find((e) => e.enabled);
    if (!engine) return "No picture engine is set up (Create → Imagine → engines).";
    const media = await import("./media.ts");
    const [w, h] = SIZES[str(a.size).toLowerCase()] ?? SIZES.square;
    const pics = await media.makePictures(engine, { prompt: str(a.prompt), negative: str(a.leave_out), width: w, height: h, count: 1 }, () => undefined);
    const [path] = await media.savePictures(pics, str(a.prompt));
    return `Saved ${path}. To show it: ![${str(a.prompt).slice(0, 60).replace(/[[\]]/g, "")}](/api/vault/raw/${path.split("/").map(encodeURIComponent).join("/")})`;
  },
};

const MAKE_SONG: Tool = {
  name: "make_song",
  description:
    "Make a song with the desktop's song engine. Give a title, a style line (genre, mood, instruments, vocals) and lyrics with [Verse] / [Chorus] / [Bridge] tags. It takes a few minutes and runs in the background; it lands in the music library and Music → Make a song. Only when your locksmith asks.",
  parameters: obj(
    {
      title: { type: "string", description: "The song's title" },
      style: { type: "string", description: "Comma-separated genre, mood, instruments, tempo, vocals" },
      lyrics: { type: "string", description: "Lyrics with section tags; leave empty for an instrumental" },
      seconds: { type: "number", description: "Length in seconds (30-240, default 120)" },
    },
    ["title", "style"],
  ),
  run: async (charId, a) => {
    const engine = desk().media.songs.find((e) => e.enabled);
    if (!engine) return "No song engine is set up (Music → Make a song → engines).";
    const { startSong } = await import("../apps/SongMaker.tsx");
    const title = str(a.title) || "Untitled";
    const lyrics = str(a.lyrics);
    const name = desk().character(charId)?.name ?? charId;
    startSong(engine, { title, style: str(a.style), lyrics, instrumental: !lyrics.trim(), seconds: Math.max(30, Math.min(240, Number(a.seconds) || 120)) }, (song, error) =>
      desk().post({ kind: "notice", who: "desk", name: "Desk", text: song ? `${name}'s song “${song.title}” is ready in Music.` : `${name}'s song “${title}” didn't work out: ${error}`, source: "desk", quiet: !song }),
    );
    return `Started “${title}” on ${engine.name}. It takes a few minutes; the desk will say when it's ready.`;
  },
};

/** Classic's names for the note tools. */
const NOTE_ALIASES: Record<string, string> = { read: "note_read", write: "note_write", edit: "note_edit", notify_owner: "notify_locksmith" };

export function toolsFor(ctx: TurnCtx): Tool[] {
  const s = desk();
  const web = allowed(s.privacy, "web");
  const vector = Boolean(links.client("bridge:vector"));
  const discord = Boolean(links.client("bridge:discord"));
  if (ctx.scope !== "locksmith") {
    const list: Tool[] = [];
    if (ctx.source === "vector" && vector) list.push(VECTOR_TOOL);
    if (ctx.source === "discord" && discord) list.push(DISCORD_TOOL, DISCORD_HISTORY);
    if (ctx.source !== "desk") list.push(NOTIFY);
    if (web) list.push(WEB[0]);
    return list;
  }
  const list = [...BASE, MEMORY, SKILL, ...NOTES_TOOLS, MUSIC_TOOL, APPS, NOTIFY];
  if (web) list.push(...WEB, HTTP);
  if (vector) list.push(VECTOR_TOOL);
  if (discord) list.push(DISCORD_TOOL, DISCORD_HISTORY);
  if (s.sshOn && allowed(s.privacy, "ssh")) list.push(SSH);
  if (s.media.characterTools) {
    if (s.media.images.some((e) => e.enabled)) list.push(MAKE_PICTURE);
    if (s.media.songs.some((e) => e.enabled)) list.push(MAKE_SONG);
  }
  if (s.backup.url) list.push(BACKUP);
  list.push(...mcpTools(ctx));
  return list;
}

export async function runTool(tools: Tool[], ctx: TurnCtx, name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  // Classic's names (read, write, edit, notify_owner) are understood too.
  const tool = tools.find((t) => t.name === name) ?? tools.find((t) => t.name === NOTE_ALIASES[name]);
  if (!tool) return { ok: false, text: `There's no tool called ${name} available here.` };
  try {
    return { ok: true, text: await tool.run(ctx.charId, args, ctx) };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) };
  }
}

export function describeCall(name: string, args: Record<string, unknown>) {
  const target = str(args.path ?? args.query ?? args.url ?? args.folder ?? args.title ?? args.fact ?? args.host ?? args.app ?? "");
  const label: Record<string, string> = {
    files_list: "looked through files",
    file_read: "read",
    file_write: "wrote",
    file_append: "added to",
    files_search: "searched files for",
    remember: "remembered",
    memory: "used memory",
    music: "used the music player",
    make_picture: "made a picture of",
    make_song: "started a song:",
    note_read: "read the note",
    note_write: "wrote the note",
    note_edit: "edited the note",
    notes_search: "searched notes for",
    note_links: "looked at the links of",
    open_note: "showed you",
    tasks: "looked at tasks",
    skill: "looked at skills",
    journal_write: "wrote in the journal",
    game_screen: "looked at the screen",
    app_updates: "checked the game state",
    app_send_update: "made a move",
    app_send_live: "spoke to the app",
    web_search: "searched the web for",
    web_fetch: "read",
    http_request: "called",
    vector: `used Vector (${str(args.action)})`,
    discord: `used Discord (${str(args.action)})`,
    discord_history: "searched the Discord archive for",
    notify_locksmith: "passed a message on to you",
    notify_owner: "passed a message on to you",
    ssh: `SSH ${str(args.action)}`,
    backup: `backup ${str(args.action)}`,
    apps: `apps ${str(args.action)}`,
    tool_search: "looked for tools to",
    codemode: "ran a tool script",
    list_mcp_resources: "listed resources",
    read_mcp_resource: "read a resource",
  };
  const verb = label[name] ?? `used ${name.replace(/^mcp__/, "").replace("__", " → ")}`;
  return target ? `${verb} ${target.slice(0, 60)}` : verb;
}
