import { useEffect, useRef, useState } from "react";
import { Moon, MonitorSmartphone, Sun } from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { openMenuAt } from "../ui/ContextMenu.tsx";

/** The look pages are asked for: this device's own light or dark setting (followed as it changes), or the one
 *  chosen; and whether sites without a dark look of their own are darkened. Shared by both full browsers. */
export function usePageLook(): { scheme: "dark" | "light"; darken: boolean } {
  const pref = useDesk((s) => s.browser.scheme ?? "device");
  const darken = useDesk((s) => Boolean(s.browser.darken));
  const [deviceDark, setDeviceDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDeviceDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return { scheme: pref === "device" ? (deviceDark ? "dark" : "light") : pref, darken };
}

const setPrefs = (p: Partial<ReturnType<typeof desk>["browser"]>) => desk().set({ browser: { ...desk().browser, ...p } });

/** The browser bar's theme button: follow this device, dark, light, and darkening sites that have no dark look. */
export function LookButton() {
  const pref = useDesk((s) => s.browser.scheme ?? "device");
  const darken = useDesk((s) => Boolean(s.browser.darken));
  const ref = useRef<HTMLButtonElement>(null);
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : MonitorSmartphone;
  return (
    <button
      ref={ref}
      className="icon-btn"
      aria-label="Page colours"
      data-tip="Page colours: light, dark, or this device's setting"
      onClick={() =>
        ref.current &&
        openMenuAt(ref.current, [
          { heading: "Pages look" },
          { label: "As this device (light or dark)", checked: pref === "device", run: () => setPrefs({ scheme: "device" }) },
          { label: "Dark", checked: pref === "dark", run: () => setPrefs({ scheme: "dark" }) },
          { label: "Light", checked: pref === "light", run: () => setPrefs({ scheme: "light" }) },
          { sep: true },
          { label: "Darken sites that have no dark look", checked: darken, run: () => setPrefs({ darken: !darken }) },
        ])
      }
    >
      <Icon size={15} />
    </button>
  );
}
