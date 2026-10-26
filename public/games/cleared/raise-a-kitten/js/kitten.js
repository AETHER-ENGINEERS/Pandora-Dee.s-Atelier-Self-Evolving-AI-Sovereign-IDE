import { COLORS, COLOR_NAMES, BASE_COLORS, SPECIAL_COLORS, SPECIAL_CHANCE, PATTERNS, lerpColor, makeColor } from './color.js';

let uid = 1;

export function randomColorName() {
  if (Math.random() < SPECIAL_CHANCE) {
    return SPECIAL_COLORS[(Math.random() * SPECIAL_COLORS.length) | 0];
  }
  return BASE_COLORS[(Math.random() * BASE_COLORS.length) | 0];
}

export function randomPattern() {
  return PATTERNS[(Math.random() * PATTERNS.length) | 0];
}

export function createKitten(opts = {}) {
  const colorName = opts.colorName || randomColorName();
  const color = opts.color || makeColor(COLORS[colorName]);
  const pattern = opts.pattern || randomPattern();
  return {
    id: uid++,
    colorName,
    pattern,
    color,
    level: 1,
    xp: 0,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    calico: pattern === 'calico' ? Math.random() < 0.5 : false,
    parents: opts.parents || null,
    get size() {
      return this.level >= 10 ? 52 : 32;
    },
    get isCat() {
      return this.level >= 10;
    },
  };
}

export function addXP(k, amt) {
  k.xp += amt;
  let leveled = false;
  while (k.xp >= 100) {
    k.xp -= 100;
    k.level += 1;
    leveled = true;
  }
  return leveled;
}

export function breedParents(a, b) {
  const roll = Math.random();
  let color;
  let colorName;
  if (roll < 0.34) {
    colorName = a.colorName;
    color = { base: a.color.base, dark: a.color.dark };
  } else if (roll < 0.68) {
    colorName = b.colorName;
    color = { base: b.color.base, dark: b.color.dark };
  } else {
    colorName = 'mixed';
    color = makeColor(lerpColor(a.color.base, b.color.base, 0.5));
  }
  const pattern = Math.random() < 0.5 ? a.pattern : b.pattern;
  const baby = createKitten({ color, colorName, pattern, parents: [a.id, b.id] });
  baby.calico = pattern === 'calico' ? Math.random() < 0.5 : false;
  return baby;
}