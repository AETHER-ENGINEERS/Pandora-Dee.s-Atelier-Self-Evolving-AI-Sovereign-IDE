# Modules

A module is a GitHub repository with a `seaside-module.json` at its top. PDA SEASIDE looks for them in Pandora Dee
Fae's Box (`Pandora-Dee-Fae-s-Box`) and any other organisations you name: **Settings → Modules → Look for modules**.

Looking only reads. Installing fetches the exact commit that was listed, checks release files against their SHA-256,
and records what came in (in the data folder's `modules/installed.json`). A newer commit shows as **Update**.

## The manifest

```json
{
  "seaside": 1,
  "name": "FAE-AIRGAP",
  "kind": "skill",
  "version": "0.1.0",
  "description": "Context walls for AI instances and their human peers: which room am I in?",
  "needs": [],
  "files": ["skills/fae-airgap/SKILL.md"]
}
```

| Field | |
| --- | --- |
| `seaside` | Always `1` (the manifest's version). |
| `name`, `version`, `description` | Shown in Settings → Modules. |
| `kind` | `skill`, `xdc`, `character` or `mcp` (below). |
| `needs` | Privacy features it uses, shown before installing: `web`, `bridges`, `remote-tools`… |

## Kinds

**`skill`**: instructions a character loads when a task calls for them. `files` lists paths under
`skills/<name>/` in the repo (at least its `SKILL.md`, with `name` and `description` in its frontmatter). They're
fetched from the listed commit and given to the character you choose.

**`xdc`**: a Mini App (webxdc) for Games & Apps.

```json
"release": { "url": "https://github.com/<org>/<repo>/releases/download/v1.0.0/app.xdc", "sha256": "…64 hex…" }
```

**`character`**: a character backup (a desktop backup `.json`, or a Classic Pandora Dee / Jade Vault one), with the same
`release` field. They join the cast.

**`mcp`**: a tool server.

```json
"mcp": { "command": "node", "args": ["pandora-mcp-server.cjs"] }
```

It's never run from GitHub. It's added to Connections → Tool servers switched off, with a link to the commit: get the
code there, set where it lives, and switch it on once you've looked.

## Making a checksum

```bash
sha256sum app.xdc
```

On Windows: `certutil -hashfile app.xdc SHA256`.
