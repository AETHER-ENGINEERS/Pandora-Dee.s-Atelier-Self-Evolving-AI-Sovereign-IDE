import { clamp } from "./utils.js";

function getPointerPos(e, containerEl = null) {
  if (e.touches && e.touches.length) {
    const t = e.touches[0];
    if (containerEl) {
      const r = containerEl.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top, clientX: t.clientX, clientY: t.clientY };
    }
    return { x: t.clientX, y: t.clientY, clientX: t.clientX, clientY: t.clientY };
  }
  if (containerEl) {
    const r = containerEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, clientX: e.clientX, clientY: e.clientY };
  }
  return { x: e.clientX, y: e.clientY, clientX: e.clientX, clientY: e.clientY };
}

export function initToolDragToPatient({
  toolRowEl,
  ghostEl,
  patientEl,
  onDropTool,
}) {
  const tools = Array.from(toolRowEl.querySelectorAll("[data-tool]"));
  let active = null;

  function showGhost(tool, clientX, clientY) {
    ghostEl.textContent = tool;
    ghostEl.style.left = `${clientX}px`;
    ghostEl.style.top = `${clientY}px`;
    ghostEl.style.display = "flex";
  }
  function hideGhost() {
    ghostEl.style.display = "none";
  }

  function pointInEl(clientX, clientY, el) {
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  tools.forEach((toolEl) => {
    toolEl.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();

      const tool = toolEl.getAttribute("data-tool") || "";
      if (!tool) return;

      toolEl.setPointerCapture?.(e.pointerId);
      active = { tool, pointerId: e.pointerId };

      showGhost(tool, e.clientX, e.clientY);

      const onMove = (ev) => {
        if (!active || ev.pointerId !== active.pointerId) return;
        ev.preventDefault();
        ghostEl.style.left = `${ev.clientX}px`;
        ghostEl.style.top = `${ev.clientY}px`;
      };

      const onUp = (ev) => {
        if (!active || ev.pointerId !== active.pointerId) return;
        ev.preventDefault();

        const ok = pointInEl(ev.clientX, ev.clientY, patientEl);
        hideGhost();

        if (ok) onDropTool(active.tool);

        document.removeEventListener("pointermove", onMove, { capture: true });
        document.removeEventListener("pointerup", onUp, { capture: true });
        active = null;
      };

      document.addEventListener("pointermove", onMove, { capture: true });
      document.addEventListener("pointerup", onUp, { capture: true });
    });
  });
}

export function makeDraggableEmoji({
  el,
  onDrop,
  constrainTo = null, // {left, top, right, bottom} in client coords (optional)
}) {
  let dragging = false;
  let pointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  const getClientFromEl = () => {
    // el is positioned via left/top in CSS for surgery items
    const left = parseFloat(el.style.left || "0");
    const top = parseFloat(el.style.top || "0");
    return { left, top };
  };

  const start = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    pointerId = e.pointerId;

    el.setPointerCapture?.(e.pointerId);

    const rect = el.getBoundingClientRect();
    offsetX = e.clientX - rect.left - rect.width / 2;
    offsetY = e.clientY - rect.top - rect.height / 2;

    el.dataset.ghost = "1";
    e.preventDefault();

    const move = (ev) => {
      if (!dragging || ev.pointerId !== pointerId) return;
      ev.preventDefault();

      let x = ev.clientX - offsetX;
      let y = ev.clientY - offsetY;

      if (constrainTo) {
        x = clamp(x, constrainTo.left, constrainTo.right);
        y = clamp(y, constrainTo.top, constrainTo.bottom);
      }

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };

    const up = (ev) => {
      if (!dragging || ev.pointerId !== pointerId) return;
      ev.preventDefault();

      dragging = false;
      el.dataset.ghost = "0";

      document.removeEventListener("pointermove", move, { capture: true });
      document.removeEventListener("pointerup", up, { capture: true });

      onDrop?.(ev);
    };

    document.addEventListener("pointermove", move, { capture: true });
    document.addEventListener("pointerup", up, { capture: true });
  };

  el.addEventListener("pointerdown", start, { passive: false });
}