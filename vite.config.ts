import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { deskServer } from "./server/plugin.mjs";

// The desktop is http://localhost:15693. Apps and games run on http://127.0.0.1:15693, a separate
// origin, so they can't read the desktop's keys. PDD_DATA chooses where the library is kept.
//
// Other devices (phones, the Mac): PDD_LAN=1, or "lan": true in pdd.config.json (this computer's own settings,
// not in the repository), listens on every network address (0.0.0.0) instead. Anyone on the network who opens
// the address then has the whole desktop (files, terminal), so use it on a network you trust.
let local: { lan?: boolean; allowedHosts?: string[] } = {};
try {
  local = JSON.parse(fs.readFileSync(new URL("./pdd.config.json", import.meta.url), "utf8"));
} catch {
  /* no local settings */
}
if (local.lan && !process.env.PDD_LAN) process.env.PDD_LAN = "1";
const lan = process.env.PDD_LAN === "1";
// Names other devices may use for this computer (Vite refuses unknown names, against DNS rebinding). Tailscale's
// *.ts.net always (`tailscale serve` hands https requests to localhost under that name, and only your own devices
// can use it); when shared on the network, local names too, and any listed in pdd.config.json's "allowedHosts".
const allowedHosts = [".ts.net", ...(lan ? [".local", ".lan", ".home", ".internal"] : []), ...(Array.isArray(local.allowedHosts) ? local.allowedHosts : [])];

export default defineConfig({
  plugins: [react(), deskServer()],
  // Bound to 127.0.0.1 unless shared: browsers reach it as "localhost" too, and the two names are two origins.
  server: { port: 15693, strictPort: true, host: lan ? "0.0.0.0" : "127.0.0.1", allowedHosts },
  preview: { port: 15693, strictPort: true, host: lan ? "0.0.0.0" : "127.0.0.1", allowedHosts },
});
