import { createKitten, addXP, breedParents } from './kitten.js';
import { drawKitten } from './draw.js';
import {
  COLORS,
  COLOR_NAMES,
  PATTERNS,
  SPECIAL_COLORS,
  makeColor,
} from './color.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W = window.innerWidth;
let H = window.innerHeight;
const dpr = Math.min(window.devicePixelRatio || 1, 2);

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// shampoo layer, same size as main canvas (device px)
const shampoo = document.createElement('canvas');
const sctx = shampoo.getContext('2d');
function initShampoo() {
  shampoo.width = canvas.width;
  shampoo.height = canvas.height;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.clearRect(0, 0, W, H);
}
initShampoo();

// ============================ state ============================
const state = {
  screen: 'home', // home | opts | feed | play | bathe | pet | breedPick | customize
  kittens: [],
  active: null,
  coins: 10,
  sandbox: false,
  customColor: 'orange',
  customPattern: 'none',
  toasts: [],
  hearts: [],
  waters: [],
  lastHeart: 0,
  playScore: 0,
  mice: [],
  mouseTimer: 0,
  feedDrag: null,
  feedDone: false,
  batheTool: 0, // 0 🧴 1 🧽 2 🚿
  brushSize: 1, // index into BRUSH_SIZES
};

const FOODS = ['🍖', '🍗', '🥩', '🥓', '🐟'];
const TOOLS = ['🧴', '🧽', '🚿'];
const BRUSH_SIZES = [20, 34, 50];

// ============================ utils ============================
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function inCircle(px, py, x, y, rad) {
  const dx = px - x;
  const dy = py - y;
  return dx * dx + dy * dy <= rad * rad;
}

const emojiCache = new Map();

function emojiImage(text) {
  let img = emojiCache.get(text);
  if (!img) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">` +
      `<text x="60" y="62" font-size="100" text-anchor="middle" dominant-baseline="central">` +
      text +
      `</text></svg>`;
    img = new Image();
    img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    emojiCache.set(text, img);
  }
  return img;
}

function drawEmoji(text, x, y, size) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const half = size / 2;
  ctx.drawImage(emojiImage(text), x - half, y - half, size, size);
}

function emo(text, x, y, size) {
  drawEmoji(text, x, y, size);
}

function drawBtn(g, label, fill, color = '#fff', emoji) {
  ctx.fillStyle = fill;
  roundRect(g.x, g.y, g.w, g.h, g.h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((emoji ? emoji + ' ' : '') + label, g.x + g.w / 2, g.y + g.h / 2);
}

function toast(text, x, y, color = '#fff') {
  state.toasts.push({ text, x, y, age: 0, color });
}

function addToastToKitten(text, k, color = '#fff') {
  toast(text, k.x, k.y - k.size, color);
}

function xpBar(k, x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#ffd75e';
  roundRect(x, y, Math.max(h, w * (k.xp / 100)), h, h / 2);
  ctx.fill();
}

// ============================ pointer ============================
let pointer = { down: false, x: 0, y: 0, downX: 0, downY: 0, moved: false };

function onDown(e) {
  pointer.down = true;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.downX = pointer.x;
  pointer.downY = pointer.y;
  pointer.moved = false;
  canvas.setPointerCapture(e.pointerId);
  screenDown();
}

function onMove(e) {
  const px = e.clientX;
  const py = e.clientY;
  if (pointer.down) {
    if (Math.hypot(px - pointer.downX, py - pointer.downY) > 7) pointer.moved = true;
    pointer.x = px;
    pointer.y = py;
    screenMove();
  } else {
    pointer.x = px;
    pointer.y = py;
  }
}

function onUp(e) {
  const wasMoved = pointer.moved;
  pointer.down = false;
  screenUp();
  if (!wasMoved) screenTap();
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onUp);

// ============================ screens ============================
const adoptBtn = () => ({
  x: W / 2 - 90,
  y: H - 84,
  w: 180,
  h: 56,
});

const homeBar = () => {
  const w = 88;
  const h = 44;
  const gap = 10;
  const total = w * 4 + gap * 3;
  const x0 = W / 2 - total / 2;
  return {
    save: { x: x0, y: 18, w, h },
    load: { x: x0 + w + gap, y: 18, w, h },
    clear: { x: x0 + w * 2 + gap * 2, y: 18, w, h },
    sandbox: { x: x0 + w * 3 + gap * 3, y: 18, w, h },
  };
};

function toggleSandbox() {
  state.sandbox = !state.sandbox;
  try {
    localStorage.setItem('kittenCare.sandbox', state.sandbox ? '1' : '0');
  } catch (e) {/* ignore */ }
  toast(state.sandbox ? '☁️ sandbox on' : 'sandbox off', W / 2, H - 150, '#7ff0ff');
}

function saveCats() {
  const data = state.kittens.map((k) => ({
    colorName: k.colorName,
    color: k.color,
    pattern: k.pattern,
    calico: k.calico,
    level: k.level,
    xp: k.xp,
    x: k.x,
    y: k.y,
  }));
  try {
    localStorage.setItem('kittenCare.save', JSON.stringify(data));
  } catch (e) {
    /* storage unavailable */
  }
  state.active = null;
  toast('saved!', W / 2, H - 150, '#7ef29a');
}

function loadCats(silent) {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem('kittenCare.save'));
  } catch (e) {
    /* ignore */
  }
  if (!Array.isArray(data) || data.length === 0) {
    if (!silent) toast('no save', W / 2, H - 150, '#ff9a8a');
    return;
  }
  state.kittens = data.map((d, i) => {
    const k = createKitten({
      colorName: d.colorName,
      color: d.color,
      pattern: d.pattern,
      x: d.x,
      y: d.y,
    });
    k.level = d.level;
    k.xp = d.xp;
    k.calico = d.calico;
    k.x = Math.max(k.size, Math.min(W - k.size, k.x));
    k.y = Math.max(k.size * 1.4, Math.min(H - 120, k.y));
    return k;
  });
  state.active = null;
  if (!silent) toast('loaded!', W / 2, H - 150, '#7ef29a');
}

