import { clamp, denormalizePoint, minDim, normalizePoint, pointToSegmentDist } from "../utils.js";
import { makeDraggableEmoji } from "../drag.js";

const SKIN_TONES = {
  lightPeach: { bg: "#f3c7a3" },
  peach: { bg: "#f0ad86" },
  darkPeach: { bg: "#d9916a" },
  lightBrown: { bg: "#c68963" },
  brown: { bg: "#9a6647" },
  darkBrown: { bg: "#7a4c36" },
};

function getToolMeta(tool) {
  switch (tool) {
    case "🔪":
      return { kind: "knife" };
    case "🧽":
      return { kind: "cleaner" };
    case "🧴":
      return { kind: "syringe" };
    case "🪡":
      return { kind: "needle" };
    case "🧻":
      return { kind: "bandage" };
    case "🥢":
      return { kind: "spawnBasic" };
    case "🥢🫀":
      return { kind: "spawnSpecial" };
    case "🧠":
      return { kind: "spawnOne", emoji: "🧠", source: "one" };
    case "🫀":
      return { kind: "spawnOne", emoji: "🫀", source: "one" };
    case "🫁":
      return { kind: "spawnOne", emoji: "🫁", source: "one" };
    case "🦴":
      return { kind: "spawnOne", emoji: "🦴", source: "one" };
    default:
      return { kind: "knife" };
  }
}

const COLORS = {
  knife: "#7b0000",
  knifeLight: "#f1a8a8",
  syringe: "rgba(255,255,255,0.45)",
  needle: "#0a0a0a",
  bandage: "rgba(255,255,255,0.92)",
};

const BASIC_SPAWN_EMOJIS = ["🕷", "🦠", "🪨", "🪳"];
const SPECIAL_SPAWN_EMOJIS = ["🫀", "🫁", "🧠", "🦴"];

function strokeSizeRel(kind, minD) {
  // widths chosen relative to min dimension; tuned for good look
  const knife = 0.055;     // ~5.5% of min dimension
  const syringe = 0.038;  // smaller than knife
  const bandage = 0.048;  // big, slightly less than knife
  const needleLine = 0.012; // small-ish lines
  switch (kind) {
    case "knife": return knife;
    case "syringe": return syringe;
    case "bandage": return bandage;
    case "needle": return needleLine;
    default: return knife;
  }
}

function render(ctx, model, w, h) {
  ctx.clearRect(0, 0, w, h);

  // Draw in order: knife, syringe, bandage, then needle lines (so it stays visible)
  // but keep simple: just iterate.
  for (const s of model.strokes) {
    if (s.type === "needleLine") {
      const a = denormalizePoint(s.start.x, s.start.y, w, h);
      const b = denormalizePoint(s.end.x, s.end.y, w, h);
      ctx.save();
      ctx.strokeStyle = COLORS.needle;
      ctx.lineWidth = s.widthRel * minDim(w, h);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    // Polyline-ish
    const px = s.points.map((p) => denormalizePoint(p.x, p.y, w, h));
    if (px.length < 2) continue;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const lw = s.widthRel * minDim(w, h);

    if (s.type === "knife") {
      ctx.strokeStyle = s.lightened ? COLORS.knifeLight : COLORS.knife;
      ctx.lineWidth = lw;
    } else if (s.type === "syringe") {
      ctx.strokeStyle = COLORS.syringe;
      ctx.lineWidth = lw;
    } else if (s.type === "bandage") {
      ctx.strokeStyle = COLORS.bandage;
      ctx.lineWidth = lw;
    }

    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    for (let i = 1; i < px.length; i++) ctx.lineTo(px[i].x, px[i].y);
    ctx.stroke();
    ctx.restore();
  }
}

function pointHitsKnife(model, xPx, yPx, w, h) {
  const minD = minDim(w, h);
  const knifeStrokes = model.strokes.filter((s) => s.type === "knife" && !s.deleted);
  for (const ks of knifeStrokes) {
    const widthPx = ks.widthRel * minD;
    const pts = ks.points.map((p) => denormalizePoint(p.x, p.y, w, h));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = pointToSegmentDist(xPx, yPx, a.x, a.y, b.x, b.y);
      if (d <= widthPx / 2 + 2) return true;
    }
  }
  return false;
}

