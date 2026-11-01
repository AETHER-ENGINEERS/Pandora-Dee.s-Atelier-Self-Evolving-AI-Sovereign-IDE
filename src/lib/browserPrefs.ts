// The Browser's own settings: the open tabs, bookmarks and the start page. Kept apart so the store imports it
// without a cycle.

export type BrowserTab = { id: string; history: string[]; at: number; title: string; reader: boolean };
export type Bookmark = { title: string; url: string };
/** `mode`: the full browser (a real engine on the desktop; the default) or the private Reader (nothing kept).
 *  `scheme`: the light or dark look pages are asked for: this device's own setting (the default), or always one.
 *  `darken`: Chromium's automatic darkening for sites with no dark look of their own (off unless chosen).
 *  `reopen`: the full browser starts where it was left off (its tabs, the front one, how far down each page was);
 *  on unless switched off. `search`: what the address bar searches with, a web address with %s for the words
 *  (empty = DuckDuckGo). */
export type BrowserPrefs = {
  tabs: BrowserTab[];
  active: string;
  bookmarks: Bookmark[];
  home: string;
  bar: boolean;
  mode?: "full" | "reader";
  scheme?: "device" | "dark" | "light";
  darken?: boolean;
  reopen?: boolean;
  search?: string;
  /** How the full browser's pictures are made: sharp (the default), balanced, or smooth (lighter, for animation and
   *  slower devices or connections). */
  picture?: "sharp" | "balanced" | "smooth";
};

/** Search engines for the address bar (%s is where the words go). */
export const SEARCH_ENGINES: { name: string; url: string }[] = [
  { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  { name: "DuckDuckGo (plain HTML, no scripts)", url: "https://html.duckduckgo.com/html/?q=%s" },
  { name: "Startpage", url: "https://www.startpage.com/sp/search?query=%s" },
  { name: "Brave Search", url: "https://search.brave.com/search?q=%s" },
  { name: "Mojeek", url: "https://www.mojeek.com/search?q=%s" },
];

/** Address bar text → where to go: an address as it is, a name with a dot as https, anything else a search. */
export function addressFor(text: string, search = "", searx = ""): string {
  const t = text.trim();
  if (!t) return "about:blank";
  if (/^(https?:|about:)/i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(t)) return `https://${t}`;
  const tpl = search === "searx" && searx ? `${searx.replace(/\/+$/, "")}/search?q=%s` : search && search !== "searx" ? search : SEARCH_ENGINES[0].url;
  return tpl.includes("%s") ? tpl.replace("%s", encodeURIComponent(t)) : tpl + encodeURIComponent(t);
}

export const BROWSER_DEFAULT: BrowserPrefs = {
  tabs: [],
  active: "",
  bookmarks: [
    { title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page" },
    { title: "DuckDuckGo", url: "https://html.duckduckgo.com/html/" },
  ],
  home: "https://html.duckduckgo.com/html/",
  bar: true,
};
