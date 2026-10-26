// How the menu-bar clock shows the time.

export type ClockPrefs = {
  /** Show the date beside the time. */
  date: boolean;
  /** Show the day of the week. */
  weekday: boolean;
  /** Show seconds. */
  seconds: boolean;
  /** "auto" follows the region. */
  hours: "auto" | "12" | "24";
  /** How the date is written. */
  dateStyle: "numeric" | "short" | "long";
  /** IANA time zone, e.g. "Europe/London"; "" = this computer's. */
  zone: string;
  /** Region for date order and names, e.g. "en-GB"; "" = this computer's. */
  locale: string;
};

export const CLOCK_DEFAULT: ClockPrefs = { date: false, weekday: false, seconds: false, hours: "auto", dateStyle: "short", zone: "", locale: "" };

export function validZone(zone: string) {
  if (!zone) return true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function validLocale(locale: string) {
  if (!locale) return true;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

export function formatClock(now: Date, p: ClockPrefs): string {
  const locale = p.locale && validLocale(p.locale) ? p.locale : undefined;
  const timeZone = p.zone && validZone(p.zone) ? p.zone : undefined;
  const o: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", timeZone };
  if (p.seconds) o.second = "2-digit";
  if (p.hours !== "auto") o.hourCycle = p.hours === "12" ? "h12" : "h23";
  if (p.hours === "12") o.hour = "numeric";
  const time = new Intl.DateTimeFormat(locale, o).format(now);
  const d: Intl.DateTimeFormatOptions = { timeZone };
  if (p.weekday) d.weekday = p.dateStyle === "long" ? "long" : "short";
  if (p.date) {
    if (p.dateStyle === "numeric") Object.assign(d, { year: "numeric", month: "2-digit", day: "2-digit" });
    else Object.assign(d, { day: "numeric", month: p.dateStyle === "long" ? "long" : "short", ...(p.dateStyle === "long" ? { year: "numeric" } : {}) });
  }
  const day = p.date || p.weekday ? new Intl.DateTimeFormat(locale, d).format(now) : "";
  return day ? `${day}  ${time}` : time;
}

/** The time zones this browser knows, this computer's first. */
export function zones(): string[] {
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    all = [];
  }
  if (!all.includes("UTC")) all = ["UTC", ...all];
  return [here, ...all.filter((z) => z !== here)];
}

/** A short list of regions for the picker; any other tag can be typed. */
export const REGIONS: { tag: string; label: string }[] = [
  { tag: "en-US", label: "English (United States) — 10/26/2026" },
  { tag: "en-GB", label: "English (United Kingdom) — 26/10/2026" },
  { tag: "en-CA", label: "English (Canada) — 2026-10-26" },
  { tag: "en-AU", label: "English (Australia) — 26/10/2026" },
  { tag: "en-IN", label: "English (India) — 26/10/2026" },
  { tag: "de-DE", label: "Deutsch — 26.10.2026" },
  { tag: "fr-FR", label: "Français — 26/10/2026" },
  { tag: "es-ES", label: "Español — 26/10/2026" },
  { tag: "it-IT", label: "Italiano — 26/10/2026" },
  { tag: "pt-BR", label: "Português (Brasil) — 26/10/2026" },
  { tag: "nl-NL", label: "Nederlands — 26-10-2026" },
  { tag: "sv-SE", label: "Svenska — 2026-10-26" },
  { tag: "pl-PL", label: "Polski — 26.10.2026" },
  { tag: "ru-RU", label: "Русский — 26.10.2026" },
  { tag: "ja-JP", label: "日本語 — 2026/10/26" },
  { tag: "zh-CN", label: "中文 (简体) — 2026/10/26" },
  { tag: "ko-KR", label: "한국어 — 2026. 10. 26." },
];