function lineTouchesKnife(model, lineA, lineB, w, h, extraPad = 0) {
  const minD = minDim(w, h);
  const touched = new Set();

  const segTouch = (p1, p2, q1, q2, pad) => {
    // check if polyline segment is close to needle line segment
    // using endpoint-to-segment distance approx
    const d1 = pointToSegmentDist(p1.x, p1.y, q1.x, q1.y, q2.x, q2.y);
    const d2 = pointToSegmentDist(p2.x, p2.y, q1.x, q1.y, q2.x, q2.y);
    const d3 = pointToSegmentDist(q1.x, q1.y, p1.x, p1.y, p2.x, p2.y);
    const d4 = pointToSegmentDist(q2.x, q2.y, p1.x, p1.y, p2.x, p2.y);
    return Math.min(d1, d2, d3, d4) <= pad;
  };

  const knives = model.strokes.filter((s) => s.type === "knife" && !s.deleted);
  for (const ks of knives) {
    const widthPx = ks.widthRel * minD;
    const pad = widthPx / 2 + 2 + extraPad;
    const pts = ks.points.map((p) => denormalizePoint(p.x, p.y, w, h));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (segTouch(a, b, lineA, lineB, pad)) {
        touched.add(ks);
        break;
      }
    }
  }
  return touched;
}

function strokesTouch(model, s1, s2, w, h) {
  const minD = minDim(w, h);
  const pts1 = s1.points.map((p) => denormalizePoint(p.x, p.y, w, h));
  const pts2 = s2.points.map((p) => denormalizePoint(p.x, p.y, w, h));
  const w1 = s1.widthRel * minD;
  const w2 = s2.widthRel * minD;
  const pad = Math.max(w1, w2) / 2 + 6;

  const segTouch = (a, b, c, d, p) => {
    const d1 = pointToSegmentDist(a.x, a.y, c.x, c.y, d.x, d.y);
    const d2 = pointToSegmentDist(b.x, b.y, c.x, c.y, d.x, d.y);
    const d3 = pointToSegmentDist(c.x, c.y, a.x, a.y, b.x, b.y);
    const d4 = pointToSegmentDist(d.x, d.y, a.x, a.y, b.x, b.y);
    return Math.min(d1, d2, d3, d4) <= p;
  };

  for (let i = 0; i < pts1.length - 1; i++) {
    for (let j = 0; j < pts2.length - 1; j++) {
      if (segTouch(pts1[i], pts1[i + 1], pts2[j], pts2[j + 1], pad)) return true;
    }
  }
  return false;
}

function applyNeedleShrinking(model, needle, w, h) {
  // needle segment endpoints
  const a = denormalizePoint(needle.start.x, needle.start.y, w, h);
  const b = denormalizePoint(needle.end.x, needle.end.y, w, h);

  // Strokes touched by the needle line
  const touched = lineTouchesKnife(model, a, b, w, h, 0);
  if (!touched.size) return;

  // Also strokes touching those touched
  const allKnives = model.strokes.filter((s) => s.type === "knife" && !s.deleted);
  const toScale = new Set(touched);
  for (const k of allKnives) {
    if (toScale.has(k)) continue;
    for (const t of touched) {
      if (strokesTouch(model, k, t, w, h)) {
        toScale.add(k);
        break;
      }
    }
  }

  // Slightly smaller as a shape = shrink widthRel multiplicatively
  for (const s of toScale) {
    s.widthRel *= 0.86;
  }
}

function spawnEmojiEl({ spawnLayer, emoji, clientX, clientY, source, persistentOnKnife }) {
  const el = document.createElement("div");
  el.className = "spawnEmoji";
  el.textContent = emoji;
  el.dataset.source = source; // "basic" | "special" | "one"
  el.dataset.persistOnKnife = persistentOnKnife ? "1" : "0";
  el.style.left = `${clientX}px`;
  el.style.top = `${clientY}px`;
  spawnLayer.appendChild(el);
  return el;
}

