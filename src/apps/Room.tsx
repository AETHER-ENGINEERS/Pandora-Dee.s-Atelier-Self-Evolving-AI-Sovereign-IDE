import { useEffect, useRef, useState } from "react";
import {
  Infinity as InfinityIcon,
  MessagesSquare,
  Repeat2,
  Square,
  Volume2,
  VolumeX,
  UserPlus,
  Brain,
  Copy,
  Send,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Pencil,
  Paperclip,
  X,
  FileText,
  ChevronDown,
  Plus,
} from "lucide-react";
import { desk, useDesk } from "../lib/store.ts";
import { editAndResend, letThemTalk, retry, say, stopAll } from "../lib/agent.ts";
import { maskName, maskText } from "../lib/privacy.ts";
import { addToMemory } from "../lib/tools.ts";
import { stopSpeaking, speak } from "../lib/voice.ts";
import { MicButton } from "../ui/Mic.tsx";
import { voiceFor } from "../lib/prefs.ts";
import { isImage, type Attachment, type Message } from "../lib/room.ts";
import { chatList, deleteChat, newChat, renameChat, switchChat, titleFrom } from "../lib/chats.ts";
import { openMenu, openMenuAt, type MenuItem } from "../ui/ContextMenu.tsx";
import { characterMenu, messageMenu } from "../ui/menus.ts";
import { askUser } from "../ui/Ask.tsx";
import { prepare, sizeOf, vaultUrl } from "../ui/attach.ts";
import { runSlash, suggest } from "../ui/slash.ts";

import { CharAvatar, Markdown, PersonAvatar, timeOf } from "../ui/common.tsx";
import { openSettings } from "../ui/desktopApi.tsx";

/** The latest character reply that Retry would replace. */
function retryTarget(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === "human") return null;
    if (m.kind === "character" && !m.pass && m.text) return m.id;
  }
  return null;
}

export function chatMenu(): MenuItem[] {
  const s = desk();
  const list = chatList();
  const report = (why: string) => why && s.notice(why);
  return [
    { label: "New chat", hint: "/new", run: () => void newChat().then(report) },
    { sep: true },
    { heading: "Saved chats" },
    ...list.slice(0, 40).map((c) => ({
      label: `${c.title}${c.count ? ` · ${c.count}` : ""}`,
      checked: c.id === s.chatId,
      run: () => void switchChat(c.id).then(report),
    })),
    { sep: true },
    {
      label: "Rename this chat…",
      run: () => {
        const cur = list.find((c) => c.id === s.chatId);
        const t = window.prompt("Name this chat", cur?.title ?? "");
        if (t) renameChat(s.chatId, t);
      },
    },
    {
      label: "Delete this chat…",
      danger: true,
      run: () =>
        void askUser("Delete this chat?", "Its messages are removed from this computer. Journals and memories the characters wrote stay.", "Delete", "Keep it").then(
          (ok) => ok && void deleteChat(desk().chatId).then(report),
        ),
    },
  ];
}

