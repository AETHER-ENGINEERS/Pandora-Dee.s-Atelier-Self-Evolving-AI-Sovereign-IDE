import "./styles.css";
import { bootHeart } from "./lib/heart.ts";

// The desktop lives on localhost; 127.0.0.1 is where apps and games run, kept apart from it.
if (location.hostname === "127.0.0.1") location.replace(location.href.replace("//127.0.0.1", "//localhost"));

void (async () => {
  // The heart's keeper, or a desktop reopening after one, takes up the saved state before anything reads it.
  await bootHeart();
  const [{ StrictMode }, { createRoot }, { Desktop }, { desk }, xdc, { setupInstall }] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("./ui/Desktop.tsx"),
    import("./lib/store.ts"),
    import("./lib/xdc.ts"),
    import("./lib/install.ts"),
  ]);

  // A handle for poking at the running desktop from the console while developing.
  if (import.meta.env.DEV) Object.assign(window, { __pdd: { desk, xdc } });

  // Installing as an app (offered in the Help menu).
  setupInstall();

  // Songs an engine was still making when the page last closed or reloaded: pick up the wait.
  if (desk().media.pending?.length) void import("./apps/SongMaker.tsx").then((m) => m.resumeSongs());

  // A remembered account opens without asking.
  const s = desk();
  if (s.kept && s.accounts.some((a) => a.name === s.kept)) s.set({ session: s.kept });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Desktop />
    </StrictMode>,
  );
})();
