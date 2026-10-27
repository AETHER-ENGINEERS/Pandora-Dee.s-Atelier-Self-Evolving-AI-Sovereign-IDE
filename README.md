# Pandora Dee Desktop — 3.7.0

A desktop you share with Pandora Dee, Jade and their friends. It brings together the original Pandora Dee page, Jade Vault, and the atelier "desk" builds into one app you can test.

**Status:** first release, MUCH more to come!!

## Start it

You need [Node.js](https://nodejs.org) 20 or newer.

- **Windows:** double-click `Start Pandora Dee.bat`. The first run installs what it needs, then your browser opens at http://localhost:15693.
- **Mac / Linux / by hand:**

```bash
npm install
npm run dev
```

Then open http://localhost:15693. To reach it from a phone on the same Wi-Fi, run `npm run dev -- --host` and open the address it prints (passwords need localhost or https, so set accounts up from the computer itself).

## Give the characters a mind

The characters need a model to talk. **Settings → AI**:

- **Ollama on this computer** is set up already. Install Ollama, then for example `ollama pull qwen3:8b`, and press **Check**.
- Add more connections: Ollama Cloud, Groq, llama.cpp, LM Studio, OpenRouter, any OpenAI-compatible server, or AICord characters. They're tried in order, so if one can't be reached the next one answers.
- Each character can use their own connection and model (Characters → click a character).
- API keys go in **Keys**. Connections refer to them by name.
- Anything that isn't on this computer is blocked until you allow it in **Settings → Privacy**, after reading what it shares.

## What's here

| Window | What it does |
| --- | --- |
| **Room** | Talk with everyone in the room. Name someone to talk to them, or say "everyone". Click a face to choose who answers by default. Icons along the top: let them talk, free talk, loop breaker, voice, stop. |
| **Presence** | One shared, movable, resizable window that shows whoever is talking, like a video call. Anime faces with lip-sync to the computer's own voices. Talking, Chibi or Photo per character. |
| **Characters** | Profiles, who's in the room (up to 6), invite / step out, a model per character, save a backup, create someone new, load a backup. You can also drag a backup (.json) anywhere onto the desktop. |
| **Notes** | Your own notes: markdown files in the vault, with `[[links]]` (suggested as you type), backlinks, `#tags`, embeds, math, task boxes you can tick, frontmatter, find and replace, a graph, daily notes and templates. Renaming carries links along; deleting moves to `.trash`. Import from Google Keep, Samsung Notes, Apple Notes, Word, PDF, HTML, text or a zip. When you ask, the characters read, write, edit, search and link notes with you (never for anyone on Discord or Vector). |
| **Music** | Your music folders (read where they are, with tags and covers) and files you add, internet radio from radio-browser.info, a **Worldband** map of about 5,000 stations to tune by clicking, sweeping a dial or scanning, a queue with shuffle and repeat, and visualizers: bars, a scope, or Milkdrop (Butterchurn, with presets you can import), in Music, in their own resizable window, full screen, or as the desktop background. Music lowers itself while a character speaks. Characters can play, pause, skip and queue for you, and (if you turn it on) say something when a new song starts, after listening to it for a few seconds. |
| **Files** | Each character's own files. SOUL.md (who they are), AGENTS.md (how they carry themselves) and MEMORY.md are read at the start of every conversation, so editing them changes the character. |
| **Journal** | Each character's quest journal and memory. "Write today's entry" and "Reflect into memory" ask the character to do it in their own voice. |
| **Terminal** | A shell over a character's files (`help` lists the commands). `ask` talks to the character privately. |
| **Games & Apps** | 51 built-in games plus your Vector apps (webxdc). Sections, search, sort, and four views (big tiles, cards, details list, compact). Every version of an app stays installed: pick which one Play opens, play any other, and choose whether versions share their game state. Import single `.xdc` files, a `.zip` of them, or a folder (drag and drop works too); identical files are kept once. Characters can play along: they read the screen, read the app's shared state, and send their own moves. |
| **XDC Studio** | Open any version of a Vector app and look inside. Imported versions stay untouched; "New version" makes an editable copy, which you can change here or in your own editor (its folder is shown), run, and save as `.xdc`. "New app from a template" starts a working multiplayer app. |
| **Hangout** | The scene on its own: the characters stand in it (talking bust, chibi, photo, or a full avatar: Live2D, VRM 3D, or an animated picture, with lip-sync; right-click a character to switch, and add avatars in their profile; with speech bubbles), wander a little, and can be dragged around. A slim chat bar and a few recent lines sit at the bottom; the rest of the desktop steps aside. Dock button, View → Hangout, or Ctrl/⌘+Shift+H; Esc comes back. They can also stand on the normal desktop behind the windows. |
| **Connections** | Everything that reaches past this computer, matching Pandora Dee and Jade Vault. **Discord and Vector** through their existing bridges: you (their locksmith), admins and the public each get what Classic gives them (people who aren't you never see your memory or files), trigger words, DM rules, pictures, Mini Apps, community invites, the Discord archive. **Inbox**: the secretary files messages for you. **Tool servers (MCP)**: direct, deferred, codemode or hidden, per server and per tool, resources, and mcp.json in and out. **Web**: Ollama web search, SearXNG, DuckDuckGo or Wikipedia. **SSH** to your own machines, with key approval and ask-before-commands. **Inbound API**: Classic's `/v1` routes for scripts and other apps. |
| **Sentry** | The flood gate (on by default) and the device watch (off by default; needs Privacy permission plus the adult passcode or shelf). |
| **Keys** | API keys and tokens, like environment variables. Never shown again, never in backups. |
| **Settings** | AI, look (text size, scale, wallpaper, menu bar), voice, privacy, accounts, adult shelf, backup and reset. |
| **Classic** | The original apps, unchanged: Pandora Dee 2.9.9.2 (and 2.9.0) and Jade Vault 2.18.2, built from their latest sources. The round button in the corner switches app and version or returns to the desktop (Ctrl/⌘+Shift+K). Each app keeps its own notes and settings. |

### The dock, keyboard and touch

- The dock can sit on any edge (drag its grip, or right-click it), hide until needed, show names, and hold whichever apps you choose in any order (Settings → Dock).
- Every desktop action has a shortcut you can change (Settings → Keyboard). Shortcuts with Ctrl/⌘+Shift work even while a game has the keyboard.
- Touch: tap a character to have them answer, drag them around, hold for options; double-tap the empty desktop for Hangout; swipe in from the edge for a hidden dock (Settings → Touch).

### Where things are kept

Vector apps and their saved game state live in a folder (Settings → Storage; this machine uses `F:\pandora-data`). Apps run on `127.0.0.1` while the desktop runs on `localhost`: two separate origins, so an app can never read the desktop's keys. Apps also can't reach the internet, as the webxdc standard requires. Characters, settings and the conversation live in the browser.

### What characters can do (tools)

With a model that supports tools (qwen3, llama 3.1+, gpt-oss, mistral…): list, read, write, append and search their own files; remember things; write their journal; read the open game's screen; read a Vector app's shared state and send their own updates and live messages (so they can join XDC-Chess as a real peer); post on Discord or Vector when connected; any tool from connected MCP servers; and, if Privacy allows web access, search the web, read pages, and call web APIs using `{{KEY_NAME}}` from Keys without seeing the key.

On Discord and Vector, only you (the locksmith: the id you set) get the tools; everyone else just talks.

### Safety pieces

- **Privacy:** None (default: nothing leaves the computer), Some (opt in feature by feature after reading the risk), or Conditional (like Some, only during hours you choose). The top bar always says "Local only" or that something is going out.
- **Streamer mode:** hides the names and/or messages of people coming in from Discord and Vector, plus anyone on the always-anonymous list. The characters stay on screen.
- **Flood gate:** 6 messages in 20 seconds, the same message 3 times, one huge message, or several large ones shut the gate. The characters stop and general access is off until the keyholder reopens it.
- **Loop breaker:** stops repeats, and waits for you after 6 character replies in a row. Off, it still stops at 16.
- **Accounts:** optional. The first account holds the keys. No password (the picture opens it) or a password (salted hash only), with "Always remember".
- **Adult shelf:** the desktop starts in family mode. Adult characters stay hidden until unlocked with the passcode, and it locks again with the desktop.

Everything is stored in your browser on your computer. **Settings → Backup and reset** saves or restores the whole desktop (without keys, passwords or the passcode), and can back up on a schedule to your own server (Jade Vault's `jade-backup-server.py`), encrypted on your computer first.

## For developers

```bash
npm test        # logic tests (flood gate, room, loop breaker, shell, privacy, backups, xdc manifests)
npm run build   # typecheck and build to dist/
```

`server/` is the local server Vite runs (`/api` for the library and game state, `/run` for apps on the app origin). `scripts/classic.mjs` installs a new Classic build (`node scripts/classic.mjs pandora|jade <built.html> <version>`); `scripts/cutout.py` makes the transparent character cut-outs used in Hangout.

Code map: `src/lib` is the logic (store, model connections, agent loop, tools, MCP client, bridges, privacy, flood gate, shell, voice); `src/apps` is one file per window; `src/ui` is the desktop, windows, menus and lock screen. `public/classic/pandora-dee.html` is the original page, untouched.

Original characters are shared under the AETHER-ENGINEERS Multiversal License. Jade and Jade Vault are their creator's work. Games by SunkissedButterfly (websim.ai).
