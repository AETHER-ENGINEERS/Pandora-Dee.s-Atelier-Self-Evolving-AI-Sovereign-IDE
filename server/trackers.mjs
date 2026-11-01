// Tracker blocking for the full browser, with DuckDuckGo's open tracker list (Tracker Radar, "TDS"; CC BY-NC-SA 4.0,
// https://github.com/duckduckgo/tracker-blocklists). It's fetched from DuckDuckGo the first time blocking is on and
// refreshed weekly; nothing of it is kept in this repository.
//
// The decision follows the list: a request is blocked when it goes to a tracker the page's own company doesn't own
// (YouTube may load Google's ads domains: both are Google), and either the tracker blocks by default or one of its
// rules says to block. Trackers hidden behind a site's own subdomain (CNAME cloaking) are found through the list's
// cname table.

import fs from "node:fs";
import path from "node:path";

export const TDS_URL = "https://staticcdn.duckduckgo.com/trackerblocking/v6/current/extension-tds.json";
const WEEK = 7 * 86400_000;

/** The host and each parent domain, most specific first ("a.b.example.com" → … → "example.com"). */
function* upward(host) {
  const parts = String(host || "").toLowerCase().replace(/\.$/, "").split(".");
  for (let i = 0; i < parts.length - 1; i++) yield parts.slice(i).join(".");
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

/** A matcher over a loaded list. */
export function makeMatcher(tds) {
  const trackers = tds?.trackers ?? {};
  const domains = tds?.domains ?? {};
  const entities = tds?.entities ?? {};
  const cnames = tds?.cnames ?? {};
  const compiled = new Map();
  const regex = (rule) => {
    if (!compiled.has(rule)) {
      try {
        compiled.set(rule, new RegExp(rule, "i"));
      } catch {
        compiled.set(rule, null);
      }
    }
    return compiled.get(rule);
  };
  const lookup = (map, host) => {
    for (const d of upward(host)) if (map[d] !== undefined) return { key: d, value: map[d] };
    return null;
  };
  /** Which company a host belongs to: "Youtube (Google)" and "Google Ads (Google)" are both Google. */
  const companyOf = (host) => {
    const hit = lookup(domains, host);
    if (!hit) return "";
    const shown = entities[hit.value]?.displayName ?? hit.value;
    return (/\(([^)]+)\)\s*$/.exec(shown)?.[1] ?? hit.value).trim().toLowerCase();
  };
  const exempt = (ex, pageHost, type) => {
    if (!ex) return false;
    const onPage = Array.isArray(ex.domains) && ex.domains.some((d) => [...upward(pageHost)].includes(String(d).toLowerCase()));
    const ofType = Array.isArray(ex.types) && ex.types.includes(type);
    // both given: both must hold; one given: that one
    if (ex.domains && ex.types) return onPage && ofType;
    return onPage || ofType;
  };

  /** { block, tracker } for a request (url) made by a page (pageUrl), of a resource type ("script", "image"…). */
  function decide(url, pageUrl, type = "") {
    let host = hostOf(url);
    const pageHost = hostOf(pageUrl);
    if (!host || !pageHost) return { block: false };
    // a tracker behind the site's own name (CNAME cloaking)
    const cloaked = lookup(cnames, host);
    if (cloaked) host = String(cloaked.value).toLowerCase();
    const found = lookup(trackers, host);
    if (!found) return { block: false };
    const t = found.value;
    // the page's own company may load its own domains
    const mine = companyOf(pageHost);
    if (mine && mine === companyOf(host)) return { block: false };
    // a request of the page to itself isn't a third party, whatever the list says
    if ([...upward(pageHost)].includes(found.key)) return { block: false };
    const urlNoScheme = url.replace(/^[a-z]+:\/\//i, "");
    for (const r of t.rules ?? []) {
      const re = regex(r.rule);
      if (!re || !re.test(urlNoScheme)) continue;
      if (exempt(r.exceptions, pageHost, type)) return { block: false };
      return { block: r.action !== "ignore", tracker: found.key };
    }
    return { block: t.default === "block", tracker: found.key };
  }

  return { decide, size: Object.keys(trackers).length };
}

/** The list on disk (dataDir/browser/privacy/tds.json): loaded, fetched when missing, refreshed when a week old. */
export function createTrackerList({ dir }) {
  const file = () => path.join(dir(), "tds.json");
  let matcher = null;
  let loading = null;
  let error = "";

  async function fetchList() {
    const r = await fetch(TDS_URL, { headers: { "User-Agent": "PandoraDeeDesktop/3.16" } });
    if (!r.ok) throw new Error(`DuckDuckGo's tracker list answered ${r.status}.`);
    const text = await r.text();
    const tds = JSON.parse(text);
    if (!tds.trackers || !tds.domains) throw new Error("The tracker list didn't look right.");
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(`${file()}.tmp`, text);
    fs.renameSync(`${file()}.tmp`, file());
    return tds;
  }

  /** The matcher, once the list is here (null until then: nothing is blocked while it loads). */
  function get() {
    if (matcher) return matcher;
    loading ??= (async () => {
      try {
        let tds = null;
        try {
          tds = JSON.parse(fs.readFileSync(file(), "utf8"));
        } catch {
          tds = null;
        }
        if (!tds) tds = await fetchList();
        matcher = makeMatcher(tds);
        error = "";
        // a week old: a fresh copy in the background, used from then on
        if (Date.now() - fs.statSync(file()).mtimeMs > WEEK) void fetchList().then((t) => (matcher = makeMatcher(t)), () => undefined);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        loading = null;
      }
    })();
    return null;
  }

  return { get, status: () => ({ ready: Boolean(matcher), trackers: matcher?.size ?? 0, error }) };
}
