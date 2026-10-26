const defaultEmojiInput = document.getElementById("default-emoji");
const openEmojiInput = document.getElementById("open-emoji");
const chewEmojiInput = document.getElementById("chew-emoji");
const durationInput = document.getElementById("duration");
const durationUnit = document.getElementById("duration-unit");

const eaterEl = document.getElementById("eater");
const eaterWrap = document.querySelector(".eater-wrap");
const droppedZone = document.getElementById("dropped-zone");
const foodForm = document.getElementById("food-form");
const foodInput = document.getElementById("food-input");
const foodTpl = document.getElementById("food-tpl");

let dragging = null;
let dragGhost = null;

function chewMs() {
  const value = Number(durationInput.value) || 0;
  const unit = durationUnit.value;
  return unit === "s" ? value * 1000 : value;
}

function setEater(text, kind) {
  eaterEl.classList.remove("open", "chew", "near");
  if (kind) eaterEl.classList.add(kind);
  eaterEl.textContent = text;
}

function eat(foodEl, ghostRect) {
  const food = Array.from(droppedZone.children).includes(foodEl) ? foodEl : null;
  let fromAppear = false;

  if (ghostRect) {
    const wrap = eaterWrap.getBoundingClientRect();
    const overlap =
      ghostRect.left < wrap.right &&
      ghostRect.right > wrap.left &&
      ghostRect.top < wrap.bottom &&
      ghostRect.bottom > wrap.top;
    if (!overlap) return false;
  } else {
    fromAppear = true;
  }

  const ms = chewMs();
  setEater(chewEmojiInput.value || "😋", "chew");
  if (food) {
    food.style.animation = `swallow 0.3s ease forwards`;
    setTimeout(() => food.remove(), 300);
  } else if (fromAppear) {
    // nothing durable to remove
  }

  const reset = () => {
    if (dragging) return;
    setEater(defaultEmojiInput.value || "😐");
  };
  if (ms > 0) setTimeout(reset, ms);
  else reset();

  return true;
}

function showDefault() {
  if (dragging) return;
  setEater(defaultEmojiInput.value || "😐");
}

function spawnFood(value) {
  const frag = foodTpl.content.cloneNode(true);
  const food = frag.querySelector(".food");
  food.textContent = value;
  food.addEventListener("pointerdown", (e) => startDrag(e, food));
  droppedZone.appendChild(food);
  return food;
}

function startDrag(e, food) {
  if (dragging) return;
  e.preventDefault();
  dragging = { food };
  food.classList.add("dragging");

  dragGhost = document.createElement("span");
  dragGhost.className = "food";
  dragGhost.textContent = food.textContent;
  dragGhost.style.position = "fixed";
  dragGhost.style.zIndex = "1000";
  dragGhost.style.pointerEvents = "none";
  dragGhost.style.cursor = "grabbing";
  dragGhost.style.transform = "scale(1.05)";
  dragGhost.style.margin = "0";
  document.body.appendChild(dragGhost);

  setEater(openEmojiInput.value || "😮", "open");
  placeGhost(e.clientX, e.clientY);
}

function placeGhost(x, y) {
  if (!dragGhost) return;
  dragGhost.style.left = `${x - 32}px`;
  dragGhost.style.top = `${y - 32}px`;

  const wrap = eaterWrap.getBoundingClientRect();
  const inWrap =
    x > wrap.left && x < wrap.right && y > wrap.top && y < wrap.bottom;
  eaterEl.classList.toggle("near", inWrap);
}

function endDrag(e) {
  if (!dragging) return;
  const { food } = dragging;
  const ghostRect = dragGhost.getBoundingClientRect();

  const fed = eat(food, ghostRect);

  if (dragGhost) {
    dragGhost.remove();
    dragGhost = null;
  }
  food.classList.remove("dragging");
  dragging = null;
  eaterEl.classList.remove("near");
  if (!fed) showDefault();
}

window.addEventListener("pointermove", (e) => {
  if (dragging) {
    e.preventDefault();
    placeGhost(e.clientX, e.clientY);
  }
});

window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

foodForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = foodInput.value.trim();
  if (!value) return;
  spawnFood(value);
  foodInput.value = "";
  foodInput.focus();
});

[defaultEmojiInput, openEmojiInput, chewEmojiInput].forEach((el) => {
  el.addEventListener("input", () => {
    if (!dragging) setEater(defaultEmojiInput.value || "😐");
  });
});

spawnFood("🍎");
spawnFood("🍕");