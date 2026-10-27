# Roadmap

Principle: nothing Pandora Dee or Jade Vault can do is removed. The desktop only adds and expands.
Where the two apps differ in a way that can't live side by side, the person chooses: one, the other, or off.

Source of truth for the two apps:

- Pandora Dee: https://github.com/AETHER-ENGINEERS/pandora-dee (2.9.9.2 when this was written)
- Jade Vault: https://github.com/lucky-edgelord/jade-vault (2.18.2 when this was written)

## Phase 1: done (3.1.0 test)

Hangout, characters on the desktop, cut-out art, a movable and customizable dock, rebindable
shortcuts, touch gestures, the Games & Apps library with four views, webxdc apps with every
version kept and characters playing as real peers, XDC Studio, the updated Little Dogs, Classic
with Pandora Dee and Jade Vault and their versions, and a library folder you can move.

## Requested 2026-10-26 (your list), with priority

Done in 3.4.0:
- ✅ Connection method for models, tool servers and SearXNG: desktop relay (Node HTTP/HTTPS), cURL, Python, or the browser;
  "Copy as" cURL / Python / JavaScript / HTTP. Classic inside the desktop uses the same relay (Settings → Classic). (highest)
- ✅ AICord: calls go through the relay (aicordapp.com blocks browsers with CORS); key in the Authorization header as AICord's
  docs describe; AICord's docs server is a ready-made tool server. (high)
- ✅ AICord sign-in (OAuth 2.0 with PKCE), ready for when AICord's chat API accepts it: needs a client ID from the AICord
  team, registered with the callback `http://localhost:15693/oauth/aicord/callback`. API keys keep working meanwhile.