function clearCats() {
  state.kittens = [];
  state.active = null;
  toast('cleared', W / 2, H - 150, '#ff9a8a');
}

function saveCoins() {
  try {
    localStorage.setItem('kittenCare.coins', String(state.coins));
  } catch (e) {/* storage unavailable */}
}

function loadCoins() {
  try {
    const c = parseInt(localStorage.getItem('kittenCare.coins'), 10);
    if (!isNaN(c)) state.coins = c;
    state.sandbox = localStorage.getItem('kittenCare.sandbox') === '1';
  } catch (e) {/* ignore */}
}

function isRare(colorName) {
  return SPECIAL_COLORS.includes(colorName);
}

function spawnKitten() {
  const k = createKitten({
    x: W / 2 + (Math.random() * 2 - 1) * 80,
    y: H / 2 + (Math.random() * 2 - 1) * 60,
  });
  k.x = Math.max(k.size, Math.min(W - k.size, k.x));
  k.y = Math.max(k.size * 1.4, Math.min(H - 120, k.y));
  state.kittens.push(k);
  state.active = null;
}

function tryAdopt() {
  if (!state.sandbox && state.coins < 10) {
    toast('need 10🪙', W / 2, H - 150, '#ff9a8a');
    return;
  }
  if (!state.sandbox) {
    state.coins -= 10;
    saveCoins();
  }
  spawnKitten();
}

function sellActive() {
  const k = state.active;
  let value = 10 + (k.level - 1) * 10;
  if (isRare(k.colorName)) value += 100;
  if (!state.sandbox) {
    state.coins += value;
    saveCoins();
    addToastToKitten('+' + value + '🪙', k, '#ffe27a');
  }
  toast('sold!', W / 2, H - 150, '#ff9a8a');
  state.kittens = state.kittens.filter((x) => x !== k);
  state.active = null;
  state.screen = 'home';
}

function openCustomize() {
  if (!state.sandbox && state.coins < 100) {
    toast('need 100🪙', W / 2, H - 150, '#ff9a8a');
    return;
  }
  state.customColor = state.active.colorName;
  state.customPattern = state.active.pattern;
  state.screen = 'customize';
}

function confirmCustom() {
  if (!state.sandbox && state.coins < 100) {
    toast('need 100🪙', W / 2, H - 150, '#ff9a8a');
    return;
  }
  if (!state.sandbox) {
    state.coins -= 100;
    saveCoins();
  }
  const k = createKitten({
    colorName: state.customColor,
    color: makeColor(COLORS[state.customColor]),
    pattern: state.customPattern,
    x: W / 2,
    y: H / 2,
  });
  state.kittens.push(k);
  state.active = k;
  state.screen = 'home';
  toast('custom kitten!', k.x, k.y - k.size, '#7ef29a');
}

