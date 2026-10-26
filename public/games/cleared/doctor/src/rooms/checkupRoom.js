import { initToolDragToPatient } from "../drag.js";

const toolToPatient = {
  "🩹": () => "🤕",
  "💊": () => "🙂",
  "💉": () => "🙂",
  "🌡": () => "🤒",
  "🩻": () => "🦴",
  "🩺": () => "🫀",
  "🧊": (current) => (current === "🥵" ? "🙂" : "🥶"),
  "🔥": (current) => (current === "🥶" ? "🙂" : "🥵"),
};

export function initCheckupRoom({ menuEl, patientEmojiEl, patientPickerEl, toolRowEl }) {
  const ghostEl = document.getElementById("floatingGhost");
  let currentPatient = "🙂";

  // Patient picker
  const buttons = Array.from(patientPickerEl.querySelectorAll("[data-patient]"));
  for (const b of buttons) {
    b.addEventListener("click", () => {
      currentPatient = b.getAttribute("data-patient") || "🙂";
      patientEmojiEl.textContent = currentPatient;
      for (const bb of buttons) bb.dataset.active = bb === b ? "1" : "0";
    });
  }
  // Default active
  const defaultBtn = buttons.find((b) => b.getAttribute("data-patient") === "🙂");
  if (defaultBtn) {
    for (const b of buttons) b.dataset.active = "0";
    defaultBtn.dataset.active = "1";
  }
  patientEmojiEl.textContent = currentPatient;

  // Tool drag
  initToolDragToPatient({
    toolRowEl,
    ghostEl,
    patientEl: patientEmojiEl,
    onDropTool: (tool) => {
      const fn = toolToPatient[tool];
      if (!fn) return;

      const next = typeof fn === "function" ? fn(currentPatient) : "🙂";
      currentPatient = next;
      patientEmojiEl.textContent = currentPatient;
    },
  });
}