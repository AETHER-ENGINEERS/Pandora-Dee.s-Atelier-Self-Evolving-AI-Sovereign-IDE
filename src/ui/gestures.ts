// Gestures across the whole of SEASIDE:
// - Pinching (touchscreen, touchpad, or Ctrl+wheel) on empty or text spots zooms SEASIDE itself: its interface grows
//   or shrinks and everything reflows, the way "desktop site" does in a phone browser. Places with their own zoom
//   (the PADS map, the full browser, maps, graphs, videos, games) keep pinches to themselves.
// - A two-finger tap on a touchscreen is a right-click, as it is on a touchpad.
// - Right-clicks never open the browser's own menu: anything without a menu of its own gets SEASIDE's (copy, paste,
//   send to…, zoom).

import { desk } from "../lib/store.ts";
import { copyText } from "../lib/clipboard.ts";
import { sendToItems, type Sendable } from "../lib/sendTo.ts";
import { openMenu, type MenuItem } from "./ContextMenu.tsx";

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2;
/** Where pinches belong to what's under them, not to SEASIDE's zoom. */
const OWN_ZOOM = "canvas, video, iframe, [data-own-zoom], .full-browser-view, .pads-room, .world-map, .note-graph";
const ownsZoom = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest(OWN_ZOOM));

const clampScale = (k: number) => Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, k)) * 100) / 100;

// While a pinch is under way the zoom is applied straight to the page; it's kept (and remembered) when it settles.
let live = 0;
let settle = 0;
function zoomTo(k: number) {
  live = clampScale(k);
  document.documentElement.style.setProperty("zoom", String(live));
  window.clearTimeout(settle);
  settle = window.setTimeout(() => {
    if (live && live !== desk().uiScale) desk().set({ uiScale: live });
    live = 0;
  }, 250);
}
const scaleNow = () => live || desk().uiScale || 1;

// ---------- the menu for things without one of their own ----------

type Editable = HTMLInputElement | HTMLTextAreaElement;
const TEXT_INPUTS = new Set(["text", "search", "url", "email", "tel", "number", "password", ""]);
const editableOf = (t: Element): Editable | HTMLElement | null => {
  const f = t.closest("input, textarea, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']");
  if (f instanceof HTMLInputElement) return TEXT_INPUTS.has(f.type) && !f.readOnly && !f.disabled ? f : null;
  if (f instanceof HTMLTextAreaElement) return f.readOnly || f.disabled ? null : f;
  return f instanceof HTMLElement ? f : null;
};

