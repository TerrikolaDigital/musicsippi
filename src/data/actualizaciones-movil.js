// src/data/actualizaciones-movil.js
// Conecta la lógica pura (actualizaciones.js) con la red, localStorage y el plugin nativo.
import { ReproductorNativo, esAndroid } from './nativo-movil.js';
import { URL_MANIFIESTO, debeAvisar, debeComprobar, hayVersionNueva, normalizarManifiesto, posponerHasta } from './actualizaciones.js';

const CLAVE = 'musicsippi-actualizaciones';

function leer(almacen = globalThis.localStorage) {
  try {
    return JSON.parse(almacen?.getItem(CLAVE) ?? '{}') || {};
  } catch {
    return {};
  }
}

function guardar(parcial, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE, JSON.stringify({ ...leer(almacen), ...parcial }));
  } catch {
    // sin almacenamiento: se vuelve a consultar en la próxima apertura
  }
}

export const actualizacionesActivas = () => esAndroid() && !!URL_MANIFIESTO;

/** { versionCode, versionName } del APK instalado, o null fuera de Android. */
export async function versionInstalada() {
  if (!esAndroid()) return null;
  try {
    const v = await ReproductorNativo.infoVersion();
    return { versionCode: Number(v.versionCode), versionName: String(v.versionName ?? '') };
  } catch {
    return null;
  }
}

// Con el fetch nativo (CapacitorHttp): GitHub redirige la descarga a otro dominio sin
// cabeceras CORS y el fetch del WebView fallaba siempre («No se pudo comprobar»).
let fetchNativo = null;
export async function descargarJson(url) {
  if (!fetchNativo) fetchNativo = (await import('./audio-nativo.js')).crearFetchNativo();
  const r = await fetchNativo(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function descargarManifiesto() {
  const m = normalizarManifiesto(await descargarJson(URL_MANIFIESTO));
  if (!m) throw new Error('manifiesto no válido');
  return m;
}

/**
 * Comprobación al abrir: respeta las 12 h y la red; nunca lanza.
 * Devuelve el manifiesto a anunciar o null.
 */
export async function comprobarAlAbrir(ahora = Date.now()) {
  if (!actualizacionesActivas()) return null;
  const estado = leer();
  if (!debeComprobar({ ahora, ultima: estado.ultimaComprobacion })) return null;
  if (globalThis.navigator?.onLine === false) return null;
  try {
    const instalada = await versionInstalada();
    if (!instalada) return null;
    const m = await descargarManifiesto();
    guardar({ ultimaComprobacion: ahora });
    return debeAvisar({ instalada: instalada.versionCode, manifiesto: m, estado, ahora }) ? m : null;
  } catch {
    return null; // sin red o servidor caído: en silencio, se reintenta en la próxima apertura
  }
}

/**
 * Comprobación manual (Acerca de): ignora el intervalo, posponer y omitir.
 * { estado: 'nueva' | 'al-dia' | 'error' | 'desactivado', manifiesto? }
 */
export async function buscarActualizacion(ahora = Date.now()) {
  if (!actualizacionesActivas()) return { estado: 'desactivado' };
  try {
    const instalada = await versionInstalada();
    if (!instalada) return { estado: 'error' };
    const m = await descargarManifiesto();
    guardar({ ultimaComprobacion: ahora });
    return hayVersionNueva(instalada.versionCode, m) ? { estado: 'nueva', manifiesto: m } : { estado: 'al-dia', manifiesto: m };
  } catch {
    return { estado: 'error' };
  }
}

export function posponerActualizacion(ahora = Date.now()) {
  guardar({ pospuestoHasta: posponerHasta(ahora) });
}

export function omitirActualizacion(versionCode) {
  guardar({ omitida: versionCode });
}

/** Abre el APK en el navegador del sistema (Intent ACTION_VIEW); respaldo window.open. */
export async function descargarActualizacion(url) {
  try {
    await ReproductorNativo.abrirUrl({ url });
  } catch {
    globalThis.open?.(url, '_system');
  }
}
