// src/data/actualizaciones.js
// Avisos de versión nueva (Android). Lógica PURA: sin red ni almacenamiento (ver
// actualizaciones-movil.js, que la conecta). Testeada en actualizaciones.test.mjs.

/**
 * URL del manifiesto JSON de versiones: {versionCode, versionName, url, notas[], minimo?}.
 * ÚNICO sitio donde se configura. Vacía = comprobador desactivado.
 * Ej.: 'https://github.com/<usuario>/<repo>/releases/latest/download/version.json'
 */
export const URL_MANIFIESTO = 'https://github.com/TerrikolaDigital/musicsippi-android/releases/latest/download/version.json';

export const INTERVALO_COMPROBAR_MS = 12 * 60 * 60 * 1000; // como mucho cada 12 h
export const POSPONER_MS = 3 * 24 * 60 * 60 * 1000; // «Más tarde» = 3 días

/** Valida y normaliza el JSON descargado; null si no sirve (no se avisa de nada raro). */
export function normalizarManifiesto(json) {
  if (!json || typeof json !== 'object') return null;
  const versionCode = Number(json.versionCode);
  if (!Number.isInteger(versionCode) || versionCode < 1) return null;
  const url = typeof json.url === 'string' ? json.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return null;
  const minimo = Number(json.minimo);
  return {
    versionCode,
    versionName: typeof json.versionName === 'string' && json.versionName ? json.versionName : String(versionCode),
    url,
    notas: Array.isArray(json.notas) ? json.notas.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim()) : [],
    minimo: Number.isInteger(minimo) && minimo > 0 ? minimo : null,
  };
}

/** Compara versionCode: >0 si `a` es más nueva que `b`. */
export function compararVersiones(a, b) {
  return Number(a) - Number(b);
}

export function hayVersionNueva(instalada, manifiesto) {
  if (!manifiesto || instalada == null || !Number.isInteger(Number(instalada))) return false;
  return compararVersiones(manifiesto.versionCode, instalada) > 0;
}

/** ¿Toca consultar la red? `ultima` = ms de la última comprobación (o null/0). */
export function debeComprobar({ ahora, ultima, intervalo = INTERVALO_COMPROBAR_MS }) {
  if (!ultima || !Number.isFinite(ultima)) return true;
  if (ultima > ahora) return true; // reloj retrocedido: mejor consultar
  return ahora - ultima >= intervalo;
}

export function posponerHasta(ahora, ms = POSPONER_MS) {
  return ahora + ms;
}

/**
 * ¿Mostrar el aviso? `estado` = { pospuestoHasta, omitida } (omitida = versionCode).
 * Una versión «mínima» obligatoria (instalada < minimo) ignora posponer y omitir.
 */
export function debeAvisar({ instalada, manifiesto, estado = {}, ahora }) {
  if (!hayVersionNueva(instalada, manifiesto)) return false;
  if (manifiesto.minimo && Number(instalada) < manifiesto.minimo) return true;
  if (estado.omitida === manifiesto.versionCode) return false;
  if (estado.pospuestoHasta && ahora < estado.pospuestoHasta) return false;
  return true;
}
