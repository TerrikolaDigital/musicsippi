// src/movil/portadaGenerada.js
// Portada de reserva cuando una canción no tiene carátula (o no carga): color estable por
// hash del texto, dentro de la paleta de la app, más sus iniciales. Pura, sin DOM.

import { inicialesDe } from './iniciales.js';

// Pares vivos y variados (texto blanco grande y con sombra, legible): [principal, acompañante].
const PARES = [
  ['#e11d48', '#f97316'],
  ['#7c3aed', '#06b6d4'],
  ['#db2777', '#8b5cf6'],
  ['#0891b2', '#7c3aed'],
  ['#16a34a', '#0891b2'],
  ['#ea580c', '#db2777'],
  ['#4f46e5', '#ec4899'],
  ['#0d9488', '#2563eb'],
  ['#c026d3', '#f97316'],
  ['#2563eb', '#06b6d4'],
  ['#65a30d', '#0d9488'],
  ['#dc2626', '#9333ea'],
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
  const iniciales = inicialesDe(limpio);
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