function screenDown() {
  const { screen } = state;
  if (screen === 'home') {
    const bar = homeBar();
    if (inRect(pointer.x, pointer.y, bar.save)) { saveCats(); return; }
    if (inRect(pointer.x, pointer.y, bar.load)) { loadCats(); return; }
    if (inRect(pointer.x, pointer.y, bar.clear)) { clearCats(); return; }
    if (inRect(pointer.x, pointer.y, bar.sandbox)) { toggleSandbox(); return; }
    if (inRect(pointer.x, pointer.y, adoptBtn())) {
      tryAdopt();
      return;
    }
    for (const k of state.kittens) {
      if (inCircle(pointer.x, pointer.y, k.x, k.y, k.size * 1.25)) {
        state.active = k;
        break;
      }
    }
  } else if (screen === 'feed') {
    const foods = foodLayout();
    foods.forEach((f, i) => {
      if (inCircle(pointer.x, pointer.y, f.x, f.y, 34)) {
        state.feedDrag = { i, ox: pointer.x - f.x, oy: pointer.y - f.y };
      }
    });
  } else if (screen === 'bathe') {
    const tools = toolLayout();
    tools.forEach((t, i) => {
      if (inCircle(pointer.x, pointer.y, t.x, t.y, 34)) state.batheTool = i;
    });
    const brushes = brushLayout();
    brushes.forEach((b, i) => {
      if (inCircle(pointer.x, pointer.y, b.x, b.y, 38)) state.brushSize = i;
    });
  }
}

function screenMove() {
  const { screen } = state;
  if (screen === 'home' && state.active) {
    state.active.x = pointer.x;
    state.active.y = pointer.y;
  } else if (screen === 'bathe') {
    doBathe();
  }
}

function screenUp() {
  const { screen } = state;
  if (screen === 'feed' && state.feedDrag) {
    const k = state.active;
    if (inCircle(pointer.x, pointer.y, k.x, k.y, k.size * 1.4)) {
      state.feedDone = true;
      state.feedCount++;
      toast('yum!', pointer.x, pointer.y - 40, '#fff');
      state.toasts.push({ text: '', x: pointer.x, y: pointer.y - 60, age: 0, heart: true });
    }
    state.feedDrag = null;
  } else if (screen === 'play') {
    for (let i = state.mice.length - 1; i >= 0; i--) {
      const m = state.mice[i];
      if (inCircle(pointer.x, pointer.y, m.x, m.y, 26)) {
        state.mice.splice(i, 1);
        state.playScore++;
        toast('+' + state.playScore, m.x, m.y - 20, '#ffe27a');
        break;
      }
    }
  }
}

