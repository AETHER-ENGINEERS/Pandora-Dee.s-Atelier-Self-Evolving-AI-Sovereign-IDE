// Installing the desktop as an app (a phone's home screen, or a window of its own on a computer). Browsers only
// offer this on https pages (and on localhost), so over plain http on the network it explains how to get https.

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export function setupInstall() {
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // offered from the Help menu instead of the browser's own banner
    deferred = e as PromptEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    changed();
  });
}

export const onInstallChange = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));

/** Already running as an installed app. */
export const installed = () => window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches || (navigator as { standalone?: boolean }).standalone === true;

export const canPrompt = () => Boolean(deferred);

/** Install now, or explain what this browser needs. Returns a message to show, or "" when the browser's own dialog took over. */
export async function install(): Promise<string> {
  if (installed()) return "It's already installed: you're using the app.";
  if (deferred) {
    const d = deferred;
    deferred = null;
    await d.prompt();
    const { outcome } = await d.userChoice;
    changed();
    return outcome === "accepted" ? "" : "Not installed. It's in the Help menu whenever you want it.";
  }
  if (!window.isSecureContext)
    return `Browsers only install apps from https addresses. On the computer running the desktop, run “tailscale serve --bg ${location.port || 15693}”, then open https://<that computer's Tailscale name> on this device and install from there.`;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "On iPhone and iPad: tap Share, then “Add to Home Screen”.";
  if (/firefox/i.test(navigator.userAgent)) return "Firefox: open the browser menu and choose “Install” (or “Add to Home screen” on Android).";
  return "Open the browser menu and choose “Install app” or “Add to Home screen”. (If it isn't there yet, reload once and look again.)";
}
