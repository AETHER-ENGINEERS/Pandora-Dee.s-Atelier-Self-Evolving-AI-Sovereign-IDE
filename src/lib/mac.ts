// The Mac that last ran the one-line setup (curl …/mac | bash): its address, as the desktop saw it, so engines on
// it can be added without typing (macbook.local often doesn't resolve; the Tailscale address does).

/** A preset address with the Mac's real address in place of macbook.local, when the desktop knows it. */
export async function withMacAddress(url: string): Promise<string> {
  if (!/macbook\.local/i.test(url)) return url;
  try {
    const j = (await (await fetch("/api/mac")).json()) as { address?: string };
    if (j.address) return url.replace(/macbook\.local/i, j.address.includes(":") ? `[${j.address}]` : j.address);
  } catch {
    /* not known yet */
  }
  return url;
}
