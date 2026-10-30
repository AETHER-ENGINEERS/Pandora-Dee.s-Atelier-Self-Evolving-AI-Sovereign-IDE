# Parity with Classic

Every feature of Pandora Dee 2.9.9.2 and Jade Vault 2.18.2, and whether the desktop has it natively.
Built from both apps' docs, their tool lists, every setting and switch in their Config, their tabs
and their slash commands. The rule: nothing is dropped; where the two differ, you choose.

**Status:** ✅ the desktop has it · 🟡 partly · ❌ not yet · 📱 needs a phone or the native app (Phase 2)
**Source:** P = Pandora Dee only · J = Jade Vault only · blank = both

## 1. Notes (the Atelier / the vault)

| Feature | Src | Desktop | Notes |
| --- | --- | --- | --- |
| Markdown notes in folders, Edit / Read | | ✅ | Notes app; files in the vault |
| Split view (edit beside preview) | | ✅ | Edit / Both / Read |
| Formatting buttons (headings, links, lists, tasks, tags, quotes, code) | | ✅ | Plus math and tables; Ctrl B / Ctrl I |
| `[[wiki links]]`, `[[Note\|label]]`, `[[Note#Heading]]`, suggestions while typing `[[` | | ✅ | Also in chat replies |
| Missing links shown apart; tapping one creates the note | | ✅ | |
| Backlinks, outgoing links, unresolved links panel | | ✅ | |
| Tags (`#tag`, nested `#a/b`), tag filter | | ✅ | Frontmatter tags count too |
| Search ranked by name, text and backlinks | | ✅ | |
| Graph view, global and local (two hops) | | ✅ | |
| KaTeX math, inline and display | | ✅ | Bundled, works offline |
| Embeds: `![[Note]]`, `![[image.png\|300]]`, remote images | | ✅ | Remote pictures load only with web access on in Privacy |
| Frontmatter shown as properties | | ✅ | |
| Task checkboxes tick in Read mode | | ✅ | Plus a Tasks list across notes |
| Find and replace (match case, regex) | P | ✅ | |
| Rename a note or folder, links follow | P | ✅ | |
| Delete empty folders, Tidy | P | ✅ | Deleting moves to the vault's .trash |
| Import Google Keep, Samsung Notes, Apple Notes, HTML, Word, PDF, zip | P | ✅ | Classic's importer, ported |
| Daily notes, Inbox, Todo List, starter notes | | ✅ | |
| Attachments saved under `/attachments/` (PDF text extracted) | | ✅ | In notes and in chat |
| Note scripts: `dataviewjs` / `jade-js` blocks, inline `$=` | | ❌ | Needs the script sandbox: Runtimes batch |
| Templates (Templater syntax), templates folder, `{ }` button | | 🟡 | Date and file tags yes; code parts (`<%* %>`) with Runtimes |
| Let note scripts call tools (off by default) | | ❌ | Runtimes batch |

## 2. Chat with the AI

| Feature | Src | Desktop | Notes |
| --- | --- | --- | --- |
| Streaming replies, tool activity shown | | ✅ | |
| Several characters in one room | | ✅ | Desktop-only, beyond Classic |
| Multiple saved chats (new, switch, rename, delete) | | ✅ | Chat menu in the Room; saved as files in the vault (.pandora/chats) |
| Copy, 👍 / 👎, Retry the latest reply | | ✅ | Also in the right-click menu |
| Edit and resend your own message, copy code blocks, copy whole chat | | ✅ | |
| Slash commands: /new /clear /compact /context /copy /models /memory /journal /skills /help /config /mcp /vector /discord /heartbeat /schedule /inbox /voice /trajectories /characters | | 🟡 | All, plus /chats /open /rename /retry /skill:name, with suggestions as you type; /heartbeat and /schedule wait for Automation |
| Attach files and pictures; picture understanding with a vision model | | ✅ | Button, paste or drop; text files are read in; PDF text comes with Notes |
| Context window (`num_ctx`), max tool rounds, temperature | | ✅ | Settings → Conversations |
| Context guard: compact after N turns, keep recent turns, compact at % full, compaction model | | ✅ | Off until set |
| Date and time on every message | | ✅ | Option, off by default |
| Include thinking (reasoning models) | | ✅ | Folded above the reply (or open, or hidden); `<think>`, Ollama and OpenAI-style reasoning |
| SYSTEM.md replaces the base prompt | | ✅ | Per character |
| Model remembered per provider; checks the primary again after a fallback | | ✅ | Each connection keeps its model; a failed one rests 3 minutes, then is tried first again |
| Trajectory log, 👍/👎 filter, export JSONL (OpenAI tools or ShareGPT) | | ✅ | Off until turned on; kept in the vault |

