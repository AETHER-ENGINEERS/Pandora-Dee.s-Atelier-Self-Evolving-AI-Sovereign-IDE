import { useEffect, useState } from "react";

/**
 * A slider with a number box beside it, so an exact value can be typed.
 * `percent` shows and takes 0..1 values as 0..100. `typedMax` lets the box take more than the
 * slider reaches (the slider then sits at its end).
 */
export function Num({
  value,
  min,
  max,
  typedMax,
  step = 1,
  onChange,
  percent = false,
  disabled,
  "aria-label": label,
}: {
  value: number;
  min: number;
  max: number;
  typedMax?: number;
  step?: number;
  onChange: (n: number) => void;
  percent?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const k = percent ? 100 : 1;
  const shown = (n: number) => String(Math.round(n * k * 1000) / 1000);
  const [text, setText] = useState(shown(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown(value));
  }, [value, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (raw: string) => {
    const n = Number(raw.replace(",", ".").replace("%", "").trim());
    if (!Number.isFinite(n)) return setText(shown(value));
    const v = Math.min(typedMax ?? max, Math.max(min, n / k));
    onChange(v);
    setText(shown(v));
  };

  return (
    <span className="num">
      <input type="range" min={min} max={max} step={step} value={Math.min(max, value)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <span className="num-box">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          aria-label={label ? `${label}, exact value` : "Exact value"}
          onFocus={(e) => {
            setEditing(true);
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            setEditing(false);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setText(shown(value));
              setEditing(false);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const v = Math.min(typedMax ?? max, Math.max(min, value + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1)));
              onChange(Math.round(v * 1e6) / 1e6);
            }
          }}
        />
        {percent ? <span className="faint">%</span> : null}
      </span>
    </span>
  );
}
