import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Desktop } from "./ui/Desktop.tsx";
import { desk } from "./lib/store.ts";
import "./styles.css";
import * as xdc from "./lib/xdc.ts";

// A handle for poking at the running desktop from the console while developing.
if (import.meta.env.DEV) Object.assign(window, { __pdd: { desk, xdc } });

// The desktop lives on localhost; 127.0.0.1 is where apps and games run, kept apart from it.
if (location.hostname === "127.0.0.1") location.replace(location.href.replace("//127.0.0.1", "//localhost"));

// A remembered account opens without asking.
const s = desk();
if (s.kept && s.accounts.some((a) => a.name === s.kept)) s.set({ session: s.kept });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Desktop />
  </StrictMode>,
);