function screenTap() {
  const { screen } = state;
  if (screen === 'home') {
    if (state.active) {
      state.screen = 'opts';
    }
  } else if (screen === 'opts') {
    const g = optsLayout();
    const t = g.top;
    if (inRect(pointer.x, pointer.y, t.close)) { state.screen = 'home'; state.active = null; return; }
    for (const a of g.actions) {
      if (inRect(pointer.x, pointer.y, a.g)) {
        openActivity(a.key);
        return;
      }
    }
    if (inRect(pointer.x, pointer.y, t.breed)) {
      if (state.active.isCat) state.screen = 'breedPick';
      else toast('needs a level 10 cat', W / 2, H - 150, '#ff9a8a');
      return;
    }
    if (inRect(pointer.x, pointer.y, t.sell)) { sellActive(); return; }
    if (inRect(pointer.x, pointer.y, t.customize)) { openCustomize(); return; }
  } else if (screen === 'customize') {
    const g = customLayout();
    if (inRect(pointer.x, pointer.y, g.back)) { state.screen = 'opts'; return; }
    if (inRect(pointer.x, pointer.y, g.confirm)) { confirmCustom(); return; }
    for (const c of customColorGrid()) {
      if (inCircle(pointer.x, pointer.y, c.x, c.y, 20)) { state.customColor = c.name; return; }
    }
    for (const p of customPatternRow()) {
      if (inRect(pointer.x, pointer.y, p.g)) { state.customPattern = p.name; return; }
    }
  } else if (screen === 'feed') {
    const g = feedLayout();
    if (state.feedDone && inRect(pointer.x, pointer.y, g.done)) {
      reward(state.feedCount * 5);
    } else if (inRect(pointer.x, pointer.y, g.back)) {
      state.screen = 'opts';
    }
  } else if (screen === 'play') {
    const g = playLayout();
    if (inRect(pointer.x, pointer.y, g.done)) reward(state.playScore);
    else if (inRect(pointer.x, pointer.y, g.back)) { state.screen = 'opts'; state.playScore = 0; state.mice = []; }
  } else if (screen === 'bathe') {
    const g = bathLayout();
    if (inRect(pointer.x, pointer.y, g.done)) reward(10);
    else if (inRect(pointer.x, pointer.y, g.back)) { state.screen = 'opts'; initShampoo(); }
  } else if (screen === 'pet') {
    const g = petLayout();
    if (inRect(pointer.x, pointer.y, g.done)) reward(state.heartCount);
    else if (inRect(pointer.x, pointer.y, g.back)) { state.screen = 'opts'; }
  } else if (screen === 'breedPick') {
    const list = breedList();
    const g = breedLayout();
    if (inRect(pointer.x, pointer.y, g.close)) { state.screen = 'opts'; return; }
    for (const b of list) {
      if (inCircle(pointer.x, pointer.y, b.x, b.y, b.k.size)) {
        const baby = breedParents(state.active, b.k);
        baby.x = b.x;
        baby.y = b.y;
        state.kittens.push(baby);
        state.screen = 'home';
        state.active = null;
        toast('a new kitten!', baby.x, baby.y - baby.size, '#ffd75e');
        return;
      }
    }
  }
}

function reward(amount) {
  const k = state.active;
  if (amount > 0) {
    const leveled = addXP(k, amount);
    addToastToKitten('+' + amount + ' XP', k, '#7ef29a');
    if (leveled) addToastToKitten(k.isCat ? 'Now a CAT!' : 'Level up!', k, '#ffd75e');
  }
  state.screen = 'opts';
  state.feedDone = false;
  state.feedCount = 0;
  state.playScore = 0;
  state.heartCount = 0;
  state.mice = [];
  initShampoo();
}

function openActivity(key) {
  state.screen = key;
  const k = state.active;
  if (k) {
    k.x = W / 2;
    k.y = H / 2 + 30;
  }
  state.feedDone = false;
  state.feedCount = 0;
  state.playScore = 0;
  state.heartCount = 0;
  state.mice = [];
  state.lastHeart = 0;
  state.waters = [];
  initShampoo();
  state.batheTool = 0;
}

// ============================ layouts ============================
function optsTopBar() {
  const h = 50;
  const gap = 12;
  const bw = Math.min(128, Math.max(76, (W - 84) / 3 - gap));
  const total = bw * 3 + gap * 2;
  const x0 = W / 2 - total / 2 - 16;
  return {
    breed: { x: x0, y: 14, w: bw, h },
    sell: { x: x0 + bw + gap, y: 14, w: bw, h },
    customize: { x: x0 + bw + gap + bw + gap, y: 14, w: bw, h },
    close: { x: W - 50, y: 10, w: 42, h: 42 },
  };
}

function optsLayout() {
  const bw = 150;
  const bh = 68;
  const gap = 16;
  const startX = W / 2 - (bw * 2 + gap) / 2;
  const top = H / 2 + 60;
  const actions = [
    { key: 'feed', g: { x: startX, y: top, w: bw, h: bh } },
    { key: 'play', g: { x: startX + bw + gap, y: top, w: bw, h: bh } },
    { key: 'bathe', g: { x: startX, y: top + bh + gap, w: bw, h: bh } },
    { key: 'pet', g: { x: startX + bw + gap, y: top + bh + gap, w: bw, h: bh } },
  ];
  return { actions, top: optsTopBar() };
}

function customLayout() {
  const bw = Math.min(170, W - 60);
  return {
    back: { x: 24, y: 24, w: 70, h: 44 },
    confirm: { x: W / 2 - bw / 2, y: H - 84, w: bw, h: 56 },
  };
}

