export const COLORS = {
  black: '#3b3b3b',
  grey: '#b9b9b6',
  white: '#f4f4ef',
  peach: '#f4c79e',
  orange: '#ee9436',
  brown: '#96592e',
  red: '#e33b3b',
  yellow: '#f5d323',
  green: '#4faa4f',
  blue: '#4a90e2',
  purple: '#8b5abf',
  pink: '#f297c2',
};

export const BASE_COLORS = ['black', 'grey', 'white', 'peach', 'orange', 'brown'];
export const SPECIAL_COLORS = ['red', 'yellow', 'green', 'blue', 'purple', 'pink'];
export const SPECIAL_CHANCE = 0.06;

export const COLOR_NAMES = Object.keys(COLORS);

export const PATTERNS = ['none', 'stripes', 'spots', 'muzzle', 'calico'];

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function lerpColor(hex1, hex2, t) {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  return rgbToHex(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  );
}

export function shade(hex, amt) {
  const a = hexToRgb(hex);
  const f = 1 + amt;
  return rgbToHex(a[0] * f, a[1] * f, a[2] * f);
}

export function makeColor(hex) {
  return { base: hex, dark: shade(hex, -0.22) };
}