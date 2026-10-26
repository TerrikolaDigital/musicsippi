// src/data/desfase-letra.js
// Desfase manual de la letra por canción (segundos que hay que sumar a los tiempos de
// LRCLIB). Hace falta cuando suena otra versión que la de la letra: p. ej. el videoclip
// de YouTube con 16 s de intro frente a la versión del álbum. Se guarda en localStorage.

const PREFIJO = 'musicsippi:desfase-letra:';
const EVENTO = 'musicsippi:desfase-letra';
const LIMITE = 120;

export function claveDesfase({ artista, titulo }) {
  return `${String(artista ?? '').trim().toLowerCase()}|${String(titulo ?? '').trim().toLowerCase()}`;
}

export function ajustarDesfase(actual, paso) {
  const base = Number.isFinite(actual) ? actual : 0;
  const v = Math.round((base + paso) * 10) / 10;
  return Math.max(-LIMITE, Math.min(LIMITE, v));
}

export function textoDesfase(s) {
  if (!s) return 'Sincronizada';
  const n = Math.abs(s).toFixed(1).replace('.', ',');
  return `Letra ${s > 0 ? '+' : '−'}${n} s`;
}

export function leerDesfase(track) {
  try {
    const v = Number(localStorage.getItem(PREFIJO + claveDesfase(track)));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function guardarDesfase(track, s) {
  try {
    if (s) localStorage.setItem(PREFIJO + claveDesfase(track), String(s));
    else localStorage.removeItem(PREFIJO + claveDesfase(track));
  } catch {
    // sin almacenamiento: el ajuste dura lo que dure la canción
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { clave: claveDesfase(track), s } }));
}

/** Suscripción a cambios (para que reproductor y panel se enteren a la vez). */
export function alCambiarDesfase(fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener(EVENTO, h);
  return () => window.removeEventListener(EVENTO, h);
}