function customColorGrid() {
  const n = COLOR_NAMES.length;
  const cols = Math.min(7, Math.max(4, Math.floor((W - 40) / 52)));
  const r = 18;
  const cell = 52;
  const rows = Math.ceil(n / cols);
  const x0 = W / 2 - (cols * cell - (cell - r * 2)) / 2;
  const y0 = 76;
  return COLOR_NAMES.map((name, i) => {
    const col = i % cols;
    const row = (i / cols) | 0;
    return { name, x: x0 + col * cell, y: y0 + row * cell };
  });
}

function customPatternRow() {
  const n = PATTERNS.length;
  const gap = 10;
  const w = Math.min(90, (W - 40) / n - gap);
  const h = 42;
  const total = n * w + (n - 1) * gap;
  const x0 = W / 2 - total / 2;
  const grid = customColorGrid();
  const rowY = Math.min(H - 190, grid[grid.length - 1].y + 48);
  return PATTERNS.map((p, i) => ({ name: p, g: { x: x0 + i * (w + gap), y: rowY, w, h } }));
}

function foodLayout() {
  const n = FOODS.length;
  const gap = 20;
  const size = 64;
  const total = n * size + (n - 1) * gap;
  return FOODS.map((f, i) => ({
    f,
    x: W / 2 - total / 2 + size / 2 + i * (size + gap),
    y: H - 70,
  }));
}

function feedLayout() {
  return {
    done: { x: W - 170, y: H - 150, w: 150, h: 60 },
    back: { x: 24, y: 24, w: 60, h: 44 },
  };
}

function toolLayout() {
  const n = TOOLS.length;
  const gap = 26;
  const size = 58;
  const total = n * size + (n - 1) * gap;
  return TOOLS.map((t, i) => ({
    t,
    x: W / 2 - total / 2 + size / 2 + i * (size + gap),
    y: H - 64,
  }));
}

function bathLayout() {
  return {
    done: { x: W - 170, y: H - 150, w: 150, h: 60 },
    back: { x: 24, y: 24, w: 60, h: 44 },
  };
}

function brushLayout() {
  return BRUSH_SIZES.map((sz, i) => ({
    i,
    x: 44 + i * 60,
    y: H - 112,
    r: 22 + i * 7,
  }));
}

function petLayout() {
  return {
    done: { x: W - 170, y: H - 150, w: 150, h: 60 },
    back: { x: 24, y: 24, w: 60, h: 44 },
  };
}

function playLayout() {
  return {
    done: { x: W - 170, y: H - 150, w: 150, h: 60 },
    back: { x: 24, y: 24, w: 60, h: 44 },
  };
}

function breedLayout() {
  return { close: { x: W - 64, y: 24, w: 44, h: 44 } };
}

function breedList() {
  return state.kittens
    .filter((k) => k !== state.active && k.isCat)
    .map((k, i) => {
      const cols = Math.min(3, W < 600 ? 2 : 4);
      const per = Math.ceil(
        state.kittens.filter((x) => x !== state.active && x.isCat).length / cols
      );
      const gw = Math.min(140, (W - 80) / cols);
      const col = i % cols;
      const row = (i / cols) | 0;
      return {
        k,
        x: 40 + col * gw + gw / 2,
        y: 120 + row * (gw * 0.8 + 40),
      };
    });
}

// ============================ activity logic ============================
function doBathe() {
  const tool = state.batheTool;
  const r = BRUSH_SIZES[state.brushSize];
  if (tool === 0) {
    sctx.fillStyle = 'rgba(255,255,255,0.85)';
    sctx.beginPath();
    sctx.arc(pointer.x, pointer.y, r, 0, Math.PI * 2);
    sctx.fill();
  } else if (tool === 1) {
    sctx.globalCompositeOperation = 'destination-out';
    sctx.beginPath();
    sctx.arc(pointer.x, pointer.y, r, 0, Math.PI * 2);
    sctx.fill();
    sctx.globalCompositeOperation = 'source-over';
  } else {
    for (let i = 0; i < 3; i++) {
      state.waters.push({
        x: pointer.x + (Math.random() * 2 - 1) * r * 0.7,
        y: pointer.y + (Math.random() * 2 - 1) * 6,
        vy: 260 + Math.random() * 140,
        vx: (Math.random() * 2 - 1) * 30,
        life: 1.2,
      });
    }
  }
}

// ============================ update ============================
let last = performance.now();

