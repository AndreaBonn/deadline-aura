'use strict';

const COLOR_BANDS = [
  { min: 0.0, max: 0.2, h1: 160, s1: 35, l1: 12, h2: 160, s2: 35, l2: 12, label: 'calmo' },
  { min: 0.2, max: 0.4, h1: 160, s1: 35, l1: 12, h2: 120, s2: 40, l2: 10, label: 'normale' },
  { min: 0.4, max: 0.6, h1: 120, s1: 40, l1: 10, h2: 60, s2: 45, l2: 9, label: 'attenzione' },
  { min: 0.6, max: 0.8, h1: 60, s1: 45, l1: 9, h2: 20, s2: 50, l2: 8, label: 'urgente' },
  { min: 0.8, max: 1.0, h1: 20, s1: 50, l1: 8, h2: 0, s2: 55, l2: 7, label: 'critico' },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hslToHex(h, s, l) {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mapScoreToColor(score) {
  const s = clamp(score, 0, 1);

  let band = COLOR_BANDS[COLOR_BANDS.length - 1];
  for (const b of COLOR_BANDS) {
    if (s >= b.min && s < b.max) {
      band = b;
      break;
    }
  }

  const t = band.max > band.min ? (s - band.min) / (band.max - band.min) : 1;

  const h = Math.round(lerp(band.h1, band.h2, t));
  const sat = Math.round(lerp(band.s1, band.s2, t));
  const light = Math.round(lerp(band.l1, band.l2, t));

  const accentH = h;
  const accentS = Math.min(sat + 25, 70);
  const accentL = Math.min(light + 35, 50);

  return {
    hsl: { h, s: sat, l: light },
    hex: hslToHex(h, sat, light),
    accent_hex: hslToHex(accentH, accentS, accentL),
    label: band.label,
  };
}

module.exports = { mapScoreToColor, COLOR_BANDS, lerp, hslToHex };
