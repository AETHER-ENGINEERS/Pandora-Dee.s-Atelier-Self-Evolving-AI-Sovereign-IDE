# Notices and credits

Pandora Dee's Atelier (Pandora Dee Desktop) builds on other people's work. Each part keeps its own license.

## The apps it grows from

- **Jade Vault** by Lucky and the Jade Vault contributors: https://github.com/lucky-edgelord/jade-vault (MIT)
- **Pandora Dee** by Aether Engineers, an edition of Jade Vault: https://github.com/AETHER-ENGINEERS/pandora-dee (MIT)

The Classic builds in `public/classic/` are those apps, built from their sources (the "-enhanced" builds add each
other's features, switched off until turned on). Their licenses are beside them:
`LICENSE-pandora-dee.txt`, `LICENSE-jade-vault.txt` and `THIRD_PARTY_NOTICES.md` (the libraries they bundle).

## Games

The built-in games in `public/games/cleared/` are by **SunkissedButterfly** from websim.ai, adjusted so nothing
leaves the device (see `public/games/catalog.json`). Little Dogs is by one of this project's own users.

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
| Vite, TypeScript (build tools) | MIT, Apache-2.0 |

## Services it can talk to

Ollama, Groq, OpenRouter, LM Studio, llama.cpp, AICord, SearXNG, DuckDuckGo, Wikipedia, r.jina.ai and any MCP
server are separate services with their own terms; nothing reaches them unless you set them up and allow it in
Privacy.