function update(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;

  // play: mice
  if (state.screen === 'play') {
    state.mouseTimer -= dt;
    if (state.mouseTimer <= 0) {
      state.mouseTimer = 0.3 + Math.random() * 0.4;
      state.mice.push({
        x: 60 + Math.random() * (W - 120),
        y: 100 + Math.random() * (H - 260),
        life: 1,
      });
    }
    for (let i = state.mice.length - 1; i >= 0; i--) {
      state.mice[i].life -= dt;
      if (state.mice[i].life <= 0) state.mice.splice(i, 1);
    }
    // kitten follows tap point
    const k = state.active;
    if (k) {
      const mx = k.x + (pointer.x - k.x) * Math.min(1, dt * 6);
      const my = k.y + (pointer.y - k.y) * Math.min(1, dt * 6);
      k.x = mx;
      k.y = my;
    }
  }

  // pet: hearts while held
  if (state.screen === 'pet' && pointer.down) {
    state.lastHeart += dt;
    if (state.lastHeart >= 0.5) {
      state.lastHeart -= 0.5;
      state.heartCount++;
      state.hearts.push({
        x: pointer.x + (Math.random() * 2 - 1) * 20,
        y: pointer.y + (Math.random() * 2 - 1) * 10,
        age: 0,
        vy: -(50 + Math.random() * 45),
      });
    }
  }
  for (let i = state.hearts.length - 1; i >= 0; i--) {
    const h = state.hearts[i];
    h.age += dt;
    h.y += h.vy * dt;
    if (h.age > 1.6) state.hearts.splice(i, 1);
  }

  // bathe water particles
  if (state.screen === 'bathe') {
    for (let i = state.waters.length - 1; i >= 0; i--) {
      const w = state.waters[i];
      w.y += w.vy * dt;
      w.x += w.vx * dt;
      w.life -= dt;
      sctx.globalCompositeOperation = 'destination-out';
      sctx.beginPath();
      sctx.arc(w.x, w.y, 8, 0, Math.PI * 2);
      sctx.fill();
      sctx.globalCompositeOperation = 'source-over';
      if (w.life <= 0 || w.y > H - 40) state.waters.splice(i, 1);
    }
  }

  // toasts
  for (let i = state.toasts.length - 1; i >= 0; i--) {
    const t2 = state.toasts[i];
    t2.age += dt;
    t2.y -= 30 * dt;
    if (t2.age > 1.4) state.toasts.splice(i, 1);
  }

  draw(t);
}

// ============================ draw ============================
function clear() {
  ctx.fillStyle = '#ffe9d6';
  ctx.fillRect(0, 0, W, H);
  // soft floor
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(0, H - 14, W, 14);
}

function draw(t) {
  clear();
  switch (state.screen) {
    case 'home': drawHome(); break;
    case 'opts': drawOpts(); break;
    case 'feed': drawFeed(); break;
    case 'play': drawPlay(); break;
    case 'bathe': drawBathe(); break;
    case 'pet': drawPet(); break;
    case 'breedPick': drawBreedPick(); break;
    case 'customize': drawCustomize(); break;
  }
  drawToasts();
}

function drawKittenCentral(k) {
  drawKitten(ctx, k.x, k.y, k);
}

function drawHome() {
  for (const k of state.kittens) drawKittenCentral(k);
  const bar = homeBar();
  drawBtn(bar.save, 'Save', 'rgba(255,255,255,0.9)', '#432818', '📥');
  drawBtn(bar.load, 'Load', 'rgba(255,255,255,0.9)', '#432818', '📤');
  drawBtn(bar.clear, 'Clear', 'rgba(255,255,255,0.9)', '#432818', '🚫');
  drawBtn(bar.sandbox, 'Sandbox', state.sandbox ? '#7ff0ff' : 'rgba(255,255,255,0.9)', state.sandbox ? '#0a4b54' : '#432818', '☁️');
  drawCoins(12, H - 70);
  const a = adoptBtn();
  drawBtn(a, state.sandbox ? 'Adopt' : 'Adopt 10🪙', (state.sandbox || state.coins >= 10) ? '#4f8bff' : '#b6c2d1', '#fff', '😺');
  if (state.kittens.length > 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font = '600 15px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('tap a kitten to care for it', W / 2, H - 130);
  }
}

