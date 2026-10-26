// src/data/efectos-audio.js
// Ecualizador, refuerzo de graves y sonido envolvente (Android). Los efectos viven en el servicio
// nativo (android.media.audiofx sobre el audioSessionId de ExoPlayer) y allí se guarda la
// configuración; aquí solo están el puente tipado y los textos/formatos de la pantalla.
import { ReproductorNativo, esAndroid } from './nativo-movil.js';

/**
 * @typedef {{ centroHz: number, minMb: number, maxMb: number, nivelMb: number }} BandaEcualizador
 * @typedef {{
 *   ecualizadorSoportado: boolean, activo: boolean, preset: number, presets: string[],
 *   bandas: BandaEcualizador[], gravesSoportado: boolean, graves: number,
 *   envolventeSoportado: boolean, envolventeActivo: boolean, envolventeFuerza: number,
 *   espacialSistemaDisponible: boolean, espacialSistemaActivo: boolean
 * }} EstadoEfectos
 */

export const PRESET_PERSONALIZADO = -1;

/** @returns {Promise<EstadoEfectos|null>} null si no es Android o el sistema falla. */
export async function leerEfectos() {
  if (!esAndroid()) return null;
  try {
    return await ReproductorNativo.efectosEstado();
  } catch {
    return null;
  }
}

/** @param {{ activo?: boolean, preset?: number, banda?: number, nivelMb?: number, graves?: number }} cambios */
export function ajustarEcualizador(cambios) {
  return ReproductorNativo.ecualizadorAjustar(cambios);
}

/** @param {{ activo?: boolean, fuerza?: number }} cambios */
export function ajustarEnvolvente(cambios) {
  return ReproductorNativo.envolventeAjustar(cambios);
}

const PRESETS_ES = {
  normal: 'Normal',
  classical: 'Clásica',
  dance: 'Baile',
  flat: 'Plano',
  folk: 'Folk',
  'heavy metal': 'Heavy metal',
  'hip hop': 'Hip hop',
  jazz: 'Jazz',
  pop: 'Pop',
  rock: 'Rock',
  'fx booster': 'Realce de efectos',
};

/** Nombre del preajuste en español; los que no se conocen se dejan como los da el sistema. */
export function traducirPreset(nombre) {
  const limpio = String(nombre ?? '').trim();
  return PRESETS_ES[limpio.toLowerCase()] ?? limpio;
}

/** Opciones del selector: los del dispositivo, traducidos, y «Personalizado» al final. */
export function opcionesPreset(presets) {
  const lista = (Array.isArray(presets) ? presets : []).map((n, indice) => ({ indice, nombre: traducirPreset(n) }));
  return [...lista, { indice: PRESET_PERSONALIZADO, nombre: 'Personalizado' }];
}

/** 60 -> «60 Hz»; 3600 -> «3,6 kHz». */
export function etiquetaFrecuencia(hz) {
  const n = Number(hz);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1000) return `${Math.round(n)} Hz`;
  const k = Math.round(n / 100) / 10;
  return `${String(k).replace('.', ',')} kHz`;
}

/** Milibelios -> «+3 dB» / «−2,5 dB» / «0 dB». */
export function etiquetaDb(mb) {
  const db = Math.round(Number(mb) / 10) / 10;
  if (!Number.isFinite(db) || db === 0) return '0 dB';
  return `${db > 0 ? '+' : '−'}${String(Math.abs(db)).replace('.', ',')} dB`;
}

/** Fuerza nativa 0..1000 -> porcentaje 0..100. */
export const fuerzaAPorcentaje = (f) => Math.round(Math.min(1000, Math.max(0, Number(f) || 0)) / 10);
export const porcentajeAFuerza = (p) => Math.round(Math.min(100, Math.max(0, Number(p) || 0)) * 10);