## 3. Memory, journal, skills

| Feature | Src | Desktop | Notes |
| --- | --- | --- | --- |
| Memory.md read every chat | | ✅ | Per character |
| Memory tool: save, list, search, forget | | ✅ | `memory` tool; `remember` stays |
| Rank memories: only matching lines go in the prompt (top-k) | | ✅ | Off until turned on (Settings → Conversations) |
| Journal finished chats automatically, learn facts from them | | ✅ | Off until turned on; runs in the background when a chat ends |
| Embeddings (Ollama `/api/embed`), hybrid keyword + meaning search, sqlite-vec index | | ❌ | |
| `embeddings` tool: search, add, index notes, remove, compare, status | J | ❌ | |
| `chat_history` tool: list, read, search raw chats | J | ❌ | |
| Skills (`skills/<name>/SKILL.md`), `/skill:name`, `skill` tool | | ✅ | Per character |
| Skill router and `find_skill` (many skills) | J | ✅ | `skill` tool's find; router option off by default |
| Tool router and `more_tools` (token saving) | J | ❌ | |

## 4. Agent tools

| Tool | Src | Desktop | Notes |
| --- | --- | --- | --- |
| read, write, `edit` (exact replace), notes_search, note_links, open_note, tasks | | ✅ | note_read / note_write / note_edit (Classic's names work too); characters' own files too |
| bash (the shell) | | ❌ | |
| web_search (Ollama web search, SearXNG, DuckDuckGo, Wikipedia), web_fetch | | ✅ | Connections → Web picks the provider |
| http_request (query, json/form/raw body, timeout, binary to vault, secrets) | | ✅ | Binary answers saved under /vault/downloads; keys blanked in replies |
| MCP: codemode, deferred (`tool_search`), direct, hidden; per-tool exposure; resources; `mcp.json`; header secrets | | ✅ | |
| decide (Ollaya decision service) | | ❌ | |
| schedule, flow / ritual, playbook | | ❌ | |
| apps (webxdc list, read, send, open, files, source, install, export) | | ✅ | Plus "answer when you make a move" per app |
| vector, discord, discord_history, notify_owner (now notify_locksmith) | | ✅ | Every Classic action, with locksmith / admin / public limits |
| delegate (sub-agent) | J | ❌ | |
| think (tree of thoughts, verified) | J | ❌ | |
| curiosity wake-ups | J | ❌ | |
| backup (check and start) | J | ✅ | |
| ssh | J | ✅ | Runs through the desktop server; host-key approval, ask-before-commands |
| browser (drive web pages), screen, look, senses, phone, sentry, litert | J | 📱 | Android features; browser comes with Phase 2 |

## 5. Automation

| Feature | Src | Desktop | Notes |
| --- | --- | --- | --- |
| Flows / Rituals tab: steps (tool, js, shell, decide, llm, agent, note, set, if, switch, each, wait, notify, flow, playbook, stop), expressions, retries, run logs | | ❌ | |
| Triggers: manual, schedule, note/folder change, shell, script, API | | ❌ | |
| Schedule tab: prompts, shell commands, flows; plain English and cron; catch-up; notify | | ❌ | |
| `crontab`, cron log | | ❌ | |
| Heartbeat (HEARTBEAT.md, active hours, own model, HEARTBEAT_OK) | | ❌ | |
| Playbooks tab (Ansible-style JSON, approvals, plan, run log) | J | ❌ | |
| Tasks tab (open tasks across notes) | | ❌ | |

## 6. Runtimes

| Feature | Src | Desktop | Notes |
| --- | --- | --- | --- |
| BusyBox shell (WebAssembly) with vault commands (search, tags, links, backlinks, open) | | 🟡 | Desktop terminal is a small built-in shell; Phase 3 adds full Linux |
| `node` sandbox (fs, path, fetch, https, `pandora.*` / `jade.*`, kv) | | ❌ | |
| MicroPython | | ❌ | |
| SQLite (`sqlite3`, `node:sqlite`, better-sqlite3, Python sqlite3) with sqlite-vec | | ❌ | |
| TensorFlow.js in scripts | | ❌ | |

## 7. Connections

| Feature | Src | Desktop | Notes |
| --- | --- | --- | --- |
| Providers: Ollama, Ollama Cloud, Groq, llama.cpp, OpenAI-compatible, AICord | | ✅ | Plus LM Studio, OpenRouter, several at once, per character |
| Fallback chain | | ✅ | |
| Connection method: browser, desktop relay (HTTP/HTTPS), cURL, Python; copy any request as cURL / Python / JS / HTTP | | ✅ | Desktop-only, beyond Classic; Classic inside the desktop uses it too |
| Vector: owner (here called the locksmith), admins, channel whitelist, DM policy, trigger words, check interval | | ✅ | |
| Vector: secretary (messages for you → inbox or at once), your name | | ✅ | Connections → Inbox |
| Vector: sees images, joins communities, reacts, typing, files | | ✅ | |
| Vector: plays Mini Apps, wakes on new moves | | ✅ | |
| Discord: same as Vector, plus archive name and `discord_history` search | | ✅ | |
| Inbound HTTP API (`/v1/chat`, status, history, chats, flows, flow, health; token; Wi-Fi switch) | | 🟡 | All routes, with real saved chats; /v1/flows and /v1/flow wait for the Automation batch |
| Jade Link (built-in messenger + shared board) | | ✅ | Installed with the desktop; the characters answer in it |
| Scheduled backup to a server, encrypted on device, Back up now, Restore | J | ✅ | Works with Classic's jade-backup-server.py |
| Full backup export / import, with or without keys | | ✅ | Server backups can include keys (always encrypted) |

## 8. Voice and senses

| Feature | Src | Desktop | Notes |
| --- | --- | --- | --- |
| Read replies aloud, voice, pitch, speed | | ✅ | Per character, plus volume |
| Avatar with lip-sync | | ✅ | Anime busts, chibi, photo, and full avatars: Live2D, VRM or animated picture, per character |
| Speech to text, hands-free listening, wake phrases, end-of-sentence pause | | ❌ | |
| Gem themes; hair, clothes, stockings, boots, skin colours | P | ❌ | Live2D-specific; desktop has character colours |
| Pointer-following eyes, scanlines, cyber grid | P | ❌ | |
| Kiosk mode, background mode, native notifications | | 📱 | |

## 9. Desktop-only (beyond Classic)

Hangout, several characters talking together, per-character AI and voice, flood gate, accounts,
adult shelf, privacy modes, streamer mode, Games & Apps with versions, XDC Studio, characters playing
webxdc apps as peers, rebindable shortcuts, right-click menus, movable dock.

## Classic, enhanced builds

Classic also offers each original app with the other one's features added: **Pandora Dee 2.9.9.2-jv2.22.1-enhanced**
and **Jade Vault 2.22.1-enhanced** (pick them in Classic's corner switcher or Settings → Classic; Jade Vault
2.22.1 as released, and the earlier 2.20.1, 2.20.1-enhanced, 2.18.2 and 2.18.2-enhanced builds are there too). Every feature
an enhanced build adds is **off until you turn it on** in that app's Config, so with nothing switched on each
behaves like the original it is built from. They are built from the upstream sources with patches and a script
kept outside this repo (a separate `classic-enhanced` folder: `build.sh --install`, patches in `patches/`).

**Pandora Dee 2.9.9.2-jv2.22.1-enhanced** is the same build carried forward to Jade Vault 2.22.1: Jade's 2.21–2.22.1
additions are in (the onnx tool sits under the local-models switch with look and litert; the usb tool has its own
switch; both start off), while Pandora keeps her own way of saving settings in IndexedDB. The earlier
2.9.9.2-enhanced, described next, stays in Classic.

**Pandora Dee 2.9.9.2-enhanced** = Pandora Dee 2.9.9.2 + everything Jade Vault 2.20.1 adds, merged from both
apps' sources and given Pandora's words (/Pandora paths, rituals, leaves). Jade's 2.18.3–2.20.1 improvements
need no switch and are simply in: the Rust core (WebAssembly that turns web pages into Markdown for web_fetch),
web_search and web_fetch running together when asked for at once, the tool list staying the same between turns
when the tool router is on, the faster incremental vault index, and the 2.20.1 fix that keeps one unreadable file
from breaking every shell command. Switches for the rest:

| Added from Jade Vault | Where to turn it on (Config) |
| --- | --- |
| Embeddings: hybrid memory search (SQLite FTS5 + sqlite-vec), the embeddings tool | Memory → Embeddings |
| Rank memories (now keywords + meaning) | Memory |
| Senses (camera, mic, location, sensors) and the Talk button (hands-free voice, wake phrases, vision and transcription models) | App → Voice & senses |
| look and litert (images and videos from the Atelier, .tflite models) | App → Voice & senses |
| Browser, phone, screen (Android app only) | App → Voice & senses |
| Sentry rules, SSH sessions (Android app only) | App → Voice & senses |
| think (tree of thoughts), delegate (sub-agent) | App → Voice & senses |
| chat_history (search past chats) | App → Voice & senses |
| Playbooks: the Playbooks tab, the playbook tool, playbook schedules and ritual steps | App → Voice & senses |
| Skill router (find_skill), tool router (more_tools: Off / Auto / On) | App → Voice & senses |
| Curiosity wake-ups | App → Voice & senses |
| Scheduled backup to a server (encrypted on device), backup tool | App → Background |
| Vault on real storage, kiosk mode (Android app only) | App |

Unlike Jade Vault, each tool has its own switch (there the senses switch also took phone, SSH, think and the
others with it). "Ask me before Pandora places a call, sends a text…" stays on: it is the safety check for those
tools, which are themselves off. Not included: the Jade Docs webxdc app (a separate app, not part of the page).

**Jade Vault 2.22.1-enhanced** = Jade Vault 2.22.1 + Pandora Dee 2.9.9.2's extras, in Jade's words (the same
extras as 2.20.1-enhanced, rebased onto the new code). 2.22.1 is upstream's 2.21–2.22.1 (the Jade Fleet client,
WebGPU on phones with TensorFlow.js, LiteRT and ONNX Runtime, the onnx and usb tools, the offline terminal, settings
kept in IndexedDB so nothing is lost on reload) merged with this project's own Jade Vault changes (the Chalice
Discord archive, quota failover, the persona). The extras:

