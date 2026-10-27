# Notices and credits

Pandora Dee's Atelier (Pandora Dee Desktop) builds on other people's work. Each part keeps its own license.

## The apps it grows from

- **Jade Vault** by Lucky and the Jade Vault contributors: https://github.com/lucky-edgelord/jade-vault (MIT)
- **Pandora Dee** by Aether Engineers, an edition of Jade Vault: https://github.com/AETHER-ENGINEERS/pandora-dee (MIT)

The Classic builds in `public/classic/` are those apps, built from their sources (the "-enhanced" builds add each
other's features, switched off until turned on). Their licenses are beside them:
`LICENSE-pandora-dee.txt`, `LICENSE-jade-vault.txt` and `THIRD_PARTY_NOTICES.md` (the libraries they bundle).

The desktop itself uses Jade Vault's Rust core (`public/vendor/jade-core/`, `jade_core.wasm` and its glue, from
Jade Vault 2.20.1, MIT) to turn web pages into Markdown for web_fetch.

## Vector

The Vector app runs **vector-agent** from Vector by JSKitty and Formless Labs
(https://github.com/VectorPrivacy/Vector, MIT). It isn't included: it's built from Vector's repository on the computer
running the desktop. Received files are decrypted the way Vector's own vector-core does (AES-256-GCM).

## Games

The built-in games in `public/games/cleared/` are by **SunkissedButterfly** from websim.ai, adjusted so nothing
leaves the device (see `public/games/catalog.json`). Little Dogs is by one of this project's own users.
The crunch sound in Cook and Eat ("Human Eating_Crunch - Sound Effect (HD)") is a royalty-free sound effect from YouTube.

## Painting and creative apps

- **miniPaint** 4.14.3 by ViliusL: https://github.com/viliusle/miniPaint (MIT), in `public/vendor/minipaint/` with its
  licence. Served with a content security policy that keeps it offline (its picture search and web fonts are left out).
- The YuE2 text-to-music workflow in `src/lib/workflows/` is from Comfy-Org's workflow_templates
  (https://github.com/Comfy-Org/workflow_templates, MIT). YuE2 itself (m-a-p, weights CC-BY-NC-4.0) and ACE-Step 1.5
  (MIT) are not included; they run on your own engine, as do mlx-serve (https://github.com/ddalcu/mlx-serve) and
  the music models it serves (MiniMax Music 3 under its own community licence). The desktop ships no models. Songs made with YuE2 are for non-commercial use.
- Not included, installed only when you ask (Create → Apps): **GIMP** (GPL-3.0), **Krita** (GPL-3.0), **Inkscape**
  (GPL-2.0+), and **Storytold**'s Craft apps https://github.com/storytold (PhotoCraft, PdfCraft, VectorCraft,
  LightCraft: Apache-2.0; ArtCraft: MIT or Apache-2.0).

## Webxdc apps by others

Not part of this repository: people bring them into their own library. They're listed so their makers get the
credit, and so the desktop's update check (Games & Apps → Check for updates, or `npm run check-upstreams`)
knows where newer releases come from. Each keeps its own license.

| App | Made by | Source |
| --- | --- | --- |
| XDC-Chess | th2tran | https://github.com/th2tran/chess-webxdc |
| Aurum Chess | th2tran | https://github.com/th2tran/aurum-chess-xdc |
| Gomoku | th2tran | https://github.com/th2tran/gomoku-webxdc |
| SNES (xdc) | th2tran | https://github.com/th2tran/snes-xdc |
| Vexel | JSKitty | https://github.com/JSKitty/Vexel |
| Arcane Dungeon | ArcaneCircle | https://github.com/ArcaneCircle/pixel-dungeon |
| Color Pixel | ArcaneCircle | https://github.com/ArcaneCircle/pixel |
| Scramble | Acbn-Nick | https://github.com/Acbn-Nick/webxdc-scramble |
| Telengard | nicegamer7 | https://github.com/nicegamer7/telengard-webxdc |
| Lootforge | ayahohner | https://github.com/ayahohner/lootforge-rpg |
| Webxdc Creator Studio | YosvanyAlain | https://github.com/YosvanyAlain/creator-studio |
| astro | sweetpotatopress | https://github.com/sweetpotatopress/astro |
| So Many Colors! | durian | https://codeberg.org/durian/colors |
| Neon Runner | webxdc | https://github.com/webxdc |
| VectorJS emulators | EmulatorJS | https://emulatorjs.org/ |
| Aether Foundry, Undercroft | AETHER-ENGINEERS | https://github.com/AETHER-ENGINEERS/aether-foundry |
| ROSES | AETHER-ENGINEERS | https://github.com/AETHER-ENGINEERS/xdc-roses-for-vector |
| SID-STEP | AETHER-ENGINEERS | https://github.com/AETHER-ENGINEERS/sid-step |
| Strudel | AETHER-ENGINEERS | https://github.com/AETHER-ENGINEERS/OMARG-Vector-strudel |
| XDC Forge | AETHER-ENGINEERS | https://github.com/AETHER-ENGINEERS/vector-xdc-forge |

Commercial games (RuneScape, Jazz Jackrabbit, Half-Life) are never included: people import their own copies.

## Libraries in the desktop

| Library | License |
| --- | --- |
| React, React DOM | MIT |
| zustand | MIT |
| marked | MIT |
| DOMPurify | MPL-2.0 or Apache-2.0 |
| KaTeX | MIT |
| pdf.js (pdfjs-dist) | Apache-2.0 |
| fflate | MIT |
| lucide-react | ISC |
| ssh2 | MIT |
| music-metadata | MIT |
| Butterchurn, butterchurn-presets (Milkdrop) | MIT |
| PixiJS 6, pixi-live2d-display (Live2D avatars) | MIT |
| three.js, @pixiv/three-vrm (VRM avatars) | MIT |
| Live2D Cubism Core for Web (`public/vendor/live2dcubismcore.min.js`) | **Live2D Proprietary Software License**: the "Redistributable Code", allowed inside apps under Live2D's terms (https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html). Publishers above Live2D's revenue threshold need a Live2D publication license. Copied unchanged from the Classic build by `scripts/extract-cubism.mjs`. |
| Vite, TypeScript (build tools) | MIT, Apache-2.0 |

## Avatars

No avatar models are included. Live2D and VRM models people add are their own (or used under their makers' terms) and stay
in their vault. Jade's Live2D cat in the Classic builds is the owner's own asset: not reused by the desktop.

## Services it can talk to

Ollama, Groq, OpenRouter, LM Studio, llama.cpp, AICord, radio-browser.info (and the radio stations), SearXNG, DuckDuckGo, Wikipedia, r.jina.ai and any MCP
server are separate services with their own terms; nothing reaches them unless you set them up and allow it in
Privacy.
