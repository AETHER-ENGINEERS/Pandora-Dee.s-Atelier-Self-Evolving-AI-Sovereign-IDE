// Sentry's device watch. Off by default; runs only when privacy allows it and the adult
// shelf is open or the passcode approved it for this session. Nothing leaves the computer.

import { useEffect } from "react";
import { desk, useDesk } from "../lib/store.ts";
import { allowed } from "../lib/privacy.ts";

type BatteryLike = EventTarget & { level: number; charging: boolean };

export function useSensors() {
  const sensors = useDesk((s) => s.sensors);
  const privacy = useDesk((s) => s.privacy);
  const gate = useDesk((s) => s.adultOpen || s.sensorPass);
  const shut = useDesk((s) => s.flood.shut);
  const live = allowed(privacy, "sensors") && gate && !shut;

  useEffect(() => {
    if (!live) return;
    const note = (line: string) => {
      const s = desk();
      s.log(`Sentry: ${line}`);
      s.appendFile("jade", "journal/sentry.md", `- ${new Date().toLocaleString()} · ${line}`);
      if (s.sensors.tellRoom && s.members.includes("jade")) s.notice(`Jade noticed: ${line}`);
    };
    const off: (() => void)[] = [];
    if (sensors.network) {
      const on = () => note("the network came back.");
      const down = () => note("the network dropped.");
      window.addEventListener("online", on);
      window.addEventListener("offline", down);
      off.push(() => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", down);
      });
    }
    if (sensors.screen) {
      const vis = () => note(document.hidden ? "the desktop went into the background." : "someone came back to the desktop.");
      document.addEventListener("visibilitychange", vis);
      off.push(() => document.removeEventListener("visibilitychange", vis));
    }
    if (sensors.battery) {
      const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
      let battery: BatteryLike | null = null;
      const charge = () => battery && note(battery.charging ? "the charger was plugged in." : "the charger was unplugged.");
      const level = () => battery && battery.level <= 0.15 && !battery.charging && note(`battery is low (${Math.round(battery.level * 100)}%).`);
      nav.getBattery?.().then((b) => {
        battery = b;
        b.addEventListener("chargingchange", charge);
        b.addEventListener("levelchange", level);
      });
      off.push(() => {
        battery?.removeEventListener("chargingchange", charge);
        battery?.removeEventListener("levelchange", level);
      });
    }
    desk().log("Sentry device watch started.");
    return () => {
      off.forEach((fn) => fn());
      desk().log("Sentry device watch stopped.");
    };
  }, [live, sensors.battery, sensors.network, sensors.screen]);
}
