// Copying text, on any address: browsers offer the clipboard only on secure ones (https, localhost), so a phone on the
// LAN's plain http address falls back to the older way of copying a selection.

import { desk } from "./store.ts";

/** Copies the text; true when it worked (if it didn't, the person is told). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* refused (no focus, or permission): try the older way */
  }
  const box = document.createElement("textarea");
  box.value = text;
  box.setAttribute("readonly", "");
  box.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
  document.body.append(box);
  const had = document.activeElement as HTMLElement | null;
  box.select();
  box.setSelectionRange(0, text.length); // iOS needs the range as well
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  box.remove();
  had?.focus?.();
  if (!ok) desk().say("This browser wouldn't copy it. Select the text and copy it yourself.");
  return ok;
}
