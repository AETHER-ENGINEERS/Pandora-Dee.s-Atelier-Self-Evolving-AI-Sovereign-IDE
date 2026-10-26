// Passwords and passcodes are kept only as salted PBKDF2 hashes on this device.

export type Sealed = { salt: string; hash: string };

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export function canSeal() {
  return typeof crypto !== "undefined" && Boolean(crypto.subtle);
}

export async function seal(secret: string, salt?: string): Promise<Sealed> {
  if (!canSeal()) throw new Error("This page needs a secure address (localhost or https) to keep passwords.");
  const s = salt ?? hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(s), iterations: 120_000 }, key, 256);
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
