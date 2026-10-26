// Templates in Templater syntax: <% tp.date.now("YYYY-MM-DD") %>, <% tp.file.title %> and friends.
// Code blocks (<%* … %>) need the script sandbox, which arrives with the Runtimes batch; until then
// they're left out and the result says so.

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +y0) / 86400000 + 1) / 7);
}

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

/** Moment-style formats: YYYY MM DD dddd ddd MMMM MMM Do HH hh mm ss A ww… Text in [brackets] stays as is. */
export function formatDate(d: Date, fmt = "YYYY-MM-DD") {
  const h12 = d.getHours() % 12 || 12;
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(-2),
    MMMM: MONTHS[d.getMonth()],
    MMM: MONTHS[d.getMonth()].slice(0, 3),
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    dddd: DAYS[d.getDay()],
    ddd: DAYS[d.getDay()].slice(0, 3),
    DD: pad(d.getDate()),
    Do: ordinal(d.getDate()),
    D: String(d.getDate()),
    HH: pad(d.getHours()),
    H: String(d.getHours()),
    hh: pad(h12),
    h: String(h12),
    mm: pad(d.getMinutes()),
    m: String(d.getMinutes()),
    ss: pad(d.getSeconds()),
    s: String(d.getSeconds()),
    A: d.getHours() < 12 ? "AM" : "PM",
    a: d.getHours() < 12 ? "am" : "pm",
    ww: pad(isoWeek(d)),
    w: String(isoWeek(d)),
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|Do|DD|D|HH|H|hh|h|mm|m|ss|s|A|a|ww|w/g, (tok, lit) => (lit !== undefined ? lit : map[tok] ?? tok));
}

export type TemplateFile = { title: string; folder: string; path: string; created?: Date };

const arg = (s: string | undefined) => (s === undefined ? undefined : s.trim().replace(/^(['"])(.*)\1$/, "$2"));

/** Fill in a template's tags. Returns the text and where the cursor should go (tp.file.cursor). */
export function applyTemplate(src: string, file: TemplateFile, now = new Date()): { text: string; cursor: number; skipped: number } {
  let skipped = 0;
  // <%- and -%> also remove the line break before / after the tag.
  let text = src.replace(/\n?<%-/g, "<%").replace(/-%>\n?/g, "%>");
  text = text.replace(/<%\*([\s\S]*?)%>/g, () => {
    skipped++;
    return "";
  });
  text = text.replace(/<%([\s\S]*?)%>/g, (whole, inner: string) => {
    const e = inner.trim();
    let m: RegExpExecArray | null;
    if ((m = /^tp\.date\.now\((?:\s*("[^"]*"|'[^']*'))?\s*(?:,\s*(-?\d+))?\s*\)$/.exec(e))) {
      const d = new Date(now);
      d.setDate(d.getDate() + Number(m[2] ?? 0));
      return formatDate(d, arg(m[1]) || "YYYY-MM-DD");
    }
    if ((m = /^tp\.date\.(today|tomorrow|yesterday)\((?:\s*("[^"]*"|'[^']*'))?\s*\)$/.exec(e))) {
      const d = new Date(now);
      d.setDate(d.getDate() + (m[1] === "tomorrow" ? 1 : m[1] === "yesterday" ? -1 : 0));
      return formatDate(d, arg(m[2]) || "YYYY-MM-DD");
    }
    if ((m = /^tp\.date\.weekday\(\s*("[^"]*"|'[^']*')\s*,\s*(-?\d+)\s*\)$/.exec(e))) {
      const d = new Date(now);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + Number(m[2]));
      return formatDate(d, arg(m[1]));
    }
    if (e === "tp.file.title") return file.title;
    if (e === "tp.file.folder()" || e === "tp.file.folder(false)") return file.folder.split("/").pop() ?? "";
    if (e === "tp.file.folder(true)") return file.folder;
    if (e === "tp.file.path()" || e === "tp.file.path(true)") return file.path;
    if ((m = /^tp\.file\.(creation_date|last_modified_date)\((?:\s*("[^"]*"|'[^']*'))?\s*\)$/.exec(e))) return formatDate(file.created ?? now, arg(m[2]) || "YYYY-MM-DD HH:mm");
    if (/^tp\.file\.cursor\(\s*\d*\s*\)$/.test(e)) return "\u0000";
    skipped++;
    return whole;
  });
  const cursor = text.indexOf("\u0000");
  return { text: text.replace(/\u0000/g, ""), cursor, skipped };
}
