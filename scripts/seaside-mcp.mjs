#!/usr/bin/env node
// An MCP server (stdio) for talking with a SEASIDE desktop's characters: any MCP client (Claude Code, Claude Desktop,
// another AI's tools) gets seaside_say, seaside_history, seaside_chats and seaside_status. Settings as in
// seaside-api.mjs (SEASIDE_API_URL, SEASIDE_API_TOKEN_FILE, SEASIDE_AS). Plain Node, nothing to install.
//
//   claude mcp add seaside -e SEASIDE_API_TOKEN_FILE=F:/path/api.token -e SEASIDE_AS=claude -- node scripts/seaside-mcp.mjs

import readline from "node:readline";
import { chat, chats, config, history, status } from "./seaside-api.mjs";

const cfg = config();
const VERSION = "1.0.0";

const TOOLS = [
  {
    name: "seaside_say",
    description:
      "Say something in the SEASIDE room and wait for the characters' answers. Name a character in the message to have them answer; otherwise the one in focus does, and free talk may carry on. Answers come back as 'Name: text'.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "What to say (up to 20,000 characters)." },
        as: { type: "string", description: `Speak as this character voiced from outside (id or name).${cfg.as ? ` Default: ${cfg.as}.` : " Blank: as an anonymous caller."}` },
      },
      required: ["message"],
    },
  },
  {
    name: "seaside_history",
    description: "The latest messages in the open chat (or another chat by id), oldest first.",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "How many (1-200, default 20)." }, session: { type: "string", description: "A chat id from seaside_chats." } } },
  },
  { name: "seaside_chats", description: "The desktop's chats: ids, titles, how many messages, which is open.", inputSchema: { type: "object", properties: {} } },
  { name: "seaside_status", description: "Whether the characters are busy, which model answers, and the open chat.", inputSchema: { type: "object", properties: {} } },
];

async function run(name, a = {}) {
  if (name === "seaside_say") {
    const r = await chat(cfg, String(a.message ?? ""), a.as !== undefined ? String(a.as) : cfg.as);
    return r.reply || "(nobody answered)";
  }
  if (name === "seaside_history") {
    const h = await history(cfg, Number(a.limit) || 20, a.session);
    return h.messages.map((m) => `${m.name}: ${m.text}`).join("\n\n") || "(no messages)";
  }
  if (name === "seaside_chats") return JSON.stringify((await chats(cfg)).chats, null, 1);
  if (name === "seaside_status") return JSON.stringify(await status(cfg), null, 1);
  throw new Error(`No tool called ${name}.`);
}

const out = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = req;
  if (id === undefined) return; // notifications (initialized, cancelled) need no answer
  try {
    if (method === "initialize")
      return out({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "seaside", version: VERSION } } });
    if (method === "ping") return out({ id, result: {} });
    if (method === "tools/list") return out({ id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      try {
        const text = await run(params?.name, params?.arguments ?? {});
        return out({ id, result: { content: [{ type: "text", text }] } });
      } catch (e) {
        return out({ id, result: { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true } });
      }
    }
    out({ id, error: { code: -32601, message: `Unknown method: ${method}` } });
  } catch (e) {
    out({ id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } });
  }
});
