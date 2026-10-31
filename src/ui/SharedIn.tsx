import { useEffect, useState } from "react";
import { desk } from "../lib/store.ts";
import { fileApi, showInExplorer, sizeOf } from "../lib/explorer.ts";
import { shareFiles } from "../lib/devshare.ts";

/** Files that came from the phone's own share menu ("Share to PDA SEASIDE", once the desktop is installed as an app):
 *  the service worker keeps them until this page asks, then they're saved on the desktop or shared live from here. */
async function takeShared(id: string): Promise<File[]> {
  if (!("caches" in window)) return [];
  const box = await caches.open("pdd-shared-in");
  const out: File[] = [];
  for (const req of await box.keys()) {
    if (!new URL(req.url).pathname.startsWith(`/__shared-in/${id}/`)) continue;
    const res = await box.match(req);
    if (res) {
      const name = decodeURIComponent(res.headers.get("X-Name") || "file");
      out.push(new File([await res.blob()], name, { type: res.headers.get("Content-Type") || "", lastModified: Number(res.headers.get("X-Modified")) || Date.now() }));
    }
    await box.delete(req);
  }
  return out;
}

export function SharedIn() {
  const [files, setFiles] = useState<File[] | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const url = new URL(location.href);
    const id = url.searchParams.get("shared-in");
    if (!id) return;
    url.searchParams.delete("shared-in");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    void takeShared(id).then((f) => (f.length ? setFiles(f) : desk().say("Nothing came through from the share menu. Try sharing it again.")));
  }, []);

  if (!files) return null;
  const total = files.reduce((n, f) => n + f.size, 0);
  const what = files.length === 1 ? files[0].name : `${files.length} files`;

  /** Into the vault's "From devices" folder, kept on the desktop (so the phone can free the space). */
  const save = async () => {
    try {
      const vault = (await fileApi.overview()).places.find((p) => p.id === "vault");
      if (!vault) throw new Error("The desktop's vault isn't there.");
      const dir = `${vault.path.replace(/[\\/]$/, "")}${vault.path.includes("\\") ? "\\" : "/"}From devices`;
      let last = "";
      for (let i = 0; i < files.length; i++) {
        setBusy(`Saving ${i + 1} of ${files.length}: ${files[i].name}…`);
        last = await fileApi.upload(dir, files[i]);
      }
      setFiles(null);
      desk().say(`${what} saved on the desktop, in Vault › From devices.`);
      if (last) showInExplorer(last);
    } catch (e) {
      setBusy("");
      desk().say(e instanceof Error ? e.message : String(e));
    }
  };

  const live = async () => {
    try {
      const s = await shareFiles(files);
      setFiles(null);
      if (s) desk().say(`"${s.name}" is shared with your other devices while this page stays open.`);
    } catch (e) {
      desk().say(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="scrim" style={{ zIndex: 99400 }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Shared to PDA SEASIDE">
        <h2>Shared to PDA SEASIDE</h2>
        <p>
          <b>{what}</b> <span className="faint">({sizeOf(total)})</span>
        </p>
        <p className="small muted">
          <b>Save on the desktop</b> keeps a copy there (Vault › From devices), so this phone can let go of it. <b>Share from this phone</b> lets your
          other devices open it while this page stays open, without copying it.
        </p>
        {busy ? <p className="small">{busy}</p> : null}
        <div className="actions">
          <button className="btn" disabled={Boolean(busy)} onClick={() => setFiles(null)}>
            Cancel
          </button>
          <button className="btn" disabled={Boolean(busy)} onClick={() => void live()}>
            Share from this phone
          </button>
          <button className="btn primary" disabled={Boolean(busy)} onClick={() => void save()}>
            Save on the desktop
          </button>
        </div>
      </div>
    </div>
  );
}
