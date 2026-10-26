// src/colorPortada.js
// Color dominante "vivo" de una portada, para teñir el reproductor (C1).
// Las portadas de Deezer, Spotify y YouTube sirven Access-Control-Allow-Origin: *,
// así que se pueden leer en un canvas sin servidor. Se agrupan los píxeles por
// tono y gana el grupo con más color (saturación × brillo útil): así una
// portada casi negra con un detalle magenta da magenta, no gris oscuro.

import { luminanciaDeDatos } from './movil/veloRep.js';

const cache = new Map(); // url -> Promise<{r,g,b}|null>

function aHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max / 255 };
}

function pixelesDe(img) {
  const lado = 32;
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, lado, lado);
  return ctx.getImageData(0, 0, lado, lado).data;
}

// Agrupa los píxeles RGBA por tono (12 grupos de 30°) con el peso saturación × brillo útil.
function agrupar(data) {
  const grupos = Array.from({ length: 12 }, () => ({ peso: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { h, s, v } = aHsv(r, g, b);
    if (v < 0.18 || s < 0.2) continue; // casi negro o gris: no aporta color
    const peso = s * Math.min(v, 0.9);
    const grupo = grupos[Math.floor(h / 30) % 12];
    grupo.peso += peso;
    grupo.r += r * peso;
    grupo.g += g * peso;
    grupo.b += b * peso;
  }
  return grupos;
}

const media = (g) => ({ r: Math.round(g.r / g.peso), g: Math.round(g.g / g.peso), b: Math.round(g.b / g.peso) });

/** Parte pura: array RGBA -> color dominante vivo, o null si no hay color. */
export function colorDeDatos(data) {
  const mejor = agrupar(data).reduce((a, b) => (b.peso > a.peso ? b : a));
  if (mejor.peso < 1) return null; // portada sin color (blanco y negro)
  return media(mejor);
}

const distanciaTono = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Parte pura: array RGBA -> { principal, secundario, fondo } (colores {r,g,b}) o null.
 * principal = grupo de tono con más peso; secundario = el siguiente con más peso a >= 60° de tono
 * (si no hay, el principal); fondo = tono oscuro del principal para el degradado.
 */
export function paletaDeDatos(data) {
  const grupos = agrupar(data)
    .filter((g) => g.peso >= 1)
    .sort((a, b) => b.peso - a.peso);
  if (!grupos.length) return null;
  const principal = media(grupos[0]);
  const hp = aHsv(principal.r, principal.g, principal.b);
  const otro = grupos.slice(1).find((g) => {
    const c = media(g);
    return distanciaTono(hp.h, aHsv(c.r, c.g, c.b).h) >= 60;
  });
  const secundario = otro ? media(otro) : principal;
  const k = 0.22 / Math.max(hp.v, 0.01);
  const fondo = { r: Math.round(principal.r * k), g: Math.round(principal.g * k), b: Math.round(principal.b * k) };
  return { principal, secundario, fondo };
}

/** @returns {Promise<{r:number,g:number,b:number}|null>} */
export function colorDePortada(url) {
  if (!url || !/^https?:/.test(url)) return Promise.resolve(null);
  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => {
          try {
            resolve(colorDeDatos(pixelesDe(img)));
          } catch {
            resolve(null); // canvas "contaminado" (sin CORS): sin color
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      })
    );
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }
  return cache.get(url);
}

const cachePaleta = new Map(); // url -> Promise<paleta|null>

/** @returns {Promise<{principal:{r,g,b},secundario:{r,g,b},fondo:{r,g,b}}|null>} */
export function paletaDePortada(url) {
  if (!url || !/^https?:/.test(url)) return Promise.resolve(null);
  if (!cachePaleta.has(url)) {
    cachePaleta.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => {
          try {
            resolve(paletaDeDatos(pixelesDe(img)));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      })
    );
    if (cachePaleta.size > 200) cachePaleta.delete(cachePaleta.keys().next().value);
  }
  return cachePaleta.get(url);
}

const cacheLuminancia = new Map(); // url -> Promise<number|null>

/** Luminancia (0..1) de la carátula, también para las que no tienen color (blanco y negro). */
export function luminanciaDePortada(url) {
  if (!url || !/^https?:/.test(url)) return Promise.resolve(null);
  if (!cacheLuminancia.has(url)) {
    cacheLuminancia.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => {
          try {
            resolve(luminanciaDeDatos(pixelesDe(img)));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      })
    );
    if (cacheLuminancia.size > 200) cacheLuminancia.delete(cacheLuminancia.keys().next().value);
  }
  return cacheLuminancia.get(url);
}
