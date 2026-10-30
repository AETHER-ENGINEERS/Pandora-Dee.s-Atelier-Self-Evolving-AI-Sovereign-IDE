// The `mcp` shell command, as in Classic (the pi mcp … CLI): list, add, remove, reconnect, tools, call.
// A character's add and remove change her own mcp.json, so her servers follow it like any other edit.

import { desk, type McpServer } from "./store.ts";
import { connectServer, links } from "./connections.ts";
import { allMcp, callMcp } from "./mcptools.ts";

const USAGE = "usage: mcp [list|add|remove|reconnect|tools|call]";
const ADD_USAGE = 'usage: mcp add <name> <url> [--header "K: V"] [--exposure codemode|deferred|direct|hidden] [--description "…"]';
const EXPOSURES = ["codemode", "deferred", "direct", "hidden"];

type McpJson = { mcpServers?: Record<string, Record<string, unknown>> };

/** Servers this character may use: the desktop's shared ones and her own. */
const usable = (charId: string) => desk().mcp.filter((m) => !m.owner || m.owner === charId);

function readHers(charId: string): McpJson {
  const text = desk().filesOf(charId)["mcp.json"] ?? "";
  if (!text.trim()) return { mcpServers: {} };
  const j = JSON.parse(text) as McpJson; // a broken file is reported, not overwritten
  return { ...j, mcpServers: { ...(j.mcpServers ?? {}) } };
}

const writeHers = (charId: string, j: McpJson) => desk().writeFile(charId, "mcp.json", `${JSON.stringify(j, null, 2)}\n`);

function line(m: McpServer) {
  const st = links.state(`mcp:${m.id}`);
  const state = !m.enabled ? "off" : st.state === "on" ? "connected" : st.state;
  const n = st.state === "on" ? st.tools : 0;
  return `${m.name.padEnd(16)} ${state.padEnd(10)} ${String(n).padStart(3)} tool${n === 1 ? " " : "s"}  ${(m.exposure || "codemode").padEnd(8)} ${m.url}${m.owner ? "  (yours)" : ""}${st.error ? `\n    ${st.error}` : ""}`;
}

async function settle(id: string) {
  for (let i = 0; i < 100 && ["connecting", "off"].includes(links.state(`mcp:${id}`).state); i++) await new Promise((r) => setTimeout(r, 100));
}

/** Run `mcp …` for a character. Returns the output and an exit code (0 ok, 1 failed, 2 usage). */
export async function mcpCommand(argv: string[], charId: string): Promise<{ out: string; code: number }> {
  const [sub, ...rest] = argv;
  const ok = (out: string, code = 0) => ({ out, code });
  try {
    if (!sub || sub === "list") {
      const list = usable(charId);
      if (!list.length) return ok(`no MCP servers (add one: ${ADD_USAGE.slice(7)})`);
      return ok(list.map(line).join("\n"), list.some((m) => m.enabled && links.state(`mcp:${m.id}`).state !== "on") ? 1 : 0);
    }
    if (sub === "add") {
      const plain = rest.filter((x, i) => !x.startsWith("--") && !rest[i - 1]?.startsWith("--"));
      const [name, url] = plain;
      if (!name || !url) return ok(ADD_USAGE, 2);
      if (!/^https?:\/\//i.test(url)) return ok("mcp: the url must start with http:// or https:// (streamable HTTP)", 1);
      const cfg: Record<string, unknown> = { url };
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--header") {
          const h = rest[++i] ?? "";
          const k = h.indexOf(":");
          if (k > 0) cfg.headers = { ...((cfg.headers as Record<string, string>) ?? {}), [h.slice(0, k).trim()]: h.slice(k + 1).trim() };
        } else if (rest[i] === "--exposure") {
          const ex = rest[++i] ?? "";
          if (!EXPOSURES.includes(ex)) return ok(`mcp: exposure must be one of ${EXPOSURES.join(", ")}`, 2);
          cfg.exposure = ex;
        } else if (rest[i] === "--description") cfg.description = rest[++i] ?? "";
      }
      const j = readHers(charId);
      j.mcpServers![name] = cfg;
      writeHers(charId, j);
      const id = `${charId}--${name.replace(/[^A-Za-z0-9_]/g, "_")}`;
      await settle(id);
      const st = links.state(`mcp:${id}`);
      return ok(`${name}: ${st.state === "on" ? `connected (${st.tools} tool${st.tools === 1 ? "" : "s"})` : `${st.state}${st.error ? ` — ${st.error}` : ""}`}`, st.state === "on" ? 0 : 1);
    }
    if (sub === "remove") {
      const name = rest[0];
      if (!name) return ok("usage: mcp remove <name>", 2);
      const j = readHers(charId);
      if (!(name in j.mcpServers!)) {
        const shared = desk().mcp.some((m) => !m.owner && m.name === name);
        return ok(shared ? `mcp: ${name} is one of the desktop's shared servers; the keyholder changes those in Connections.` : `mcp: no server called ${name} in your mcp.json`, 1);
      }
      delete j.mcpServers![name];
      writeHers(charId, j);
      return ok(`removed ${name}`);
    }
    if (sub === "reconnect") {
      const list = usable(charId).filter((m) => m.enabled && (!rest[0] || m.name === rest[0]));
      if (rest[0] && !list.length) return ok(`mcp: no enabled server called ${rest[0]}`, 1);
      const out: string[] = [];
      for (const m of list) {
        await connectServer(m);
        const st = links.state(`mcp:${m.id}`);
        out.push(`${m.name}: ${st.state === "on" ? "connected" : st.state}${st.error ? ` — ${st.error}` : ""}`);
      }
      return ok(out.join("\n") || "nothing to reconnect");
    }
    if (sub === "tools") {
      const ts = allMcp(charId).filter((e) => !rest[0] || e.server.name === rest[0]);
      return ok(ts.map((e) => `${e.name}  [${e.exposure}]  ${(e.tool.description ?? "").split("\n")[0].slice(0, 100)}`).join("\n") || "no tools");
    }
    if (sub === "call") {
      const [name, json] = rest;
      if (!name) return ok("usage: mcp call <tool> ['{\"json\": \"arguments\"}']", 2);
      let args: Record<string, unknown> = {};
      try {
        args = json ? (JSON.parse(json) as Record<string, unknown>) : {};
      } catch {
        return ok("mcp call: arguments must be JSON", 2);
      }
      const e = allMcp(charId).find((x) => x.name === name || `${x.server.name}__${x.tool.name}` === name);
      if (!e) return ok(`mcp call: no tool called ${name} (see: mcp tools)`, 1);
      return ok(String(await callMcp(e, args)));
    }
    return ok(USAGE, 2);
  } catch (err) {
    return ok(`mcp: ${err instanceof Error ? err.message : String(err)}`, 1);
  }
}