- ✅ SearXNG: through the relay, and its results page is read when JSON output is off. (high)
- ✅ Inbound API moved to port 15700 (Vector's bridge keeps 8787). (high)
- ✅ Backup passphrase: typed twice right in Settings, strength check, and typed again to restore. (high)
- ✅ Tool steps 1–100 on the slider, any higher number typed in the box; context window and history the same. (high)
- ✅ Deleting a tool server or model connection: a clear Delete… button that works on or off. (moderate)
- ✅ Hangout scene: the chosen scene is also the desktop wallpaper, with a preview. (moderate)
- ✅ SSH for you: `ssh <host>` in the Terminal; `~.` hangs up. (moderate)

- ✅ Thinking from reasoning models, folded above the reply (Settings → Conversations).
- ✅ After a fallback, the failed connection rests 3 minutes, then is tried first again.
- ✅ Rank memories (top-k), off until turned on.
- ✅ Updates for webxdc apps from where they're made (GitHub, Codeberg; manifest source_code_url), only when asked:
  Games & Apps → Check for updates, or `npm run check-upstreams` (`-- --get` to bring them in). Makers credited in NOTICE.md.
- ✅ LICENSE (AETHER-ENGINEERS) added; NOTICE.md credits everything else.

- ✅ Music (3.5.0): your folders and files, internet radio, queue, visualizers (bars, scope, Milkdrop with imported
  presets), lowering under voices, a `music` tool, and songs commented on after a short listen (off by default).
  Streaming services: Spotify (Premium + a developer client ID) and Apple Music (MusicKit, Apple Developer membership)
  can come later; YouTube by its player; Amazon Music has no web playback. Classic Milkdrop `.milk` presets need
  converting to Butterchurn's `.json` first.

- ✅ Full avatars (3.6.0): Live2D (Cubism 3/4, .zip), VRM 3D (.vrm), or an animated picture/video, uploaded and changed in a
  character's profile, shown in Hangout, on the desktop and in Presence, with lip-sync; "Full avatar" in the right-click look menu.
  All Live2D avatars share one WebGL renderer (Cubism's shaders can't span contexts), so any number can be on screen.

- ✅ 3.7.0: Jade Vault 2.20's speed-ups in the desktop (web tools and searches run side by side, web pages read by
  Jade's Rust core, a notes index that rebuilds only what changed: 5,000 notes / 50,000 links in about half a second,
  a tenth of that after an edit). The visualizer gets its own resizable window, full screen (filling the page where
  the browser won't), and can be the desktop background. **Worldband** in Music: about 5,000 stations on a world map,
  zoom and drag, click to tune through a burst of static, a west-to-east dial, and Scan. Classic gains Jade Vault
  2.20.1 and 2.20.1-enhanced, and Pandora Dee 2.9.9.2-enhanced is rebuilt on Jade's 2.20 code.

Still to build:
- ✅ Tabbed browser (3.10.0): pages through the desktop into a sandboxed frame, Reader, bookmarks, search. (moderate)
- XDC Studio: import assets, and an asset view. (moderate)
- Voice: download free (FOSS) voice models (Piper, Kokoro) or add your own. (low)
- Creating a character: more fields and help. (low)
- A mailer between the accounts on this desktop. (low)
- A fuller Help menu. (low)

## Phase 2: the native app

- **Tauri 2 shell** for Windows, macOS, Linux, Android and iOS. The web build keeps working with
  fewer features. The local server's jobs (library, game state, app origin) move into Rust, with
  each webxdc app on its own custom-protocol origin (stronger isolation than today's shared one).
- **Vector, built in**, using Vector's own Rust crates (`vector-core`, `vector-sdk`): your account,
  your chats and groups, Mini Apps opened straight from a chat into Games & Apps, and sharing an
  app version (yours or an edited one) back into a chat. Characters keep using the bridges for
  their own Vector accounts.
- **Web browser**: tabs on the system web view, with a choice of open-source browsers to install
  and open (Firefox, LibreWolf, Ungoogled Chromium, Ladybird when it's ready).
- **Package manager**: one place to install, update and remove what the desktop can use. Linux
  images, media tools, browsers, Classic builds, character packs, webxdc apps. Uses winget, Homebrew,
  Flatpak or the distro's own manager where they exist; downloads and checks signatures otherwise.

## Phase 3: development and creation

- **Linux terminal with your choice of distribution**: emulated inside the app on every platform
  (Alpine, Arch, Debian, Fedora, Void, a tiny Buildroot), downloaded on first use; on desktops,
  switch to real WSL, Docker or Podman for full speed. Each character's files and the webxdc
  library mount into it, so `git`, `npm` and editors work on them directly.
- **Media creation** ✅ started early (3.8.0): **Create** has a Gallery of the vault's pictures and PDFs, miniPaint
  built in (offline), and an installer for GIMP, Krita, Inkscape and Storytold's Craft apps (PhotoCraft, PdfCraft,
  VectorCraft, LightCraft as checked portable builds; ArtCraft through its installer), with "Open in…" from the
  Gallery. ✅ 3.9.0: picture engines (ComfyUI with a basic or your own API-format workflow, Draw Things /
  Automatic1111 / Forge, OpenAI-style image APIs) in Create → Imagine; Music → Make a song (Suno-style, Simple and
  Custom) on mlx-serve / MLX Core (3.9.1), ACE-Step 1.5 or YuE2 through ComfyUI; make_picture / make_song tools for characters (off by default).
  Engines are addresses on your network (the Mac does the work), reached through the relay. Next: editing pictures
  with an engine (img2img, inpainting), covers and extending songs, sharing pictures into the chat, the Craft Launcher.
  Planned before: in-app open-source painting (miniPaint, JS Paint or Kleki style) everywhere;
  GIMP, Krita, Inkscape and others installed through the package manager on desktops.
  A **Gallery** that collects pictures from the room, the apps and the editors, and shares any of
  them into the chat for the characters to see.
- **Classic, enhanced** ✅ (done early): Pandora Dee 2.9.9.2-enhanced and Jade Vault 2.20.1-enhanced are in
  Classic (next to Jade Vault 2.20.1 as released), each with the other's features, every added feature off until
  switched on; Pandora Dee's carries Jade's 2.20 Rust core and speed-ups too. What each contains is in
  PARITY.md ("Classic, enhanced builds"). They build from upstream with `F:\pandora-work\classic-enhanced\build.sh`
  (pinned commits + patches); for a new upstream release, rebase the patches and rerun it. Still to do: the Jade
  Docs webxdc app as an installable app, and the APK pages (`build_index.py`, `twbuild`) for the enhanced builds.
- **Merged features on the desktop**: everything in the table, as desktop apps and settings, each
  with a switch.

## Feature map: Pandora Dee 2.9.9.2 and Jade Vault 2.18.2

Both apps share 30 modules (vault, memory, steering, providers, MCP, Python, SQLite, context guard,
trajectories, HTTP API, images, webxdc, Vector, Discord, flows, schedules, heartbeat, templates…).

| Only in Pandora Dee | What it is | Plan |
| --- | --- | --- |
| layout | roomy wide-screen layout, draggable widths and dividers, text size | into enhanced Jade Vault; the desktop already does this |
| dragscroll | button strips scroll with a mouse drag or the wheel | into enhanced Jade Vault |
| findbar | find and replace in the editor | into enhanced Jade Vault and the desktop's Files |
| tidy | rename and delete workshops, tidy leaves away | into enhanced Jade Vault |
| notes_import | Google Keep, Samsung Notes, Apple Notes, HTML, Word, PDF import | into enhanced Jade Vault and the desktop's Files |
| migrate | carries older data forward | both |
| Appearance | gem themes, hair/clothes/skin colours, atmosphere switches | either/or per app (they draw different avatars) |

| Only in Jade Vault | What it is | Plan |
| --- | --- | --- |
| ssh_tool | real SSH sessions to saved hosts | into enhanced Pandora Dee; desktop SSH app (native) |
| sentry_tool, world, phone_tool, screen_tool | sensors and phone hands | into enhanced Pandora Dee; desktop Sentry already has the safe subset |
| think_tool | reasoning a hard check can veto | into enhanced Pandora Dee and the desktop's characters |
| playbook, playbook_ui | Ansible-style deterministic tasks | into enhanced Pandora Dee; desktop Playbooks app |
| browser_agent, browser_tool | driving web pages | into enhanced Pandora Dee; desktop Browser (native) |
| delegate_tool, skill_router, tool_router | sub-agents, skill and tool routing (token saving) | both; desktop agent loop |
| curiosity, chat_history | proactive questions, searchable past chats | both; switch, off by default |
| autobackup + server | scheduled backups to a backup server | both; desktop Backup |
| embed | embeddings / semantic search | both |
| vfs_disk, vfs_disk_ui | notes on the real disk | both; the desktop's library folder works the same way |

Incompatible pairs get an either/or setting. Anything that can send data off the device stays off
until it's turned on in Privacy, after reading what it shares.
