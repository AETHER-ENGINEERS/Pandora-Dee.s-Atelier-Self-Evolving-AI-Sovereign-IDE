const petEl = document.getElementById("pet");
const handEl = document.getElementById("hand");
const openSettings = document.getElementById("open-settings");
const settingsEl = document.getElementById("settings");
const settingsClose = document.getElementById("settings-close");

const petEmojiInput = document.getElementById("pet-emoji");
const activeEmojiInput = document.getElementById("pet-active-emoji");
const handEmojiInput = document.getElementById("hand-emoji");
const handActiveEmojiInput = document.getElementById("hand-active-emoji");
const handToggle = document.getElementById("hand-toggle");
const handSizeSelect = document.getElementById("hand-size");

const openMouthEmojiInput = document.getElementById("open-mouth-emoji");
const eatingEmojiInput = document.getElementById("eating-emoji");
const eatingDurationInput = document.getElementById("eating-duration");
const foodsInput = document.getElementById("foods");
const foodBar = document.getElementById("food-bar");

let petEmoji = "🐈";
let activeEmoji = "";
let handEmoji = "🤚";
let handActiveEmoji = "";
let showHand = true;
let handScale = 1;

let openMouthEmoji = "";
let eatingEmoji = "";
let eatDuration = 750;

let draggedFood = null;
let eating = false;
let eatTimer = null;

const HAND_SIZES = {
  "super small": 0.5,
  "small": 0.66,
  "somewhat small": 0.83,
  "default": 1,
  "medium": 1.15,
  "somewhat large": 1.3,
  "large": 1.5,
  "super large": 1.75,
  "bigger than emoji being pet": 2.6,
  "way bigger than emoji being pet": 3.6,
};

const PET_HALF = 70;
const HAND_HALF = 32;
const THRESHOLD = PET_HALF + HAND_HALF + 8;

let pointer = null;
let touching = false;

function updatePetEmoji() {
  let display;
  if (eating && eatingEmoji) display = eatingEmoji;
  else if (draggedFood && openMouthEmoji) display = openMouthEmoji;
  else if (touching && activeEmoji) display = activeEmoji;
  else display = petEmoji;
  petEl.textContent = display;
}

function setTouching(next) {
  if (next === touching) return;
  touching = next;
  updatePetEmoji();
  handEl.textContent = touching && handActiveEmoji ? handActiveEmoji : handEmoji;
  if (next) {
    petEl.classList.add("squishing");
    petEl.classList.remove("squished");
  } else {
    petEl.classList.remove("squishing");
    petEl.classList.add("squished");
    applyPetTransform(0, 0, 1, 1);
  }
}

