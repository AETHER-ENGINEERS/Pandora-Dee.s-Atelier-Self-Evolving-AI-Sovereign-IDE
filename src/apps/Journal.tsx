import { useState } from "react";
import { BookPlus, Brain } from "lucide-react";
import { useDesk } from "../lib/store.ts";
import { reflect, writeJournal } from "../lib/agent.ts";
import { Markdown } from "../ui/common.tsx";
import { CharacterPicker } from "./Files.tsx";

/** Each character's quest journal and memory, side by side. */
export function JournalApp() {
  const s = useDesk();
  const [charId, setCharId] = useState(s.focus || "dee");
  const [tab, setTab] = useState<"journal" | "memory">("journal");
  const [working, setWorking] = useState("");
  const c = s.character(charId);
  const files = s.filesOf(charId);
  const days = Object.keys(files)
    .filter((p) => p.startsWith("journal/") && !p.endsWith("README.md"))
    .sort()
    .reverse();
  const [day, setDay] = useState("");
  const open = days.includes(day) ? day : days[0];

  const run = async (what: "journal" | "memory") => {
    setWorking(what === "journal" ? `${c?.short} is writing…` : `${c?.short} is thinking back…`);
    const msg = what === "journal" ? await writeJournal(charId) : await reflect(charId);
    setWorking(msg);
    setTimeout(() => setWorking(""), 5000);
  };

  return (
    <div className="split">
      <aside className="side">
        <div className="toolbar">
          <CharacterPicker value={charId} onChange={setCharId} />
        </div>
        <div className="list">
          <button className={`item${tab === "memory" ? " on" : ""}`} onClick={() => setTab("memory")}>
            Memory
          </button>
          <div className="folder">Journal</div>
          {days.length === 0 ? <div className="small faint" style={{ padding: 8 }}>No entries yet.</div> : null}
          {days.map((p) => (
            <button key={p} className={`item${tab === "journal" && p === open ? " on" : ""}`} onClick={() => (setTab("journal"), setDay(p))}>
              {p.replace("journal/", "").replace(/\.md$/, "")}
            </button>
          ))}
        </div>
      </aside>
      <section className="main" style={{ ["--c" as string]: c?.accent }}>
        <div className="toolbar">
          <span className="small muted grow">{working}</span>
          <button className="btn small" onClick={() => void run("journal")} disabled={Boolean(working) && working.endsWith("…")}>
            <BookPlus size={14} /> Write today's entry
          </button>
          <button className="btn small" onClick={() => void run("memory")} disabled={Boolean(working) && working.endsWith("…")}>
            <Brain size={14} /> Reflect into memory
          </button>
        </div>
        <div className="preview">
          {tab === "memory" ? (
            <Markdown text={files["MEMORY.md"] ?? "No memory file."} />
          ) : open ? (
            <Markdown text={files[open]} />
          ) : (
            <>
              <p className="muted">
                {c?.short}'s journal is a quest journal: their own story of what happened with the people they were with, the humour that fit, and the clear next step. Talk in the Room, then press <b>Write today's entry</b>.
              </p>
              {files["journal/README.md"] ? <Markdown text={files["journal/README.md"]} /> : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
