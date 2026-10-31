// The Browser's own settings: the open tabs, bookmarks and the start page. Kept apart so the store imports it
// without a cycle.

export type BrowserTab = { id: string; history: string[]; at: number; title: string; reader: boolean };
export type Bookmark = { title: string; url: string };
/** `mode`: the full browser (a real engine on the desktop; the default) or the private Reader (nothing kept). */
export type BrowserPrefs = { tabs: BrowserTab[]; active: string; bookmarks: Bookmark[]; home: string; bar: boolean; mode?: "full" | "reader" };

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