| Added from Pandora Dee | Where to turn it on (Config) |
| --- | --- |
| Appearance tab: Jade's gem themes and layer colours (moved from App), atmosphere, text & layout | Appearance (always there; its switches start off) |
| Roomy layout: wide screens, draggable widths and dividers, list beside note, Jade beside chat | Appearance → Text & layout |
| Text size (85–150 %) | Appearance → Text & layout (starts at 100 %) |
| Drag to scroll button strips with the mouse or wheel | Appearance → Text & layout |
| Atmosphere: still eyes, no scanlines, no cyber grid (a soft gem glow) | Appearance → Atmosphere (each switch hides one; off keeps Jade's look) |
| Find & replace in the editor (🔍, Ctrl/Cmd+F, Ctrl+H) | App → Note tools |
| Rename & tidy (rename notes and folders with links following, delete empty folders) | App → Note tools |
| Import from notes apps (Google Keep, Samsung Notes, Apple Notes, HTML, Word, PDF) | App → Note tools |
| Pandora Dee backups: /Pandora files land in /Jade, rituals become flows (Pandora's migrate, reversed) | App → Note tools |

Also carried over: the layer-colour fix (recoloured hair, clothes and skin now reach the Live2D model).

## Build order

Your order: 1. Connections ✅ (3.2.0) · 2. Chat ✅ (3.3.0) · 3. Notes ✅ (3.4.0) · 4. Runtimes · 5. Automation · 6. Voice input.

1. **Connections** ✅: MCP modes and resources, web search providers, full http_request, Vector and Discord parity (admins, triggers, secretary, pictures, Mini Apps, archive), inbound API, encrypted server backups, Jade Link built in, SSH.
2. **Chat** ✅: saved chats, slash commands, ratings and Retry, attachments and vision, context guard, SYSTEM.md, skills, the memory tool, automatic journal, trajectories.
3. **Notes** ✅: your own notes vault with everything in section 1, plus the note tools in section 4.
4. **Runtimes**: note scripts and template code, shell with vault commands, node with `pandora.*`, MicroPython, SQLite, TensorFlow.js, embeddings and hybrid search, chat_history.
5. **Automation**: Flows/Rituals, Schedule and crontab, Heartbeat, Playbooks, Tasks, decide, delegate, think, curiosity.
6. **Voice in**: speech to text and hands-free; the Classic look options as desktop themes.
7. **Phone and native** (Phase 2): browser agent, sensors, phone control, LiteRT, kiosk and background mode.