function drawCoins(x, y) {
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  roundRect(x, y, 92, 34, 17);
  ctx.fill();
  emo('🪙', x + 19, y + 17, 20);
  ctx.fillStyle = '#432818';
  ctx.font = '800 18px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(state.coins), x + 38, y + 18);
}

function drawOpts() {
  const k = state.active;
  const g = optsLayout();
  const t = g.top;
  // close
  drawBtn(t.close, '', 'rgba(0,0,0,0.4)', '#fff', '✕');

  drawKittenCentral(k);

  // name + pattern higher up
  ctx.fillStyle = '#432818';
  ctx.font = '800 22px system-ui,sans-serif';
  ctx.textAlign = 'center';
  const colorName = k.colorName === 'mixed' ? 'mixed' : k.colorName;
  const patLabel = k.pattern === 'none' ? '' : ' · ' + k.pattern;
  ctx.fillText(colorName + patLabel, W / 2, 78);

  // sell value hint
  let sellVal = 10 + (k.level - 1) * 10 + (isRare(k.colorName) ? 100 : 0);
  ctx.fillStyle = '#6b4a2f';
  ctx.font = '700 14px system-ui,sans-serif';
  ctx.fillText('sells for ' + sellVal + '🪙', W / 2, 104);

  // xp bar
  const bw2 = Math.min(260, W - 60);
  const bx = W / 2 - bw2 / 2;
  const by = k.y + k.size + 18;
  xpBar(k, bx, by, bw2, 18);
  ctx.fillStyle = '#432818';
  ctx.font = '700 16px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Level ${k.level}`, bx + bw2 / 2, by - 12);
  ctx.fillText(`XP ${Math.floor(k.xp)}/100`, bx + bw2 / 2, by + 32);

  // top bar
  drawBtn(t.breed, 'Breed', state.active.isCat ? '#ff7ab3' : '#d5c7cd', '#fff', '💕');
  drawBtn(t.sell, 'Sell', '#ff7a6b', '#fff', '💲');
  drawBtn(t.customize, 'Customize', '#b07ae0', '#fff', '🎨');

  // actions
  const labels = {
    feed: ['Feed', '🍖'],
    play: ['Play', '🧶'],
    bathe: ['Bathe', '🚿'],
    pet: ['Pet', '❤️'],
  };
  for (const a of g.actions) {
    const l = labels[a.key];
    drawBtn(a.g, l[0], 'rgba(255,255,255,0.9)', '#6b4a2f', l[1]);
  }

  drawCoins(12, H - 70);
}

function drawCustomize() {
  const g = customLayout();
  drawBack(g.back);

  ctx.fillStyle = '#432818';
  ctx.font = '800 24px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Customize', W / 2, 40);

  // color swatches
  for (const c of customColorGrid()) {
    ctx.strokeStyle = c.name === state.customColor ? '#ff9a3d' : 'rgba(0,0,0,0.15)';
    ctx.lineWidth = c.name === state.customColor ? 4 : 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS[c.name];
    ctx.beginPath();
    ctx.arc(c.x, c.y, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  // patterns
  for (const p of customPatternRow()) {
    drawBtn(p.g, p.name, p.name === state.customPattern ? '#4f7dff' : 'rgba(255,255,255,0.9)',
      p.name === state.customPattern ? '#fff' : '#6b4a2f', '');
  }

  // preview
  const py = H - 148;
  if (py > 72 && py < H - 60) {
    const preview = {
      color: makeColor(COLORS[state.customColor]),
      pattern: state.customPattern,
      calico: true,
      size: 52,
    };
    drawKitten(ctx, W / 2, py, preview);
  }

  // confirm
  const can = state.sandbox || state.coins >= 100;
  drawBtn(g.confirm, state.sandbox ? 'Get!' : 'Get for 100🪙', can ? '#4f8bff' : '#b6c2d1', '#fff', '✔');
}

function drawFeed() {
  const k = state.active;
  const g = feedLayout();
  drawBack(g.back);
  drawKitten(ctx, k.x, k.y, k, { mouthOpen: !!state.feedDrag });

  // foods
  const foods = foodLayout();
  for (const f of foods) {
    if (state.feedDrag && state.feedDrag.i === foods.indexOf(f)) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 32, 0, Math.PI * 2);
    ctx.fill();
    emo(f.f, f.x, f.y, 34);
  }
  // dragged food follows pointer
  if (state.feedDrag) {
    emo(FOODS[state.feedDrag.i], pointer.x, pointer.y, 40);
  }

  if (state.feedDone) {
    drawBtn(g.done, 'Done', '#4f8bff', '#fff', '✓');
  }
}

