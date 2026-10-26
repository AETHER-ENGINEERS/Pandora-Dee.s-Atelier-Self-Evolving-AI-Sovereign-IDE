import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { deskServer } from "./server/plugin.mjs";

// The desktop is http://localhost:15693. Apps and games run on http://127.0.0.1:15693, a separate
// origin, so they can't read the desktop's keys. PDD_DATA chooses where the library is kept.
export default defineConfig({
  plugins: [react(), deskServer()],
  // Bound to 127.0.0.1: browsers reach it as "localhost" too, and the two names are two origins.
  server: { port: 15693, strictPort: true, host: process.env.PDD_LAN === "1" ? true : "127.0.0.1" },
  preview: { port: 15693, strictPort: true, host: "127.0.0.1" },
});
