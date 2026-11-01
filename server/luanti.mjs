// Luanti (the open-source voxel game engine, formerly Minetest): the family's saved servers (Cryptechtest first), the
// public server list, and starting the real Luanti program on this computer, straight into a server. The program is
// the person's own install (luanti.org), found in the usual places or picked in Explorer; nothing is downloaded here.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const LIST_URL = "https://servers.luanti.org/list";
const LIST_MS = 5 * 60_000;
export const CRYPTECHTEST = { id: "cryptechtest", name: "Cryptechtest", address: "cryptechcraft.xyz", port: 30000, note: "CryptechTest SMP: starships, TestCoin. cryptechtest.xyz" };

const HOST = /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$|^\d{1,3}(\.\d{1,3}){3}$|^\[?[0-9a-fA-F:]+\]?$/;
/** A player name as Luanti allows it: letters, digits, - and _, up to 20. */
export const cleanName = (n) => (/^[A-Za-z0-9_-]{1,20}$/.test(String(n || "")) ? String(n) : "");
export const cleanHost = (h) => (HOST.test(String(h || "").trim()) ? String(h).trim() : "");
export const cleanPort = (p) => (Number.isInteger(Number(p)) && Number(p) > 0 && Number(p) < 65536 ? Number(p) : 0);
const err = (message, status = 400) => Object.assign(new Error(message), { status });

/** Where Luanti (or Minetest, its old name) usually is on this kind of computer. */
export function usualPlaces(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs"), env.USERPROFILE && path.join(env.USERPROFILE, "Desktop"), env.USERPROFILE && path.join(env.USERPROFILE, "Downloads"), "C:\\Games"].filter(Boolean);
    return roots.flatMap((r) => ["luanti", "Luanti", "minetest", "Minetest"].flatMap((d) => [path.join(r, d, "bin", "luanti.exe"), path.join(r, d, "bin", "minetest.exe")]));
  }
  if (platform === "darwin") return ["/Applications/luanti.app/Contents/MacOS/luanti", "/Applications/Luanti.app/Contents/MacOS/luanti", "/Applications/minetest.app/Contents/MacOS/minetest"];
  return ["/usr/bin/luanti", "/usr/local/bin/luanti", "/usr/games/luanti", "/usr/bin/minetest", "/usr/games/minetest", path.join(os.homedir(), ".local/bin/luanti")];
}
const isProgram = (p) => /(^|[\\/])(luanti|minetest)(\.exe)?$/i.test(String(p || ""));

export function createLuanti({ readConfig, writeConfig, fetchImpl = (...a) => fetch(...a), spawnImpl = spawn }) {
  const cfg = () => readConfig().luanti ?? {};
  const save = (patch) => writeConfig({ luanti: { ...cfg(), ...patch } });

  /** The saved servers: Cryptechtest first unless it was removed on purpose. */
  function servers() {
    const c = cfg();
    const list = Array.isArray(c.servers) ? c.servers : [];
    return c.cryptechRemoved || list.some((s) => s.id === CRYPTECHTEST.id) ? list : [CRYPTECHTEST, ...list];
  }

  function program() {
    const chosen = cfg().program;
    if (chosen && fs.existsSync(chosen)) return chosen;
    return usualPlaces().find((p) => fs.existsSync(p)) ?? "";
  }

  const status = () => ({ servers: servers(), program: program(), picked: Boolean(cfg().program && fs.existsSync(cfg().program)), platform: process.platform });

  /** Add or change a saved server. */
  function saveServer(s) {
    const address = cleanHost(s.address);
    const port = cleanPort(s.port ?? 30000);
    if (!address || !port) throw err("That address or port doesn't look right. An address is like cryptechcraft.xyz, a port like 30000.");
    const id = /^[a-z0-9-]{1,40}$/.test(String(s.id || "")) ? String(s.id) : `${address.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${port}`;
    const entry = { id, name: String(s.name || address).trim().slice(0, 60) || address, address, port, note: String(s.note || "").slice(0, 200) };
    const rest = servers().filter((x) => x.id !== id);
    save({ servers: id === CRYPTECHTEST.id ? [entry, ...rest] : [...rest, entry] });
    return status();
  }
  function removeServer(id) {
    save({ servers: servers().filter((x) => x.id !== id), ...(id === CRYPTECHTEST.id ? { cryptechRemoved: true } : {}) });
    return status();
  }

  function setProgram(p) {
    if (!p) return save({ program: "" }), status();
    if (!isProgram(p) || !fs.existsSync(p)) throw err("That isn't Luanti's program (luanti.exe, or minetest.exe for older versions).");
    save({ program: p });
    return status();
  }

  // the public list, fetched at most every few minutes and kept to what the window shows
  let list = { at: 0, servers: [] };
  async function publicList() {
    if (Date.now() - list.at < LIST_MS && list.servers.length) return list.servers;
    const r = await fetchImpl(LIST_URL, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw err(`The public server list answered ${r.status}.`, 502);
    const j = await r.json();
    const clip = (s, n) => String(s ?? "").slice(0, n);
    const servers = (Array.isArray(j.list) ? j.list : [])
      .filter((s) => cleanHost(s.address) && cleanPort(s.port))
      .map((s) => ({ name: clip(s.name, 80), description: clip(s.description, 300), address: s.address, port: Number(s.port), game: clip(s.gameid, 40), version: clip(s.version, 20), players: Number(s.clients) || 0, max: Number(s.clients_max) || 0, url: /^https?:\/\//.test(String(s.url || "")) ? clip(s.url, 200) : "" }));
    list = { at: Date.now(), servers };
    return servers;
  }

  /** Start Luanti on this computer: into a server (address, port, the player's name), or at its own menu. */
  function launch({ address, port, name } = {}) {
    const exe = program();
    if (!exe) throw err("Luanti isn't installed on this computer yet (or it's somewhere unusual: choose it in Explorer).", 404);
    const args = [];
    if (address) {
      const a = cleanHost(address);
      const p = cleanPort(port ?? 30000);
      const n = cleanName(name);
      if (!a || !p) throw err("That server's address or port doesn't look right.");
      if (!n) throw err("Your name in Luanti: letters, numbers, - and _ only, up to 20.");
      // --go joins straight away; Luanti itself asks for the password (or to register) when the server wants one
      args.push("--address", a, "--port", String(p), "--name", n, "--go");
    }
    const child = spawnImpl(exe, args, { cwd: path.dirname(exe), detached: true, stdio: "ignore", windowsHide: false });
    child.on?.("error", () => undefined);
    child.unref?.();
    return { ok: true, program: exe, joining: address ? `${address}:${port ?? 30000}` : "" };
  }

  return { status, saveServer, removeServer, setProgram, publicList, launch };
}