/** Puts text where the caret was (or over what was selected), through the browser's own editing so undo still works. */
function insertInto(el: Editable | HTMLElement, text: string, sel: { start: number; end: number } | Range | null) {
  el.focus();
  if (sel instanceof Range) {
    const s = getSelection();
    s?.removeAllRanges();
    s?.addRange(sel);
  } else if (sel && "setSelectionRange" in el) el.setSelectionRange(sel.start, sel.end);
  if (!document.execCommand("insertText", false, text) && "setRangeText" in el) {
    el.setRangeText(text, el.selectionStart ?? 0, el.selectionEnd ?? 0, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

const zoomItems = (): MenuItem[] => [
  { heading: `SEASIDE zoom: ${Math.round(scaleNow() * 100)}%` },
  { label: "Zoom in", hint: "pinch out", run: () => zoomTo(scaleNow() + 0.1) },
  { label: "Zoom out", hint: "pinch in", run: () => zoomTo(scaleNow() - 0.1) },
  { label: "Back to 100%", disabled: scaleNow() === 1, run: () => zoomTo(1) },
];

function fallbackMenu(e: MouseEvent) {
  const t = e.target instanceof Element ? e.target : null;
  if (!t) return;
  const items: MenuItem[] = [];
  const selected = (getSelection()?.toString() ?? "").trim();
  const ed = editableOf(t);
  const link = t.closest("a[href]") as HTMLAnchorElement | null;
  const img = t.closest("img") as HTMLImageElement | null;

  if (ed) {
    const field = "setSelectionRange" in ed ? (ed as Editable) : null;
    const sel = field ? { start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0 } : getSelection()?.rangeCount ? getSelection()!.getRangeAt(0).cloneRange() : null;
    const picked = field ? field.value.slice(sel && !(sel instanceof Range) ? sel.start : 0, sel && !(sel instanceof Range) ? sel.end : 0) : selected;
    const secret = field instanceof HTMLInputElement && field.type === "password";
    const canRead = Boolean(navigator.clipboard?.readText) && window.isSecureContext;
    items.push(
      { label: "Cut", hint: "Ctrl+X", disabled: !picked || secret, run: () => void copyText(picked).then((ok) => ok && insertInto(ed, "", sel)) },
      { label: "Copy", hint: "Ctrl+C", disabled: !picked || secret, run: () => void copyText(picked) },
      {
        label: "Paste",
        hint: "Ctrl+V",
        disabled: !canRead,
        run: () =>
          void navigator.clipboard.readText().then(
            (text) => insertInto(ed, text, sel),
            () => desk().say("The browser didn't let SEASIDE read the clipboard. Ctrl+V (or a long press, Paste) still works."),
          ),
      },
      {
        label: "Select all",
        hint: "Ctrl+A",
        run: () => {
          ed.focus();
          if (field) field.select();
          else getSelection()?.selectAllChildren(ed);
        },
      },
    );
    if (picked && !secret) items.push({ sep: true }, ...sendToItems({ kind: "text", text: picked }));
  } else {
    if (selected) items.push({ label: "Copy", hint: "Ctrl+C", run: () => void copyText(selected) });
    if (link) {
      const url = link.href;
      if (/^https?:/i.test(url)) items.push({ label: "Open the link", run: () => void window.open(url, "_blank", "noopener") });
      items.push({ label: "Copy the link", run: () => void copyText(url) });
    }
    if (img?.currentSrc) items.push({ label: "Copy the picture's address", run: () => void copyText(img.currentSrc) });
    const what: Sendable | null = selected
      ? { kind: "text", text: selected }
      : link && /^https?:/i.test(link.href)
        ? { kind: "link", url: link.href, title: (link.textContent ?? "").trim().slice(0, 120) }
        : img?.currentSrc
          ? { kind: "image", src: img.currentSrc, title: img.alt || "Picture" }
          : null;
    if (what) items.push({ sep: true }, ...sendToItems(what));
  }
  items.push({ sep: true }, ...zoomItems());
  openMenu(e, items);
}

// ---------- wiring ----------

let started = false;
export function startGestures() {
  if (started) return;
  started = true;

  // Right-clicks: a menu of its own already opened (or was asked to stay quiet) when the default is prevented.
  window.addEventListener("contextmenu", (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    fallbackMenu(e);
  });

  // Touchpad pinches arrive as Ctrl+wheel (Chrome, Edge, Firefox); so does Ctrl+mouse wheel.
  window.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey || e.defaultPrevented || ownsZoom(e.target)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      zoomTo(scaleNow() * Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.006));
    },
    { passive: false },
  );

  // Safari's touchpad pinch
  let g0 = 1;
  const gesture = (e: Event & { scale?: number }) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (ownsZoom(e.target)) return;
    if (e.type === "gesturestart") g0 = scaleNow();
    else zoomTo(g0 * (e.scale ?? 1));
  };
  for (const t of ["gesturestart", "gesturechange"]) window.addEventListener(t, gesture as EventListener, { passive: false });

  // Touchscreens: the page's own pinch-zoom is off (touch-action in styles.css), and SEASIDE's takes its place.
  let pinch: { d0: number; k0: number } | null = null;
  let tap: { at: number; x: number; y: number; d0: number; moved: boolean; target: EventTarget | null } | null = null;
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  window.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 2) {
        if (e.touches.length > 2) tap = pinch = null;
        return;
      }
      const m = mid(e.touches);
      tap = { at: performance.now(), ...m, d0: dist(e.touches), moved: false, target: e.target };
      pinch = ownsZoom(e.touches[0].target) || ownsZoom(e.touches[1].target) ? null : { d0: dist(e.touches), k0: scaleNow() };
    },
    { passive: true },
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length !== 2) return;
      const d = dist(e.touches);
      const m = mid(e.touches);
      if (tap && (Math.abs(d - tap.d0) > 14 || Math.hypot(m.x - tap.x, m.y - tap.y) > 14)) tap.moved = true;
      if (pinch && Math.abs(d - pinch.d0) > 18) zoomTo(pinch.k0 * (d / pinch.d0));
    },
    { passive: true },
  );
  window.addEventListener(
    "touchend",
    (e) => {
      if (e.touches.length > 0) return;
      const t = tap;
      tap = pinch = null;
      // two fingers down and up together, without moving: a right-click where they were
      if (!t || t.moved || performance.now() - t.at > 400) return;
      const el = document.elementFromPoint(t.x, t.y) ?? (t.target as Element | null);
      el?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: t.x, clientY: t.y, button: 2 }));
    },
    { passive: true },
  );
}
