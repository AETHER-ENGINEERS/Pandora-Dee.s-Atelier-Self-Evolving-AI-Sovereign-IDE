// A small shell over one character's files. Pure: takes the tree, returns output and changes.

export type Tree = Record<string, string>;

export type ShellResult = {
  out: string;
  cwd: string;
  /** New tree when the command changed files. */
  tree?: Tree;
  clear?: boolean;
  /** Something the terminal should do outside the shell. */
  action?: { kind: "open"; path: string } | { kind: "ask"; text: string } | { kind: "switch"; id: string };
};

export type ShellContext = { who: string; host: string; room: string[]; env: Record<string, string>; model: string; characters: string[] };

const HELP = `Commands
  ls [dir]            list files            cat <file>          show a file
  cd <dir>, pwd       move around           tree                every file
  echo text > file    write (>> appends)    touch <file>        make an empty file
  mkdir <dir>         make a folder         rm <file>           delete a file
  mv <a> <b>          rename                cp <a> <b>          copy
  grep <words> [dir]  search                wc <file>           count lines and words
  head / tail <file>  first / last lines    open <file>         open in Files
  ask <message>       talk to this character privately
  ssh <host>          connect to a saved host (or user@host); ~. hangs up
  use <character>     switch to another character's files
  whoami, who, env, model, date, clear, help`;

export function resolve(cwd: string, p: string) {
  const parts = (p.startsWith("/") ? p : `${cwd}/${p}`).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function dirs(tree: Tree) {
  const set = new Set<string>([""]);
  for (const path of Object.keys(tree)) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/"));
  }
  return set;
}

