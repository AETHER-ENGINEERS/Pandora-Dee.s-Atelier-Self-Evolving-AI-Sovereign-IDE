// "Save this pose": a still of a cat or a character as they are right now, kept on the desktop's server
// (Vault › Pictures › Poses) so every device connected to it can see it.

import { desk } from "./store.ts";
import { keepPicture, sendToItems } from "./sendTo.ts";
import type { MenuItem } from "../ui/ContextMenu.tsx";

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("The picture couldn't be made."))), "image/png"));

/** A picture of an element made of pictures (a character's sprite: its body and mouth), drawn at the pictures' own sharpness. */
export async function snapPictures(el: HTMLElement): Promise<Blob> {
  const box = el.getBoundingClientRect();
  const parts = [...el.querySelectorAll<HTMLImageElement | HTMLCanvasElement>("img, canvas")].filter((p) => {
    const r = p.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && Number(getComputedStyle(p).opacity) > 0.02;
  });
  if (!parts.length || !box.width) throw new Error("There's no picture of them to save yet.");
  const sharp = Math.min(4, Math.max(1, ...parts.map((p) => (p instanceof HTMLImageElement ? p.naturalWidth : p.width) / p.getBoundingClientRect().width)));
  const c = document.createElement("canvas");
  c.width = Math.round(box.width * sharp);
  c.height = Math.round(box.height * sharp);
  const g = c.getContext("2d")!;
  for (const p of parts) {
    if (p instanceof HTMLImageElement && !p.complete) continue;
    const r = p.getBoundingClientRect();
    g.globalAlpha = Number(getComputedStyle(p).opacity) || 1;
    g.drawImage(p, (r.left - box.left) * sharp, (r.top - box.top) * sharp, r.width * sharp, r.height * sharp);
  }
  return toBlob(c);
}

/** Draw something onto a fresh canvas of this size (a cat at a larger size than it walks at). */
export function snapDrawing(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  return toBlob(c);
}

/** The pose lines for a cat's or character's right-click menu. snap is called once, when one is chosen. */
export function poseItems(name: string, snap: () => Promise<Blob>): MenuItem[] {
  let kept: Promise<string> | null = null;
  const keep = () => (kept ??= snap().then((b) => keepPicture(b, name, "Pictures/Poses")));
  const sendable = { kind: "image" as const, title: `${name}` };
  return [
    {
      label: "Save this pose",
      run: () => void keep().then((p) => desk().say(`Saved on the desktop: ${p}`), (e) => desk().say(e instanceof Error ? e.message : String(e))),
    },
    // sending keeps the pose first, so the other device (and Notes) opens the same picture
    ...sendToItems(sendable)
      .filter((it) => !("label" in it) || !it.label.startsWith("The desktop"))
      .map((it) =>
        "run" in it
          ? {
              ...it,
              run: () =>
                void keep().then(
                  (p) => sendToItems({ ...sendable, path: p }).find((x) => "label" in x && x.label === it.label && "run" in x && (x.run(), true)),
                  (e) => desk().say(e instanceof Error ? e.message : String(e)),
                ),
            }
          : "heading" in it
            ? { heading: "Send this pose to" }
            : it,
      ),
  ];
}
