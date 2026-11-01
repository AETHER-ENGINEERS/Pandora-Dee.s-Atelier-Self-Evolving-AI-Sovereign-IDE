import test from "node:test";
import assert from "node:assert/strict";
import { makeMatcher } from "./trackers.mjs";

// a small list shaped like DuckDuckGo's
const tds = {
  trackers: {
    "doubleclick.net": { owner: { name: "Google Ads" }, default: "block", rules: [] },
    "google-analytics.com": {
      owner: { name: "Google Analytics" },
      default: "block",
      rules: [{ rule: "google-analytics\\.com/analytics\\.js", exceptions: { domains: ["raspberrypi.org"] } }],
    },
    "facebook.net": { owner: { name: "Facebook, Inc." }, default: "ignore", rules: [{ rule: "facebook\\.net/.*/fbevents\\.js" }, { rule: "facebook\\.net/.*/allowed\\.js", action: "ignore" }] },
    "adform.net": { owner: { name: "Adform" }, default: "block", rules: [] },
  },
  domains: { "doubleclick.net": "Google Ads", "google-analytics.com": "Google Analytics", "youtube.com": "Youtube", "facebook.net": "Facebook, Inc.", "adform.net": "Adform" },
  entities: { "Google Ads": { displayName: "Google Ads (Google)" }, "Google Analytics": { displayName: "Google Analytics (Google)" }, Youtube: { displayName: "Youtube (Google)" } },
  cnames: { "metrics.shop.example": "track.adform.net" },
};
const m = makeMatcher(tds);
const on = (url, page, type) => m.decide(url, page, type).block;

test("third-party trackers that block by default are blocked; the page's own company isn't", () => {
  assert.equal(on("https://ad.doubleclick.net/x.gif", "https://news.example/"), true);
  // YouTube and Google Ads are both Google
  assert.equal(on("https://ad.doubleclick.net/x.gif", "https://www.youtube.com/watch"), false);
  // ordinary third parties aren't touched
  assert.equal(on("https://cdn.jsdelivr.net/x.js", "https://news.example/"), false);
});

test("rules decide for trackers that don't block by default; exceptions are kept", () => {
  assert.equal(on("https://connect.facebook.net/en_US/fbevents.js", "https://shop.example/"), true);
  assert.equal(on("https://connect.facebook.net/en_US/allowed.js", "https://shop.example/"), false);
  assert.equal(on("https://connect.facebook.net/en_US/other.js", "https://shop.example/"), false);
  assert.equal(on("https://www.google-analytics.com/analytics.js", "https://news.example/"), true);
  assert.equal(on("https://www.google-analytics.com/analytics.js", "https://www.raspberrypi.org/"), false);
});

test("a tracker hidden behind the site's own name is found", () => {
  assert.equal(on("https://metrics.shop.example/pixel", "https://shop.example/"), true);
});

test("odd input never blocks", () => {
  assert.equal(on("not a url", "https://a.example/"), false);
  assert.equal(on("https://ad.doubleclick.net/", ""), false);
});
