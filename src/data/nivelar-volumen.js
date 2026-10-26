// src/data/nivelar-volumen.js
// «Nivelar volumen»: que todas las canciones suenen a un volumen parecido.
// YouTube ya normaliza cada pista a una referencia común (≈ −14 LUFS) y da su
// sonoridad respecto a ella: `loudnessDb` > 0 = más fuerte que la referencia.
// La nivelación solo ATENÚA (nunca sube por encima de 0 dB, para no saturar).

const MAX_ATENUACION_DB = -12;
const REFERENCIA_LUFS = -14; // `perceptualLoudnessDb` es absoluto; `loudnessDb`, relativo a esto.

/** Sonoridad relativa a la referencia (dB) a partir de lo que dé InnerTube; null si no hay dato. */
export function loudnessRelativo({ loudnessDb, perceptualLoudnessDb } = {}) {
  if (Number.isFinite(loudnessDb)) return loudnessDb;
  if (Number.isFinite(perceptualLoudnessDb)) return perceptualLoudnessDb - REFERENCIA_LUFS;
  return null;
}

/**
 * Ganancia en dB (≤ 0) hacia el objetivo. `objetivo` está en dB relativos a la
 * referencia de YouTube (0 ≈ −14 LUFS). Sin dato válido → 0 dB.
 */
export function gananciaNivelada(loudnessDb, { objetivo = 0 } = {}) {
  if (!Number.isFinite(loudnessDb)) return 0;
  const g = objetivo - loudnessDb;
  return Math.min(0, Math.max(MAX_ATENUACION_DB, g)) + 0; // +0 evita -0
}

/** dB -> factor lineal (0 dB = 1). */
export function dbALineal(db) {
  return Number.isFinite(db) ? 10 ** (Math.min(0, db) / 20) : 1;
}

/** Volumen final 0..100 = volumen del usuario × ganancia (si la nivelación está activa). */
export function volumenEfectivo(volumen, gananciaDb, activo = true) {
  const v = Math.min(100, Math.max(0, Number(volumen) || 0));
  return activo ? v * dbALineal(gananciaDb) : v;
}

// ---- Preferencia (activada por defecto), en localStorage como el volumen ------
const CLAVE = 'musicsippi-nivelar-volumen';

export function leerNivelar(almacen = globalThis.localStorage) {
  try {
    return almacen?.getItem(CLAVE) !== '0';
  } catch {
    return true;
  }
}

export function guardarNivelar(activo, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE, activo ? '1' : '0');
  } catch {
    // localStorage puede fallar (modo privado, cuota llena); no es crítico.
  }
  try {
    globalThis.dispatchEvent?.(new Event(EVENTO));
  } catch {
    // sin eventos (Node): nada que avisar
  }
}

export const EVENTO = 'musicsippi-nivelar-volumen';
