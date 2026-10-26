import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check } from "lucide-react";

/** One line in a right-click menu. A line with only `sep` is a divider; `heading` is a label. */
export type MenuItem =
  | { sep: true }
  | { heading: string }
  | { label: string; run: () => void; disabled?: boolean; checked?: boolean; danger?: boolean; hint?: string; icon?: ReactNode };

type Open = { x: number; y: number; items: MenuItem[] } | null;

let current: Open = null;
const listeners = new Set<() => void>();
const set = (next: Open) => {
  current = next;
  for (const fn of listeners) fn();
};

/** Open a menu where the pointer is. Use from onContextMenu handlers. */
export function openMenu(e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  const shown = items.filter((it, i, all) => !("sep" in it) || (i > 0 && i < all.length - 1 && !("sep" in all[i - 1])));
  set({ x: e.clientX, y: e.clientY, items: shown });
}

/** Open a menu next to an element, for keyboard users (Shift+F10 or the Menu key). */
export function openMenuAt(el: Element, items: MenuItem[]) {
  const r = el.getBoundingClientRect();
  set({ x: r.left + Math.min(24, r.width / 2), y: r.top + Math.min(24, r.height / 2), items });
}

export const closeMenu = () => set(null);

/** For keyboard: true when this key event asks for a context menu. */
export const isMenuKey = (e: { key: string; shiftKey: boolean }) => e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");

export function ContextMenuHost() {
  const menu = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => current,
    () => null,
  );
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!menu) return;
    // Keep it on screen.
    const el = ref.current;
    const w = el?.offsetWidth ?? 240;
    const h = el?.offsetHeight ?? 300;
    setPos({ x: Math.max(4, Math.min(menu.x, window.innerWidth - w - 4)), y: Math.max(4, Math.min(menu.y, window.innerHeight - h - 4)) });
    el?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && closeMenu();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeMenu();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    };
    const t = window.setTimeout(() => {
      window.addEventListener("pointerdown", away, true);
      window.addEventListener("blur", closeMenu);
    }, 0);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div ref={ref} className="menu context-menu" style={{ position: "fixed", left: pos.x, top: pos.y }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, i) => {
        if ("sep" in it) return <div key={i} className="sep" />;
        if ("heading" in it)
          return (
            <div key={i} className="small muted" style={{ padding: "4px 10px" }}>
              {it.heading}
            </div>
          );
        return (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            className={it.danger ? "danger-item" : undefined}
            onClick={() => {
              closeMenu();
              it.run();
            }}
          >
            <span className="check-mark">{it.checked ? <Check size={13} /> : it.icon ?? null}</span>
            {it.label}
            {it.hint ? <span className="kbd">{it.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
