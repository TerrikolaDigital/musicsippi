// src/movil/portadaGenerada.js
// Portada de reserva cuando una canción no tiene carátula (o no carga): color estable por
// hash del texto, dentro de la paleta de la app, más sus iniciales. Pura, sin DOM.

// Pares oscuros (texto blanco con contraste AA): [principal, acompañante].
const PARES = [
  ['#7c3aed', '#db2777'],
  ['#2563eb', '#7c3aed'],
  ['#0e7490', '#2563eb'],
  ['#047857', '#0e7490'],
  ['#b45309', '#be123c'],
  ['#be123c', '#7c3aed'],
  ['#9333ea', '#2563eb'],
  ['#c2410c', '#a21caf'],
  ['#0f766e', '#4d7c0f'],
  ['#4f46e5', '#0e7490'],
];

const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

function hash(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function portadaGenerada(texto) {
  const limpio = typeof texto === 'string' ? texto.trim() : '';
  const [color, color2] = PARES[hash(normalizar(limpio)) % PARES.length];
  const palabras = limpio.match(/[\p{L}\p{N}]+/gu) ?? [];
  const iniciales = palabras
    .slice(0, 2)
    .map((p) => p[0].toLocaleUpperCase())
    .join('');
  return { color, color2, iniciales: iniciales || '♪' };
}

export function aRgbDeHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Texto que da nombre y color a la portada de una canción: álbum, si no título, si no artista. */
export function textoPortada(track, meta) {
  return (meta?.album || track?.titulo || track?.artista || '').toString();
}

const canal = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminancia = ({ r, g, b }) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

/** Oscurece un color {r,g,b} hasta que el texto blanco encima tenga contraste AA (4.5:1). */
export function tinteLegible(rgb) {
  let c = rgb;
  for (let i = 0; i < 20 && 1.05 / (luminancia(c) + 0.05) < 4.5; i++) {
    c = { r: Math.round(c.r * 0.9), g: Math.round(c.g * 0.9), b: Math.round(c.b * 0.9) };
  }
  return c;
}
