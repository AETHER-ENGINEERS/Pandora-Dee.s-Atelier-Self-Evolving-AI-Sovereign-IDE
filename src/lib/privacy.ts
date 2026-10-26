// Privacy: everything that could leave this computer is off until someone reads the
// risk and opts in. Pure rules, so the desktop and the tests agree.

export type Mode = "none" | "some" | "conditional";

export type Feature = "network-models" | "online-models" | "bridges" | "web" | "remote-tools" | "sensors" | "ssh" | "api" | "backup";

export type Privacy = {
  mode: Mode;
  /** Conditional mode: opted-in features only run between these times (24h, local). */
  hours: { from: string; to: string };
  consents: Partial<Record<Feature, boolean>>;
  streamer: { on: boolean; maskNames: boolean; maskMessages: boolean };
  /** Names (people or characters from bridges) shown as "Anonymous" in streamer mode. */
  anonymous: string[];
};

export const PRIVACY_DEFAULT: Privacy = {
  mode: "none",
  hours: { from: "09:00", to: "21:00" },
  consents: {},
  streamer: { on: false, maskNames: true, maskMessages: false },
  anonymous: [],
};

export const MODES: { id: Mode; label: string; detail: string }[] = [
  { id: "none", label: "None", detail: "Nothing leaves this computer. Only models on this computer can be used." },
  { id: "some", label: "Some", detail: "You can turn on individual features after reading what each one shares." },
  { id: "conditional", label: "Conditional", detail: "Like Some, but the features you turn on only run during the hours you choose." },
];

export const FEATURES: { id: Feature; label: string; risk: string; why: string }[] = [
  {
    id: "network-models",
    label: "Models on your network",
    risk: "Everything said in the room, and each character's files that go into its prompt, travel over your home network to another machine. Anyone who controls that machine can read or keep them.",
    why: "Lets a bigger computer in the house (or on your Tailscale) do the thinking.",
  },
  {
    id: "online-models",
    label: "Online model services",
    risk: "Everything said in the room, and the characters' files that go into their prompts, are sent to a company's servers. They may be logged, kept, or read by people who were never in the room. Their terms decide what happens next, not you.",
    why: "Online models can be faster or smarter than what runs on this computer.",
  },
  {
    id: "bridges",
    label: "Discord and Vector bridges",
    risk: "Characters read messages from Discord or Vector and their replies are posted there, where other people (and Discord itself) can see and keep them. Messages from strangers can reach the characters.",
    why: "Lets the characters take part in your community's real chats.",
  },
  {
    id: "web",
    label: "Web access for characters",
    risk: "Characters can fetch web pages and call web APIs. The sites they visit see this computer's address, and what they ask for can reveal what you were talking about.",
    why: "Lets characters look things up and use online services you've given them keys for.",
  },
  {
    id: "remote-tools",
    label: "Tool servers off this computer",
    risk: "Characters can call MCP tool servers on other machines, sending them whatever the tool needs, which can include parts of your conversation.",
    why: "Connects characters to tools that live somewhere else.",
  },
  {
    id: "ssh",
    label: "SSH to your machines",
    risk: "Characters can open terminal sessions on computers you've saved, and run commands there as the user you saved. A mistaken or misled command can change or delete things on that machine. Passwords and keys stay on this computer and are never shown to the characters.",
    why: "Lets characters run builds, check servers and fix things on your own machines with you.",
  },
  {
    id: "api",
    label: "Inbound API for other programs",
    risk: "Programs that know the token can talk to the characters as you, with all their tools. With Wi-Fi access on, any device on your network can try. The connection is plain HTTP, so use it only on a network you trust.",
    why: "Lets scripts, shortcuts and other apps send the characters messages and read their answers.",
  },
  {
    id: "backup",
    label: "Backups to your own server",
    risk: "A copy of your characters, their files and chats is sent to the server you name. With encryption on (recommended) only someone with your passphrase can read it; without it, anyone with access to that server or the network can.",
    why: "Keeps a copy somewhere safe, on a schedule.",
  },
  {
    id: "sensors",
    label: "Device sensors (Sentry)",
    risk: "The desktop watches battery, network and whether the screen is in use, and writes what it notices into Jade's files. Nothing is sent anywhere, but it is a record of when this computer is used.",
    why: "Lets Jade keep watch and mention changes.",
  },
];

export function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function withinHours(hours: Privacy["hours"], now: Date) {
  const t = now.getHours() * 60 + now.getMinutes();
  const a = minutes(hours.from);
  const b = minutes(hours.to);
  if (a === b) return true;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

/** Is this feature allowed to run right now? */
export function allowed(p: Privacy, f: Feature, now = new Date()) {
  if (p.mode === "none") return false;
  if (!p.consents[f]) return false;
  if (p.mode === "conditional" && !withinHours(p.hours, now)) return false;
  return true;
}

/** Why a feature can't run, in plain words, or "" if it can. */
export function blockedBecause(p: Privacy, f: Feature, now = new Date()) {
  const label = FEATURES.find((x) => x.id === f)?.label ?? f;
  if (p.mode === "none") return `${label} is off because privacy is set to None. Change it in Settings → Privacy.`;
  if (!p.consents[f]) return `${label} hasn't been turned on. Settings → Privacy explains what it shares.`;
  if (p.mode === "conditional" && !withinHours(p.hours, now)) return `${label} only runs between ${p.hours.from} and ${p.hours.to}.`;
  return "";
}

export function maskName(p: Privacy, name: string, fromBridge: boolean) {
  if (!p.streamer.on) return name;
  if (p.anonymous.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase())) return "Anonymous";
  if (fromBridge && p.streamer.maskNames) return "Someone";
  return name;
}

export function maskText(p: Privacy, text: string, fromBridge: boolean) {
  if (!p.streamer.on || !fromBridge || !p.streamer.maskMessages) return text;
  return "(hidden while streaming)";
}
