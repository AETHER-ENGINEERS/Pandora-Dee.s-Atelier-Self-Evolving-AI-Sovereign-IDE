import { useEffect, useRef, useState } from "react";
import { desk, useDesk } from "../lib/store.ts";
import { initials, type Character, type Look } from "../lib/characters.ts";
import { useSpeech } from "../ui/common.tsx";
import { openMenu } from "../ui/ContextMenu.tsx";
import { characterMenu } from "../ui/menus.ts";
import { FullAvatar } from "../ui/FullAvatar.tsx";

/** The animated face: anime bust with lip-sync, chibi, or the photo. */
export function Face({ c, look, mouth, speaking }: { c: Character; look: Look; mouth: number; speaking: boolean }) {
  const avatar = useDesk((s) => s.charPrefs[c.id]?.avatar);
  if (look === "avatar" && avatar)
    return (
      <div className={`portrait full-look${speaking ? " speaking" : ""}`} style={{ ["--c" as string]: c.accent }}>
        <FullAvatar charId={c.id} a={avatar} />
      </div>
    );
  const still = c.art.still;
  if (look === "photo" || !still) {
    const src = c.art.portrait || still;
    if (!src)
      return (
        <div className="portrait initials" style={{ ["--c" as string]: c.accent }}>
          {initials(c.name)}
        </div>
      );
    return (
      <div className={`portrait photo${speaking ? " speaking" : ""}`} style={{ ["--c" as string]: c.accent }}>
        <img src={src} alt={c.name} draggable={false} />
      </div>
    );
  }
  if (look === "chibi" && c.art.chibi)
    return (
      <div className={`portrait chibi${speaking ? " speaking" : ""}`} style={{ ["--c" as string]: c.accent }}>
        <img src={c.art.chibi} alt={c.name} draggable={false} style={speaking ? { transform: `translateY(${-mouth * 2}%)` } : undefined} />
      </div>
    );
  return (
    <div className={`portrait talking${speaking ? " speaking" : ""}`} style={{ ["--c" as string]: c.accent }}>
      <img src={still} alt={c.name} draggable={false} />
      {c.art.open ? <img className="open" src={c.art.open} alt="" draggable={false} style={{ opacity: speaking ? Math.min(1, mouth * 0.95) : 0 }} /> : null}
    </div>
  );
}

/** One shared window that shows whoever is speaking, like a video call. */
export function PresenceApp() {
  const s = useDesk();
  const room = s.roomCharacters();
  const sp = useSpeech();
  const typing = Object.keys(s.busy)[0];
  const [lastActive, setLastActive] = useState(s.focus);
  const captionRef = useRef<HTMLDivElement>(null);
  const active = sp.who || typing || lastActive;

  useEffect(() => {
    if (sp.who) setLastActive(sp.who);
    else if (typing) setLastActive(typing);
  }, [sp.who, typing]);

  useEffect(() => {
    if (!room.some((c) => c.id === lastActive)) setLastActive(s.focus);
  }, [room, lastActive, s.focus]);

  const main = room.find((c) => c.id === active) ?? room.find((c) => c.id === s.focus) ?? room[0];
  const lastLine = [...s.messages].reverse().find((m) => m.kind === "character" && m.who === main?.id && !m.pass);
  const caption = sp.who === main?.id && sp.text ? sp.text : s.busy[main?.id ?? ""] ? `${s.busy[main!.id]}…` : lastLine?.text ?? "";

  useEffect(() => {
    if (captionRef.current) captionRef.current.scrollTop = captionRef.current.scrollHeight;
  }, [caption]);

  if (!main)
    return (
      <div className="empty">
        Nobody's in the room.{" "}
        <button className="btn small" onClick={() => desk().openApp("cast")}>
          Invite someone
        </button>
      </div>
    );

  const look = (c: Character): Look => s.charPrefs[c.id]?.look ?? "talking";
  return (
    <div className="stage" style={{ ["--c" as string]: main.accent }}>
      <div className="main-tile" onContextMenu={(e) => openMenu(e, characterMenu(main.id))} onClick={() => desk().setFocus(main.id)} title={`${main.short} answers by default when you click`}>
        <Face c={main} look={look(main)} mouth={sp.who === main.id ? sp.mouth : 0} speaking={sp.who === main.id} />
        <div className="name-tag" style={{ color: main.accent }}>
          {main.short}
          {s.focus === main.id ? <span className="faint small">· in focus</span> : null}
        </div>
      </div>
      <div className="caption" ref={captionRef}>
        {caption ? caption.slice(-600) : <span className="faint">{main.greeting}</span>}
      </div>
      {room.length > 1 ? (
        <div className="tiles">
          {room.map((c) => (
            <button
              key={c.id}
              className={`tile${s.focus === c.id ? " focus" : ""}${sp.who === c.id || s.busy[c.id] ? " speaking" : ""}`}
              onContextMenu={(e) => openMenu(e, characterMenu(c.id))}
              style={{ ["--c" as string]: c.accent }}
              onClick={() => {
                desk().setFocus(c.id);
                setLastActive(c.id);
              }}
              aria-label={`Show ${c.short}`}
            >
              <Face c={c} look={look(c)} mouth={sp.who === c.id ? sp.mouth : 0} speaking={sp.who === c.id} />
              <span className="lbl">{c.short}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