function drawPlay() {
  const k = state.active;
  const g = playLayout();
  drawBack(g.back);
  drawKittenCentral(k);
  // mice
  for (const m of state.mice) {
    emo('🐭', m.x, m.y, 36);
  }
  // score
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  roundRect(W / 2 - 70, 22, 140, 46, 23);
  ctx.fill();
  ctx.fillStyle = '#432818';
  ctx.font = '800 20px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  emo('🐭', W / 2 - 38, 46, 18);
  ctx.fillText(String(state.playScore), W / 2 + 18, 46);
  drawBtn(g.done, 'Done', '#4f8bff', '#fff', '✓');
}

function drawBathe() {
  const k = state.active;
  const g = bathLayout();
  drawBack(g.back);
  drawKittenCentral(k);
  // draw shampoo layer on top
  ctx.drawImage(shampoo, 0, 0, W, H);
  // water particles
  for (const w of state.waters) {
    ctx.fillStyle = 'rgba(90,170,255,0.7)';
    ctx.beginPath();
    ctx.arc(w.x, w.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // tools
  const tools = toolLayout();
  tools.forEach((t, i) => {
    ctx.fillStyle = i === state.batheTool ? 'rgba(79,139,255,0.9)' : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 32, 0, Math.PI * 2);
    ctx.fill();
    enoT(t.t, t.x, t.y, 32);
  });
  // brush size
  drawEmoji('🖌️', 30, H - 154, 22);
  brushLayout().forEach((b, i) => {
    ctx.fillStyle = i === state.brushSize ? 'rgba(79,139,255,0.9)' : 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = i === state.brushSize ? '#fff' : '#cfc8bf';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#432818';
    ctx.beginPath();
    ctx.arc(b.x, b.y, BRUSH_SIZES[i] * 0.22, 0, Math.PI * 2);
    ctx.fill();
  });
  drawBtn(g.done, 'Done', '#4f8bff', '#fff', '✓');
}

function drawPet() {
  const k = state.active;
  const g = petLayout();
  drawBack(g.back);
  drawKittenCentral(k);
  // hearts
  for (const h of state.hearts) {
    emo('❤️', h.x, h.y, 34);
  }
  // hand follows pointer
  emo('🤚', pointer.x, pointer.y, 46);
  drawBtn(g.done, 'Done', '#4f8bff', '#fff', '✓');
}

function enoT(t, x, y, size) {
  drawEmoji(t, x, y, size);
}

function drawBreedPick() {
  const g = breedLayout();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(g.close.x, g.close.y, g.close.w, g.close.h, g.close.h / 2);
  ctx.fill();
  emo('✕', g.close.x + g.close.w / 2, g.close.y + g.close.h / 2, 20);

  ctx.fillStyle = '#432818';
  ctx.font = '800 22px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Pick a cat to breed with', W / 2, 60);

  const list = breedList();
  if (list.length === 0) {
    ctx.fillStyle = '#6b4a2f';
    ctx.font = '700 18px system-ui,sans-serif';
    ctx.fillText('No other level 10+ cats yet', W / 2, H / 2);
    return;
  }
  for (const b of list) drawKitten(ctx, b.x, b.y, b.k);
}

function drawBack(g) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(g.x, g.y, g.w, g.h, g.h / 2);
  ctx.fill();
  emo('←', g.x + g.w / 2, g.y + g.h / 2, 20);
}

function drawToasts() {
  for (const t of state.toasts) {
    if (t.heart) {
      emo('💖', t.x, t.y, 34 + Math.min(10, t.age * 60));
    } else if (t.big) {
      const scale = 1 + (t.age > 0.3 ? 0 : (0.3 - t.age) * 2);
      ctx.font = `${34 * scale}px "Apple Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, t.x, t.y);
    } else {
      ctx.font = '800 20px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
  }
  ctx.globalAlpha = 1;
}

loadCoins();
loadCats(true);

requestAnimationFrame(function frame(u) {
  update(u);
  requestAnimationFrame(frame);
});