import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { desk } from "../lib/store.ts";
import { cantListen, record, transcribe, type Recording } from "../lib/listen.ts";

/**
 * Talk instead of typing: press to start, press again to stop; what you said lands in the message box (it isn't
 * sent on its own, so you can check it first). Stops by itself after two minutes.
 */
export function MicButton({ onText, className = "icon-btn" }: { onText: (text: string) => void; className?: string }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const rec = useRef<Recording | null>(null);
  const [level, setLevel] = useState(0);
  const limit = useRef(0);

  useEffect(() => {
    if (state !== "recording") return;
    let raf = 0;
    const tick = () => {
      setLevel(rec.current?.level() ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);
  useEffect(() => () => rec.current?.cancel(), []);

  const stop = async () => {
    window.clearTimeout(limit.current);
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    setState("working");
    try {
      const text = await transcribe(await r.stop());
      if (text) onText(text);
      else desk().say("Didn't catch anything there.");
    } catch (e) {
      desk().say(e instanceof Error ? e.message : String(e));
    } finally {
      setState("idle");
    }
  };

  const start = async () => {
    const why = cantListen();
    if (why) return desk().say(why);
    try {
      rec.current = await record();
      setState("recording");
      limit.current = window.setTimeout(() => void stop(), 120_000);
    } catch (e) {
      desk().say(e instanceof DOMException && e.name === "NotAllowedError" ? "The microphone wasn't allowed. Allow it for this page in the browser's site settings." : `Couldn't start the microphone: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <button
      type="button"
      className={`${className} mic-btn${state === "recording" ? " recording" : ""}`}
      style={state === "recording" ? { ["--lvl" as string]: level.toFixed(2) } : undefined}
      aria-label={state === "recording" ? "Stop and use what I said" : state === "working" ? "Listening…" : "Talk instead of typing"}
      aria-pressed={state === "recording"}
      data-tip-up=""
      data-tip={state === "recording" ? "Stop: what you said goes in the box" : "Talk instead of typing"}
      disabled={state === "working"}
      onClick={() => void (state === "recording" ? stop() : start())}
    >
      {state === "recording" ? <Square size={14} /> : state === "working" ? <Loader2 size={15} className="spin" /> : <Mic size={16} />}
    </button>
  );
}
