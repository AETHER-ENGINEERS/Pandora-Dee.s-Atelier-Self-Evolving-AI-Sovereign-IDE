// The installed app's service worker. It keeps nothing: the desktop always comes live from the computer running
// it. Its one job is a clear page when that computer can't be reached (asleep, off, or the phone off Tailscale).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const OFFLINE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0b0912"><title>Pandora Dee</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0912;color:#ece8f6;font:16px system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
<div><h2 style="margin:0 0 8px">Can't reach your desktop</h2>
<p style="opacity:.8;max-width:30em">The computer running Pandora Dee Desktop isn't answering. Check that it's on and the desktop is running, and that this device is on the same network or on Tailscale.</p>
<p><button onclick="location.reload()" style="font:inherit;padding:10px 18px;border-radius:10px;border:1px solid #6c5a9c;background:#2a2142;color:inherit">Try again</button></p></div></body></html>`;

self.addEventListener("fetch", (e) => {
  // "Share to PDA SEASIDE" from the phone's share menu: the files wait here (in this browser only) until the
  // desktop's page opens and asks what to do with them
  if (e.request.method === "POST" && new URL(e.request.url).pathname === "/share-target") return e.respondWith(sharedIn(e.request));
  // only page loads: everything else goes straight to the network as usual
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});

async function sharedIn(request) {
  const id = Date.now().toString(36);
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((f) => typeof f === "object" && f && "name" in f);
    const box = await caches.open("pdd-shared-in");
    await Promise.all(files.map((f, i) => box.put(`/__shared-in/${id}/${i}`, new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream", "X-Name": encodeURIComponent(f.name), "X-Modified": String(f.lastModified || Date.now()) } }))));
  } catch {
    /* nothing readable came: the page says so */
  }
  return Response.redirect(`/?shared-in=${id}`, 303);
}
