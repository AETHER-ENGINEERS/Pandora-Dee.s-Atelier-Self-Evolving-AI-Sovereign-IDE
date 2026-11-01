#!/usr/bin/env node
// Talk with the characters in a SEASIDE desktop from the command line (see seaside-api.mjs for the settings).
//
//   node scripts/seaside-talk.mjs "Hello, everyone!"           say it, print who answered
//   node scripts/seaside-talk.mjs --as claude "Hello!"         say it as a character voiced from outside
//   node scripts/seaside-talk.mjs --history 10                 the last messages in the open chat
//   node scripts/seaside-talk.mjs --status                     what the desktop is doing
//   node scripts/seaside-talk.mjs --as claude --inbox          Vector/Discord messages waiting for me (--take clears them)
//   node scripts/seaside-talk.mjs --as claude --reply <chat> [--to <message id>] "Hello!"   answer there

import { chat, config, history, inbox, reply, status } from "./seaside-api.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};

const cfg = config({ url: opt("--url"), tokenFile: opt("--token-file"), as: opt("--as") });
const limit = opt("--history");
const replyChat = opt("--reply");
const replyTo = opt("--to");
const source = opt("--source") ?? "vector";
try {
  if (flag("--inbox")) {
    const r = await inbox(cfg, flag("--take"));
    if (!r.waiting.length) console.log("Nothing waiting.");
    for (const m of r.waiting) console.log(`[${m.source} ${m.chatId}${m.msgId ? ` msg ${m.msgId}` : ""}] ${m.author}: ${m.text}\n`);
  } else if (replyChat) {
    await reply(cfg, replyChat, args.join(" "), replyTo, source);
    console.log("Sent.");
  } else if (flag("--status")) {
    const s = await status(cfg);
    console.log(`${s.busy ? "Busy" : "Free"} · ${s.provider ?? "no model"} ${s.model ?? ""} · chat "${s.session?.title}" (${s.session?.messages} messages)`);
  } else if (limit) {
    const h = await history(cfg, Number(limit) || 10);
    for (const m of h.messages) console.log(`${m.name}: ${m.text}\n`);
  } else {
    const message = args.join(" ").trim();
    if (!message) throw new Error('Say something: node scripts/seaside-talk.mjs "Hello!"');
    const r = await chat(cfg, message);
    console.log(r.reply || "(nobody answered)");
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
