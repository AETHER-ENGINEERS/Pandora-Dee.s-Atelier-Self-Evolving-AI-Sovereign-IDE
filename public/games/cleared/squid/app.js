const sea = document.querySelector(".sea");
const squidButton = document.querySelector(".squid-button");
const bubbleLayer = document.querySelector(".bubbles");
const petDurationInput = document.querySelector(".pet-duration");
const durationValue = document.querySelector(".duration-value");
const foodGhost = document.querySelector(".food-ghost");
const foodButtons = document.querySelectorAll(".food");
let excitedTimer;
let petTimer;
let activePointer = null;
let foodDrag = null;

petDurationInput.addEventListener("input", () => {
  durationValue.value = `${Number(petDurationInput.value).toFixed(2).replace(/0$/, "").replace(/\.$/, "")}s`;
});

function makeBubbles() {
  const box = squidButton.getBoundingClientRect();
  const originX = box.left + box.width * 0.64;
  const originY = box.top + box.height * 0.53;

  for (let i = 0; i < 9; i += 1) {
    const bubble = document.createElement("span");
    const size = 5 + Math.random() * 11;
    bubble.className = "bubble";
    bubble.style.left = `${originX + (Math.random() - 0.5) * 95}px`;
    bubble.style.top = `${originY + (Math.random() - 0.5) * 35}px`;
    bubble.style.bottom = "auto";
    bubble.style.setProperty("--size", `${size}px`);
    bubble.style.setProperty("--duration", `${2.2 + Math.random() * 1.8}s`);
    bubble.style.setProperty("--drift", `${(Math.random() - 0.5) * 110}px`);
    bubbleLayer.append(bubble);
    bubble.addEventListener("animationend", () => bubble.remove(), { once: true });
  }
}

squidButton.addEventListener("click", () => {
  sea.classList.remove("is-excited");
  void sea.offsetWidth;
  sea.classList.add("is-excited");
  makeBubbles();
  window.clearTimeout(excitedTimer);
  excitedTimer = window.setTimeout(() => sea.classList.remove("is-excited"), 700);
});

squidButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || activePointer !== null) return;
  activePointer = event.pointerId;
  squidButton.setPointerCapture(event.pointerId);
  const holdDuration = Number(petDurationInput.value) * 1000;
  if (holdDuration === 0) {
    squidButton.classList.add("is-petted");
  } else {
    petTimer = window.setTimeout(() => {
      if (activePointer === event.pointerId) squidButton.classList.add("is-petted");
    }, holdDuration);
  }
});

function stopPetting(event) {
  if (activePointer === null || event.pointerId !== activePointer) return;
  activePointer = null;
  window.clearTimeout(petTimer);
  squidButton.classList.remove("is-petted");
}

squidButton.addEventListener("pointerup", stopPetting);
squidButton.addEventListener("pointercancel", stopPetting);
squidButton.addEventListener("lostpointercapture", stopPetting);

function moveFoodGhost(event) {
  foodGhost.style.left = `${event.clientX}px`;
  foodGhost.style.top = `${event.clientY}px`;
}

function isAtSquidMouth(x, y) {
  const rect = squidButton.getBoundingClientRect();
  const mouthX = rect.left + rect.width * 0.5;
  const mouthY = rect.top + rect.height * 0.49;
  const radiusX = Math.max(42, rect.width * 0.18);
  const radiusY = Math.max(38, rect.height * 0.12);
  return ((x - mouthX) / radiusX) ** 2 + ((y - mouthY) / radiusY) ** 2 <= 1;
}

function finishFoodDrag(event, canFeed) {
  if (!foodDrag || event.pointerId !== foodDrag.pointerId) return;

  const fed = canFeed && isAtSquidMouth(event.clientX, event.clientY);
  foodDrag.source.classList.remove("is-dragging");
  foodGhost.classList.remove("is-visible");
  sea.classList.remove("is-feeding");
  foodDrag = null;

  if (fed) {
    sea.classList.remove("is-excited");
    void sea.offsetWidth;
    sea.classList.add("is-excited");
    makeBubbles();
    window.clearTimeout(excitedTimer);
    excitedTimer = window.setTimeout(() => sea.classList.remove("is-excited"), 700);
  }
}

for (const foodButton of foodButtons) {
  foodButton.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || foodDrag) return;
    event.preventDefault();
    foodDrag = {
      pointerId: event.pointerId,
      source: foodButton,
    };
    foodButton.classList.add("is-dragging");
    foodButton.setPointerCapture(event.pointerId);
    foodGhost.textContent = foodButton.textContent;
    foodGhost.classList.add("is-visible");
    sea.classList.add("is-feeding");
    moveFoodGhost(event);
  });

  foodButton.addEventListener("pointermove", (event) => {
    if (foodDrag?.pointerId === event.pointerId) moveFoodGhost(event);
  });

  foodButton.addEventListener("pointerup", (event) => finishFoodDrag(event, true));
  foodButton.addEventListener("pointercancel", (event) => finishFoodDrag(event, false));
  foodButton.addEventListener("lostpointercapture", (event) => finishFoodDrag(event, false));
}
