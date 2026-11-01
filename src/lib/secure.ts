// Passwords and passcodes are kept only as salted PBKDF2 hashes on this device. On a plain-http address (a phone on the
// home network), where browsers hold back their own crypto, the same hashing runs in plain JavaScript (pbkdf2.ts).

import { pbkdf2Sha256 } from "./pbkdf2.ts";

export type Sealed = { salt: string; hash: string };

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** Passcodes can be kept here (any address: the browser's crypto where it has it, plain JavaScript where it doesn't). */
export function canSeal() {
  return typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function";
}

export async function seal(secret: string, salt?: string): Promise<Sealed> {
  if (!canSeal()) throw new Error("This browser can't make the random numbers a passcode needs.");
  const s = salt ?? hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const pass = new TextEncoder().encode(secret);
  const saltBytes = new TextEncoder().encode(s);
  if (!crypto.subtle) return { salt: s, hash: hex((await pbkdf2Sha256(pass, saltBytes, 120_000)).buffer as ArrayBuffer) };
  const key = await crypto.subtle.importKey("raw", pass, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 120_000 }, key, 256);
  return { salt: s, hash: hex(bits) };
}

export async function matches(secret: string, sealed: Sealed) {
  const again = await seal(secret, sealed.salt);
  return again.hash === sealed.hash;
}

/** Shrink a picture from this device into a small data URL. */
export function shrinkPicture(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't a picture this browser can open."));
    };
    img.src = url;
  });
}