export function initSurgeryRoom({
  menuEl,
  canvas,
  spawnLayer,
  trayEl,
  statusTextEl,
  toolRowEl,
  skinTonePickerEl,
  resetBtnEl,
}) {
  const ctx = canvas.getContext("2d", { alpha: true });

  const stage = canvas.parentElement;
  const canvasWrap = stage; // canvasWrap is the relative container in HTML
  const model = {
    strokes: [],
    // when resizing, we re-render from normalized points + widthRel
  };

  let activeTool = "🔪";
  let isDrawing = false;
  let currentStroke = null;
  let needlePreview = null;

  // 🥢 / 🥢🫀 spawn chooser modal
  const spawnChoiceModalEl = document.getElementById("spawnChoiceModal");
  const spawnChoiceEmojiRowEl = document.getElementById("spawnChoiceEmojiRow");
  const btnCancelSpawnChoiceEl = document.getElementById("btnCancelSpawnChoice");

  let spawnMenuOpen = false;
  let pendingSpawn = null; // { metaKind, clientX, clientY }

  let w = 300, h = 300, dpr = 1, minD = 1;

  function setStatus(txt) {
    statusTextEl.textContent = txt;
  }

  function resetSurgery() {
    // Stop drawing in progress
    isDrawing = false;
    currentStroke = null;
    needlePreview = null;

    // Clear all drawn strokes
    model.strokes = [];

    // Remove all spawned draggable/emoji elements
    while (spawnLayer.firstChild) spawnLayer.removeChild(spawnLayer.firstChild);

    renderAll();
    setStatus(`Tool: ${activeTool}`);
  }

  function resize() {
    const rect = canvasWrap.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    minD = minDim(w, h);

    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderAll();
  }

  function renderAll() {
    render(ctx, model, w, h);

    // Draw needle preview if needed
    if (needlePreview) {
      const { a, b, widthRel } = needlePreview;
      const aw = a ? denormalizePoint(a.x, a.y, w, h) : null;
      const bw = b ? denormalizePoint(b.x, b.y, w, h) : null;
      if (aw && bw) {
        ctx.save();
        ctx.strokeStyle = COLORS.needle;
        ctx.lineWidth = widthRel * minDim(w, h);
        ctx.setLineDash([10, 6]);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(aw.x, aw.y);
        ctx.lineTo(bw.x, bw.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Modal helpers (🥢 / 🥢🫀)
  function closeSpawnMenu() {
    spawnMenuOpen = false;
    pendingSpawn = null;
    spawnChoiceModalEl?.classList.add("hidden");
    setStatus(`Tool: ${activeTool}`);
  }

  function openSpawnMenuFor(kind, clientX, clientY) {
    if (!spawnChoiceModalEl || !spawnChoiceEmojiRowEl) return;

    const list = kind === "spawnBasic" ? BASIC_SPAWN_EMOJIS : SPECIAL_SPAWN_EMOJIS;
    const source = kind === "spawnBasic" ? "basic" : "special";
    const persistentOnKnife = kind === "spawnSpecial";

    spawnMenuOpen = true;
    pendingSpawn = { metaKind: kind, clientX, clientY };

    // Clear and rebuild choices
    spawnChoiceEmojiRowEl.innerHTML = "";

    // Random option
    const randomBtn = document.createElement("button");
    randomBtn.type = "button";
    randomBtn.className = "spawnChoiceEmojiPick";
    randomBtn.textContent = "🎲";
    randomBtn.setAttribute("aria-label", "Random spawn");
    randomBtn.addEventListener("click", () => {
      const emoji = list[Math.floor(Math.random() * list.length)];
      const cx = pendingSpawn?.clientX ?? clientX;
      const cy = pendingSpawn?.clientY ?? clientY;

      // Spawn draggable chosen emoji
      const el = spawnEmojiEl({
        spawnLayer,
        emoji,
        clientX: cx,
        clientY: cy,
        source,
        persistentOnKnife,
      });

      makeDraggableEmoji({
        el,
        onDrop: () => {
          const cx2 = parseFloat(el.style.left);
          const cy2 = parseFloat(el.style.top);

          const droppedOnTray = isClientInsideEl(cx2, cy2, trayEl);
          if (droppedOnTray) {
            if (el.dataset.source === "basic" || el.dataset.source === "special") el.remove();
            return;
          }

          const local = getLocalFromClient(cx2, cy2);
          const overKnife = pointHitsKnife(model, local.x, local.y, w, h);
          if (!overKnife) return;

          // basic items disappear on knife; special items persist on knife
          if (el.dataset.source === "basic" && el.dataset.persistOnKnife !== "1") el.remove();
        },
      });

      closeSpawnMenu();
    });
    spawnChoiceEmojiRowEl.appendChild(randomBtn);

    // Fixed options
    for (const emoji of list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "spawnChoiceEmojiPick";
      btn.textContent = emoji;
      btn.setAttribute("aria-label", `Spawn ${emoji}`);
      btn.addEventListener("click", () => {
        const cx = pendingSpawn?.clientX ?? clientX;
        const cy = pendingSpawn?.clientY ?? clientY;

        const el = spawnEmojiEl({
          spawnLayer,
          emoji,
          clientX: cx,
          clientY: cy,
          source,
          persistentOnKnife,
        });

        makeDraggableEmoji({
          el,
          onDrop: () => {
            const cx2 = parseFloat(el.style.left);
            const cy2 = parseFloat(el.style.top);

            const droppedOnTray = isClientInsideEl(cx2, cy2, trayEl);
            if (droppedOnTray) {
              if (el.dataset.source === "basic" || el.dataset.source === "special") el.remove();
              return;
            }

            const local = getLocalFromClient(cx2, cy2);
            const overKnife = pointHitsKnife(model, local.x, local.y, w, h);
            if (!overKnife) return;

            if (el.dataset.source === "basic" && el.dataset.persistOnKnife !== "1") el.remove();
          },
        });

        closeSpawnMenu();
      });
      spawnChoiceEmojiRowEl.appendChild(btn);
    }

    spawnChoiceModalEl?.classList.remove("hidden");
    setStatus("Choose spawn");
  }

  btnCancelSpawnChoiceEl?.addEventListener("click", () => closeSpawnMenu());

  // Skin tone
  const toneButtons = Array.from(skinTonePickerEl.querySelectorAll("[data-tone]"));
  function setSkinTone(key) {
    const tone = SKIN_TONES[key] || SKIN_TONES.peach;
    canvasWrap.style.background = tone.bg;
    renderAll();
  }
  for (const b of toneButtons) {
    b.addEventListener("click", () => {
      for (const bb of toneButtons) bb.dataset.active = "0";
      b.dataset.active = "1";
      setSkinTone(b.getAttribute("data-tone"));
    });
  }
  // Default
  if (toneButtons[1]) {
    for (const bb of toneButtons) bb.dataset.active = "0";
    toneButtons[1].dataset.active = "1";
  }
  setSkinTone("peach");

  // Reset button
  resetBtnEl?.addEventListener("click", () => resetSurgery());

  // Tool selection
  const toolButtons = Array.from(toolRowEl.querySelectorAll("[data-tool]"));
  function setActiveTool(tool) {
    activeTool = tool;
    for (const b of toolButtons) b.dataset.active = b.getAttribute("data-tool") === tool ? "1" : "0";
    setStatus(`Tool: ${tool}`);
  }
  toolButtons.forEach((b) => {
    b.addEventListener("click", () => setActiveTool(b.getAttribute("data-tool")));
  });
  if (toolButtons[0]) setActiveTool(toolButtons[0].getAttribute("data-tool"));

  // Tray bounds (updated during interactions)
  function isClientInsideEl(clientX, clientY, el) {
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  function getLocalFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function localToNorm(x, y) {
    return normalizePoint(x, y, w, h);
  }

  function addPointsToStroke(stroke, normPoint) {
    const pts = stroke.points;
    if (pts.length === 0) {
      pts.push(normPoint);
      return;
    }
    const last = pts[pts.length - 1];
    const dx = normPoint.x - last.x;
    const dy = normPoint.y - last.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.0035) return; // subsample
    pts.push(normPoint);
  }

  function applyCleaner() {
    // 🧽: turns 🔪 strokes into very light red, removes 🧴 strokes, does not draw
    for (const s of model.strokes) {
      if (s.type === "knife") s.lightened = true;
      if (s.type === "syringe") s.deleted = true;
    }
    // compact
    model.strokes = model.strokes.filter((s) => !s.deleted);
    renderAll();
  }

  function pointerDown(e) {
    if (spawnMenuOpen) return;

    // Avoid drawing while interacting with spawned emojis
    const target = e.target;
    if (target && target.closest && target.closest(".spawnEmoji")) return;

    const tool = activeTool;
    const meta = getToolMeta(tool);

    const { x, y } = getLocalFromClient(e.clientX, e.clientY);
    const n = localToNorm(x, y);

    if (meta.kind === "cleaner") {
      applyCleaner();
      setStatus("🧽 cleaned");
      return;
    }

    if (meta.kind === "knife" || meta.kind === "syringe" || meta.kind === "bandage") {
      isDrawing = true;
      const kind = meta.kind;
      const widthRel = strokeSizeRel(kind, minD);

      currentStroke = {
        type: kind === "knife" ? "knife" : kind === "syringe" ? "syringe" : "bandage",
        points: [],
        widthRel,
        lightened: false,
      };
      addPointsToStroke(currentStroke, n);
      model.strokes.push(currentStroke);
      setStatus(`Drawing ${tool}`);
      return;
    }

    if (meta.kind === "needle") {
      isDrawing = true;
      currentStroke = {
        type: "needleLine",
        start: n,
        end: n,
        widthRel: strokeSizeRel("needle", minD),
      };
      model.strokes.push(currentStroke);
      needlePreview = { a: n, b: n, widthRel: currentStroke.widthRel };
      setStatus("🪡 stitch");
      return;
    }

    if (meta.kind === "spawnBasic" || meta.kind === "spawnSpecial") {
      // spawn only if used on 🔪 strokes
      const hit = pointHitsKnife(model, x, y, w, h);
      if (!hit) return;

      // Open chooser instead of auto-spawning a random emoji
      openSpawnMenuFor(meta.kind, e.clientX, e.clientY);
      return;
    }

    if (meta.kind === "spawnOne") {
      const emoji = meta.emoji;
      // Spawn draggable, disappears if dropped on 🔪 strokes
      const el = spawnEmojiEl({
        spawnLayer,
        emoji,
        clientX: e.clientX,
        clientY: e.clientY,
        source: "one",
        persistentOnKnife: false,
      });

      makeDraggableEmoji({
        el,
        onDrop: () => {
          const cx = parseFloat(el.style.left);
          const cy = parseFloat(el.style.top);

          // Only disappears on knife strokes (tray rule applies only to 🥢 and 🥢🫀 items)
          const local = getLocalFromClient(cx, cy);
          const overKnife = pointHitsKnife(model, local.x, local.y, w, h);
          if (overKnife) el.remove();
        },
      });
      return;
    }
  }

  function pointerMove(e) {
    if (!isDrawing) return;
    if (!currentStroke) return;

    const tool = activeTool;
    const meta = getToolMeta(tool);

    if (meta.kind === "knife" || meta.kind === "syringe" || meta.kind === "bandage") {
      const { x, y } = getLocalFromClient(e.clientX, e.clientY);
      const n = localToNorm(x, y);
      addPointsToStroke(currentStroke, n);
      renderAll();
      return;
    }

    if (meta.kind === "needle") {
      const { x, y } = getLocalFromClient(e.clientX, e.clientY);
      const n = localToNorm(x, y);
      currentStroke.end = n;
      needlePreview = { a: currentStroke.start, b: currentStroke.end, widthRel: currentStroke.widthRel };
      renderAll();
      return;
    }
  }

  function pointerUp() {
    if (!isDrawing) return;
    isDrawing = false;

    const tool = activeTool;
    const meta = getToolMeta(tool);

    if (meta.kind === "needle" && currentStroke) {
      // Finalize needle: shrink affected knife strokes
      applyNeedleShrinking(model, currentStroke, w, h);
    }

    currentStroke = null;
    needlePreview = null;
    renderAll();
    setStatus(`Tool: ${activeTool}`);
  }

  canvas.addEventListener("pointerdown", pointerDown, { passive: false });
  canvas.addEventListener("pointermove", pointerMove, { passive: false });
  window.addEventListener("pointerup", pointerUp, { passive: false });
  window.addEventListener("pointercancel", pointerUp, { passive: false });

  // Re-render and resize
  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvasWrap);

  // Improve mobile: when menu shown, re-render
  const mo = new MutationObserver(() => {
    if (!menuEl.classList.contains("hidden")) renderAll();
  });
  mo.observe(menuEl, { attributes: true, attributeFilter: ["class"] });
}