function applyPetTransform(ox, oy, sx, sy) {
  petEl.style.transform =
    `translate(-50%, -50%) translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
}

function moveHand(x, y) {
  handEl.style.left = x + "px";
  handEl.style.top = y + "px";
}

function updatePointer(x, y) {
  pointer = { x, y };
  moveHand(x, y);

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);

  if (dist < THRESHOLD) {
    const strength = Math.min(1, (THRESHOLD - dist) / (THRESHOLD * 0.6));
    const dxw = dist === 0 ? 0 : dx / dist;
    const dyw = dist === 0 ? 0 : dy / dist;

    const k = 0.5 * strength;
    const j = 0.35 * strength;
    const sx = 1 - k * Math.abs(dxw) + j * Math.abs(dyw);
    const sy = 1 - k * Math.abs(dyw) + j * Math.abs(dxw);
    const lean = 14 * strength;

    applyPetTransform(dxw * lean, dyw * lean, sx, sy);
    handEl.style.fontSize = (52 * handScale).toFixed(2) + "px";
    setTouching(true);
  } else {
    handEl.style.fontSize = (64 * handScale).toFixed(2) + "px";
    setTouching(false);
  }
}

function ignoreInput(e) {
  e.preventDefault();
  return false;
}

function dropFood(clientX, clientY) {
  if (!draggedFood) return;
  const food = draggedFood;
  draggedFood = null;
  food.classList.remove("dragging");
  if (isOnPet(clientX, clientY)) {
    food.remove();
    startEating();
  }
  updatePetEmoji();
}

window.addEventListener("pointermove", (e) => {
  if (draggedFood) {
    setElementPos(draggedFood, e.clientX, e.clientY);
  }
  updatePointer(e.clientX, e.clientY);
});

window.addEventListener("pointerup", (e) => dropFood(e.clientX, e.clientY));
window.addEventListener("pointercancel", (e) => dropFood(e.clientX, e.clientY));

function setElementPos(el, x, y) {
  el.style.left = x + "px";
  el.style.top = y + "px";
}

function startDrag(f, clientX, clientY, pointerId) {
  draggedFood = f;
  f.classList.add("dragging");
  setElementPos(f, clientX, clientY);
  if (f.setPointerCapture && pointerId != null) {
    try { f.setPointerCapture(pointerId); } catch (_) {}
  }
  updatePetEmoji();
}

document.addEventListener("contextmenu", ignoreInput);

function parseFoods() {
  return foodsInput.value.split(",").map((s) => s.trim()).filter(Boolean);
}

function spawnFood(emoji, x, y) {
  const f = document.createElement("div");
  f.className = "food";
  f.textContent = emoji;
  f.style.left = x + "px";
  f.style.top = y + "px";
  f.addEventListener("pointerdown", (e) => {
    startDrag(f, e.clientX, e.clientY, e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });
  document.body.appendChild(f);
  return f;
}

function isOnPet(x, y) {
  const r = petEl.getBoundingClientRect();
  const pad = 30;
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

function startEating() {
  if (eatTimer) clearTimeout(eatTimer);
  eating = true;
  petEl.classList.add("eating");
  updatePetEmoji();
  eatTimer = setTimeout(() => {
    eating = false;
    petEl.classList.remove("eating");
    eatTimer = null;
    updatePetEmoji();
  }, eatDuration);
}

function rebuildFoodBar() {
  foodBar.innerHTML = "";
  const foods = parseFoods();
  foods.forEach((food) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "food-spawner";
    b.textContent = food;
    b.addEventListener("pointerdown", (e) => {
      const x = e.clientX != null ? e.clientX : e.currentTarget.getBoundingClientRect().left + e.currentTarget.getBoundingClientRect().width / 2;
      const y = e.clientY != null ? e.clientY : Math.max(0, e.currentTarget.getBoundingClientRect().top - 70);
      const f = spawnFood(food, x, y);
      startDrag(f, x, y, e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    foodBar.appendChild(b);
  });
  foodBar.hidden = foods.length === 0;
}

let handActiveTouched = false;

function openPanel() {
  petEmojiInput.value = petEmoji;
  activeEmojiInput.value = activeEmoji;
  handEmojiInput.value = handEmoji;
  handActiveEmojiInput.value = handActiveEmoji;
  handActiveTouched = false;
  handSizeSelect.value = Object.entries(HAND_SIZES)
    .find(([, scale]) => scale === handScale)?.[0] || "default";
  handToggle.checked = showHand;
  openMouthEmojiInput.value = openMouthEmoji;
  eatingEmojiInput.value = eatingEmoji;
  eatingDurationInput.value = eatDuration;
  foodsInput.value = foodsInput.value;
  settingsEl.hidden = false;
}

function closePanel() {
  petEmoji = petEmojiInput.value.trim() || petEmoji;
  activeEmoji = activeEmojiInput.value.trim() || "";
  handEmoji = handEmojiInput.value.trim() || handEmoji;
  handActiveEmoji = handActiveTouched
    ? handActiveEmojiInput.value.trim()
    : handActiveEmoji;
  handScale = HAND_SIZES[handSizeSelect.value] ?? 1;
  showHand = handToggle.checked;
  openMouthEmoji = openMouthEmojiInput.value.trim() || "";
  eatingEmoji = eatingEmojiInput.value.trim() || "";
  const dur = parseInt(eatingDurationInput.value, 10);
  if (!isNaN(dur) && dur >= 100) eatDuration = dur;
  handEl.textContent = touching && handActiveEmoji ? handActiveEmoji : handEmoji;
  handEl.hidden = !showHand;
  rebuildFoodBar();
  updatePetEmoji();
  settingsEl.hidden = true;
}

openSettings.addEventListener("click", (e) => {
  e.preventDefault();
  openPanel();
});

settingsClose.addEventListener("click", closePanel);

handActiveEmojiInput.addEventListener("input", () => {
  handActiveTouched = true;
});

settingsEl.addEventListener("click", (e) => {
  if (e.target === settingsEl) closePanel();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePanel();
});

handEl.textContent = handEmoji;
updatePetEmoji();
rebuildFoodBar();