function tokens(line: string) {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export function run(line: string, cwd: string, tree: Tree, ctx: ShellContext): ShellResult {
  const trimmed = line.trim();
  if (!trimmed) return { out: "", cwd };
  const redirect = trimmed.match(/^echo\s+([\s\S]*?)\s*(>>?)\s*(\S+)$/);
  if (redirect) {
    const text = redirect[1].replace(/^["']|["']$/g, "");
    const path = resolve(cwd, redirect[3]);
    const prev = tree[path] ?? "";
    const body = redirect[2] === ">>" ? `${prev}${prev && !prev.endsWith("\n") ? "\n" : ""}${text}\n` : `${text}\n`;
    return { out: "", cwd, tree: { ...tree, [path]: body } };
  }
  const [cmd, ...args] = tokens(trimmed);
  const all = dirs(tree);
  const need = (n: number, usage: string): ShellResult | null => (args.length < n ? { out: `usage: ${usage}`, cwd } : null);
  switch (cmd) {
    case "help":
      return { out: HELP, cwd };
    case "clear":
      return { out: "", cwd, clear: true };
    case "pwd":
      return { out: `/${cwd}`, cwd };
    case "whoami":
      return { out: ctx.who, cwd };
    case "who":
      return { out: ctx.room.length ? ctx.room.join("\n") : "Nobody's in the room.", cwd };
    case "date":
      return { out: new Date().toString(), cwd };
    case "model":
      return { out: ctx.model || "No AI connection chosen yet (Settings → AI).", cwd };
    case "env":
      return { out: Object.keys(ctx.env).sort().map((k) => `${k}=${ctx.env[k] ? "(set)" : ""}`).join("\n") || "No keys.", cwd };
    case "cd": {
      const target = resolve(cwd, args[0] ?? "/");
      if (!all.has(target)) return { out: `cd: no such folder: ${args[0]}`, cwd };
      return { out: "", cwd: target };
    }
    case "ls": {
      const dir = resolve(cwd, args[0] ?? ".");
      if (tree[dir] !== undefined) return { out: dir.split("/").pop() ?? dir, cwd };
      if (!all.has(dir)) return { out: `ls: no such folder: ${args[0]}`, cwd };
      const prefix = dir ? `${dir}/` : "";
      const names = new Set<string>();
      for (const path of Object.keys(tree)) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        const slash = rest.indexOf("/");
        names.add(slash >= 0 ? `${rest.slice(0, slash)}/` : rest);
      }
      return { out: [...names].filter((n) => n !== ".keep").sort().join("  ") || "(empty)", cwd };
    }
    case "tree":
      return { out: Object.keys(tree).filter((p) => !p.endsWith(".keep")).sort().join("\n"), cwd };
    case "cat":
    case "head":
    case "tail":
    case "wc": {
      const bad = need(1, `${cmd} <file>`);
      if (bad) return bad;
      const path = resolve(cwd, args[args.length - 1]);
      const body = tree[path];
      if (body === undefined) return { out: `${cmd}: no such file: ${args[args.length - 1]}`, cwd };
      const lines = body.replace(/\n$/, "").split("\n");
      if (cmd === "head") return { out: lines.slice(0, 10).join("\n"), cwd };
      if (cmd === "tail") return { out: lines.slice(-10).join("\n"), cwd };
      if (cmd === "wc") return { out: `${lines.length} lines  ${body.split(/\s+/).filter(Boolean).length} words  ${body.length} chars  ${path}`, cwd };
      return { out: body.replace(/\n$/, ""), cwd };
    }
    case "touch": {
      const bad = need(1, "touch <file>");
      if (bad) return bad;
      const path = resolve(cwd, args[0]);
      return { out: "", cwd, tree: tree[path] === undefined ? { ...tree, [path]: "" } : tree };
    }
    case "mkdir": {
      const bad = need(1, "mkdir <folder>");
      if (bad) return bad;
      return { out: "", cwd, tree: { ...tree, [`${resolve(cwd, args[0])}/.keep`]: "" } };
    }
    case "rm": {
      const bad = need(1, "rm <file>");
      if (bad) return bad;
      const path = resolve(cwd, args[args.length - 1]);
      const next = { ...tree };
      if (next[path] !== undefined) {
        delete next[path];
        return { out: "", cwd, tree: next };
      }
      if (args.includes("-r") && all.has(path) && path) {
        for (const p of Object.keys(next)) if (p.startsWith(`${path}/`)) delete next[p];
        return { out: "", cwd, tree: next };
      }
      return { out: `rm: no such file: ${args[args.length - 1]}${all.has(path) ? " (it's a folder: use rm -r)" : ""}`, cwd };
    }
    case "mv":
    case "cp": {
      const bad = need(2, `${cmd} <from> <to>`);
      if (bad) return bad;
      const from = resolve(cwd, args[0]);
      let to = resolve(cwd, args[1]);
      if (tree[from] === undefined) return { out: `${cmd}: no such file: ${args[0]}`, cwd };
      if (all.has(to) && tree[to] === undefined) to = `${to ? `${to}/` : ""}${from.split("/").pop()}`;
      const next = { ...tree, [to]: tree[from] };
      if (cmd === "mv") delete next[from];
      return { out: "", cwd, tree: next };
    }
    case "grep": {
      const bad = need(1, "grep <words> [folder]");
      if (bad) return bad;
      const q = args[0].toLowerCase();
      const dir = args[1] ? resolve(cwd, args[1]) : cwd;
      const out: string[] = [];
      for (const [path, body] of Object.entries(tree)) {
        if (dir && !path.startsWith(`${dir}/`) && path !== dir) continue;
        body.split("\n").forEach((l, i) => {
          if (l.toLowerCase().includes(q)) out.push(`${path}:${i + 1}: ${l}`);
        });
      }
      return { out: out.join("\n") || "(no matches)", cwd };
    }
    case "open": {
      const bad = need(1, "open <file>");
      if (bad) return bad;
      const path = resolve(cwd, args[0]);
      if (tree[path] === undefined) return { out: `open: no such file: ${args[0]}`, cwd };
      return { out: `Opening ${path} in Files.`, cwd, action: { kind: "open", path } };
    }
    case "ask":
      if (!args.length) return { out: "usage: ask <message>", cwd };
      return { out: "", cwd, action: { kind: "ask", text: trimmed.slice(4).trim() } };
    case "use": {
      const name = args.join(" ").toLowerCase();
      const hit = ctx.characters.find((c) => c.toLowerCase().startsWith(name));
      if (!name || !hit) return { out: `use: try one of: ${ctx.characters.join(", ")}`, cwd };
      return { out: "", cwd: "", action: { kind: "switch", id: hit } };
    }
    default:
      return { out: `${cmd}: command not found. Type help.`, cwd };
  }
}