function Files({ files }: { files: Attachment[] }) {
  return (
    <div className="msg-files">
      {files.map((f) =>
        isImage(f) ? (
          <a key={f.path} href={vaultUrl(f.path)} target="_blank" rel="noreferrer" data-tip={f.name}>
            <img src={vaultUrl(f.path)} alt={f.name} />
          </a>
        ) : (
          <a key={f.path} className="file-chip" href={vaultUrl(f.path)} target="_blank" rel="noreferrer" data-tip={`Saved at /vault/${f.path}`}>
            <FileText size={13} /> {f.name} <span className="faint">{sizeOf(f.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function RoomApp() {
  const s = useDesk();
  const room = s.roomCharacters();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [pick, setPick] = useState(0);
  const [dragging, setDragging] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const atBottom = useRef(true);
  const busy = Object.keys(s.busy).length > 0;
  const account = s.accounts.find((a) => a.name === s.session);
  const noConnection = !s.model.connections.some((c) => c.enabled);
  const retryId = busy ? null : retryTarget(s.messages);
  const meta = s.chats.find((c) => c.id === s.chatId);
  const title = meta && meta.title !== "New chat" ? meta.title : titleFrom(s.messages);
  const hints = suggest(draft);

  useEffect(() => {
    const el = threadRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [s.messages]);
  useEffect(() => setPick(0), [draft]);

  const attach = async (list: FileList | File[]) => {
    const all = [...list];
    if (!all.length) return;
    setUploading((n) => n + all.length);
    for (const f of all) {
      try {
        const a = await prepare(f);
        setFiles((prev) => [...prev, a]);
      } catch (e) {
        desk().notice(e instanceof Error ? e.message : `Couldn't attach ${f.name}.`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text && !files.length) return;
    if (uploading) return;
    atBottom.current = true;
    if (text.startsWith("/") && !text.startsWith("//") && !files.length) {
      setDraft("");
      await runSlash(text);
      return;
    }
    const sending = files;
    setDraft("");
    setFiles([]);
    await say(text.startsWith("//") ? text.slice(1) : text, undefined, { files: sending });
  };

  return (
    <div
      className={`room${dragging ? " dropping" : ""}`}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void attach(e.dataTransfer.files);
      }}
    >
      <div className="room-bar">
        <button className="chat-title" onClick={(e) => openMenuAt(e.currentTarget, chatMenu())} data-tip="Saved chats: switch, start a new one, rename" aria-label={`Chat: ${title}. Saved chats`}>
          <span className="t">{title}</span>
          <ChevronDown size={13} />
        </button>
        <button className="icon-btn" data-tip="New chat (this one is saved)" aria-label="New chat" disabled={busy} onClick={() => void newChat().then((why) => why && desk().notice(why))}>
          <Plus size={16} />
        </button>
        <span className="bar-sep" />
        {room.map((c) => (
          <span
            key={c.id}
            className={`chip${s.focus === c.id ? " focus" : ""}`}
            style={{ ["--c" as string]: c.accent }}
            onContextMenu={(e) => openMenu(e, characterMenu(c.id))}
            onClick={() => desk().setFocus(c.id)}
            role="button"
            tabIndex={0}
            data-tip={s.focus === c.id ? `${c.short} answers when nobody is named` : `Click so ${c.short} answers by default`}
          >
            <CharAvatar c={c} size={22} />
            {c.short}
            {s.busy[c.id] ? <span className="typing-dot" title={s.busy[c.id]} /> : null}
            <button className="x" aria-label={`Ask ${c.short} to step out`} onClick={(e) => (e.stopPropagation(), desk().leave(c.id))}>
              ×
            </button>
          </span>
        ))}
        <button className="icon-btn" data-tip="Invite someone" aria-label="Invite someone" onClick={() => desk().openApp("cast")}>
          <UserPlus size={16} />
        </button>
        <span className="grow" />
        <button className="icon-btn" data-tip="Let them talk: everyone else gets a turn" aria-label="Let them talk" disabled={busy || room.length < 1} onClick={() => void letThemTalk()}>
          <MessagesSquare size={16} />
        </button>
        <button
          className={`icon-btn${s.freeTalk ? " on" : ""}`}
          data-tip={s.freeTalk ? "Free talk is on: they keep talking until the loop breaker stops them" : "Free talk is off: one round at a time"}
          aria-label="Free talk"
          aria-pressed={s.freeTalk}
          onClick={() => desk().set({ freeTalk: !s.freeTalk })}
        >
          <InfinityIcon size={16} />
        </button>
        <button
          className={`icon-btn${s.loopBreak ? " on" : ""}`}
          data-tip={s.loopBreak ? "Loop breaker is on: keeps them from going in circles (and burning tokens). Stops repeats, and waits for you after 6 replies" : "Loop breaker is off: only a hard limit of 16 replies in a row"}
          aria-label="Loop breaker"
          aria-pressed={s.loopBreak}
          onClick={() => desk().set({ loopBreak: !s.loopBreak })}
        >
          <Repeat2 size={16} />
        </button>
        <button
          className={`icon-btn${s.voice.on ? " on" : ""}`}
          data-tip={s.voice.on ? "Voice is on: replies are read aloud" : "Voice is off"}
          aria-label="Voice"
          aria-pressed={s.voice.on}
          onClick={() => {
            if (s.voice.on) stopSpeaking();
            desk().set({ voice: { ...s.voice, on: !s.voice.on } });
          }}
        >
          {s.voice.on ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        {busy ? (
          <button className="icon-btn" data-tip="Stop" aria-label="Stop" onClick={stopAll}>
            <Square size={15} />
          </button>
        ) : null}
      </div>

      <div
        className="thread"
        ref={threadRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        aria-live="polite"
      >
        {s.messages.length === 0 ? (
          <div className="empty">
            {noConnection ? (
              <>
                <p>No AI connection yet.</p>
                <button className="btn primary" onClick={() => openSettings("ai")}>
                  Connect a model
                </button>
              </>
            ) : (
              <>
                <p>
                  {room.length ? `${room.map((c) => c.short).join(" and ")} ${room.length === 1 ? "is" : "are"} here.` : "The room is empty."} Say hello.
                </p>
                <p className="small faint">Name someone to talk to them directly, or say "everyone". Type / for commands.</p>
              </>
            )}
          </div>
        ) : null}
        {s.messages.map((m) => {
          if (m.pass) return null;
          if (m.kind === "notice")
            return (
              <div key={m.id} className={`msg notice${m.error ? " error" : ""}`} onContextMenu={(e) => openMenu(e, messageMenu(m))}>
                <div className="text">{m.text}</div>
              </div>
            );
          const c = m.kind === "character" ? s.character(m.who) : undefined;
          const fromBridge = m.source !== "desk";
          const name = m.kind === "human" ? maskName(s.privacy, m.name, fromBridge) : c?.short ?? m.name;
          const text = m.kind === "human" ? maskText(s.privacy, m.text, fromBridge) : m.text;
          const mine = m.kind === "human" && !fromBridge;
          const rate = (r: 1 | -1) => desk().patchMessage(m.id, { rating: m.rating === r ? undefined : r });
          return (
            <div key={m.id} className={`msg ${m.kind}`} style={{ ["--c" as string]: c?.accent }} onContextMenu={(e) => openMenu(e, messageMenu(m, { edit: () => setEditing({ id: m.id, text: m.text }), retry: m.id === retryId }))}>
              {c ? <CharAvatar c={c} size={34} /> : <PersonAvatar name={name} picture={!fromBridge && m.who === account?.name ? account?.picture : undefined} size={34} />}
              <div className="bubble">
                <div className="who">
                  {name}
                  {fromBridge ? <span className="source">{m.source === "discord" ? "Discord" : "Vector"}</span> : null}
                  <span className="when">{timeOf(m.at)}</span>
                </div>
                {m.tools?.length ? (
                  <div className="tools">
                    {m.tools.map((t, i) => (
                      <span key={i} className={t.ok ? "" : "fail"}>
                        {t.note}
                      </span>
                    ))}
                  </div>
                ) : null}
                {c && m.thinking && s.chat.thinking !== "hidden" ? (
                  <details className="thinking" open={s.chat.thinking === "open" || (Boolean(s.busy[c.id]) && !text)}>
                    <summary>
                      {s.busy[c.id] && !text ? "Thinking…" : "Thinking"} <span className="faint">· {m.thinking.split(/\s+/).length} words</span>
                    </summary>
                    <Markdown className="thinking-text" text={m.thinking} />
                  </details>
                ) : null}
                {editing?.id === m.id ? (
                  <div className="edit-box">
                    <textarea
                      value={editing.text}
                      autoFocus
                      aria-label="Edit your message"
                      onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditing(null);
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          const t = editing.text;
                          setEditing(null);
                          void editAndResend(m.id, t).then((why) => why && desk().notice(why));
                        }
                      }}
                    />
                    <div className="row">
                      <button
                        className="btn primary small"
                        disabled={busy || !editing.text.trim()}
                        onClick={() => {
                          const t = editing.text;
                          setEditing(null);
                          void editAndResend(m.id, t).then((why) => why && desk().notice(why));
                        }}
                      >
                        Send again
                      </button>
                      <button className="btn small" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <span className="small faint">Everything after this message is replaced.</span>
                    </div>
                  </div>
                ) : text ? (
                  <Markdown className="text" text={text} />
                ) : c && s.busy[c.id] ? (
                  <span className="faint small">{s.busy[c.id]}…</span>
                ) : null}
                {m.files?.length ? <Files files={m.files} /> : null}
                {c && text ? (
                  <div className={`msg-actions${m.rating ? " rated" : ""}`}>
                    <button onClick={() => navigator.clipboard?.writeText(text)} title="Copy">
                      <Copy size={12} /> Copy
                    </button>
                    <button
                      onClick={() => {
                        const v = voiceFor(c.id);
                        speak(c.id, text, { ...v.prefs, on: true }, v.shift);
                      }}
                      title="Read aloud"
                    >
                      <Volume2 size={12} /> Hear
                    </button>
                    <button
                      onClick={() => {
                        addToMemory(c.id, text.replace(/\n+/g, " ").slice(0, 300), "Notes to self");
                        desk().say(`Kept in ${c.short}'s memory.`);
                      }}
                      title="Keep in this character's memory"
                    >
                      <Brain size={12} /> Remember
                    </button>
                    <button className={m.rating === 1 ? "on" : ""} onClick={() => rate(1)} aria-pressed={m.rating === 1} title="Good reply" aria-label="Good reply">
                      <ThumbsUp size={12} />
                    </button>
                    <button className={m.rating === -1 ? "on bad" : ""} onClick={() => rate(-1)} aria-pressed={m.rating === -1} title="Poor reply" aria-label="Poor reply">
                      <ThumbsDown size={12} />
                    </button>
                    {m.id === retryId ? (
                      <button onClick={() => void retry().then((why) => why && desk().notice(why))} title="Ask again for this reply">
                        <RotateCcw size={12} /> Retry
                      </button>
                    ) : null}
                    {m.via ? <span className="faint small" style={{ padding: "2px 6px" }}>{m.via}</span> : null}
                  </div>
                ) : null}
                {mine && editing?.id !== m.id ? (
                  <div className="msg-actions">
                    <button onClick={() => navigator.clipboard?.writeText(m.text)} title="Copy">
                      <Copy size={12} /> Copy
                    </button>
                    <button disabled={busy} onClick={() => setEditing({ id: m.id, text: m.text })} title="Change it and send it again">
                      <Pencil size={12} /> Edit
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {hints.length ? (
        <div className="slash-hints" role="listbox" aria-label="Commands">
          {hints.slice(0, 10).map((h, i) => (
            <button
              key={h.name}
              role="option"
              aria-selected={i === pick}
              className={i === pick ? "on" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDraft(`/${h.name}${h.args && !h.name.endsWith(":") ? " " : ""}`)}
            >
              <b>/{h.name}</b>
              {h.args ? <span className="faint"> {h.args}</span> : null}
              <span className="muted"> · {h.help}</span>
            </button>
          ))}
        </div>
      ) : null}
      {files.length || uploading ? (
        <div className="pending-files">
          {files.map((f) => (
            <span key={f.path} className="file-chip">
              {isImage(f) ? <img src={vaultUrl(f.path)} alt="" /> : <FileText size={13} />}
              {f.name}
              <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((prev) => prev.filter((x) => x.path !== f.path))}>
                <X size={12} />
              </button>
            </span>
          ))}
          {uploading ? <span className="small faint">Adding {uploading}…</span> : null}
        </div>
      ) : null}
      <div className="composer">
        <button className="icon-btn" data-tip-up="" data-tip="Attach files or pictures (or paste, or drop them here)" aria-label="Attach files" onClick={() => fileRef.current?.click()}>
          <Paperclip size={16} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void attach(e.target.files);
            e.target.value = "";
          }}
        />
        <textarea
          value={draft}
          placeholder={room.length ? `Talk to ${s.character(s.focus)?.short ?? "the room"}, or name someone… (/ for commands)` : "Invite someone first"}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const pics = [...e.clipboardData.files];
            if (pics.length) {
              e.preventDefault();
              void attach(pics);
            }
          }}
          onKeyDown={(e) => {
            if (hints.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setPick((p) => (p + (e.key === "ArrowDown" ? 1 : -1) + Math.min(hints.length, 10)) % Math.min(hints.length, 10));
                return;
              }
              if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && hints[pick] && `/${hints[pick].name}` !== draft.trim() && (hints[pick].args || hints[pick].name.endsWith(":")))) {
                e.preventDefault();
                const h = hints[pick];
                setDraft(`/${h.name}${h.args && !h.name.endsWith(":") ? " " : ""}`);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && hints[pick] && `/${hints[pick].name}` !== draft.trim()) {
                e.preventDefault();
                setDraft("");
                void runSlash(`/${hints[pick].name}`);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          aria-label="Message"
        />
        <MicButton onText={(t) => setDraft((d) => (d.trim() ? `${d.trimEnd()} ${t}` : t))} />
        <button className="btn primary" onClick={() => void send()} disabled={(!draft.trim() && !files.length) || uploading > 0} aria-label="Send">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
