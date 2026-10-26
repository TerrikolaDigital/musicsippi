// src/movil/inicio/cache.js
// Caché con caducidad para las secciones externas de Inicio. Persiste en el store
// clave/valor «configuracion» de IndexedDB (como la caché de letras); sin IndexedDB va solo en memoria.

export const HORA_MS = 3600 * 1000;

/** @returns {{leer:(k:string)=>Promise<any>, guardar:(k:string,v:any)=>Promise<void>}} */
export function almacenPorDefecto() {
  const memoria = new Map();
  const hayDb = import.meta.env?.VITE_MODO_LOCAL === 'true' && typeof indexedDB !== 'undefined';
  if (!hayDb) {
    return { leer: async (k) => memoria.get(k), guardar: async (k, v) => void memoria.set(k, v) };
  }
  const db = () => import('../../data/lib/db.js');
  return {
    leer: async (k) => (await (await db()).obtenerPorClave('configuracion', `inicio:${k}`))?.valor,
    guardar: async (k, v) => void (await (await db()).guardarValorConfig(`inicio:${k}`, v)),
  };
}

/**
 * Devuelve lo guardado si sigue vigente; si no, llama a `cargar()` y lo guarda.
 * Si `cargar` falla y hay una copia caducada, se usa esa; si no, lanza.
 * @param {string} clave
 * @param {{ ttlMs: number, cargar: () => Promise<any>, almacen?: any, ahora?: () => number, valida?: (entrada: any) => boolean }} o
 * @returns {Promise<{ datos: any, origen: 'cache'|'red'|'caducada' }>}
 */
export async function cargarConCache(clave, { ttlMs, cargar, almacen = almacenPorDefecto(), ahora = Date.now, valida = () => true }) {
  const guardada = await Promise.resolve(almacen.leer(clave)).catch(() => undefined);
  const hay = !!guardada && typeof guardada.hasta === 'number' && 'datos' in guardada;
  if (hay && guardada.hasta > ahora() && valida(guardada)) return { datos: guardada.datos, origen: 'cache' };
  try {
    const datos = await cargar();
    Promise.resolve(almacen.guardar(clave, { datos, hasta: ahora() + ttlMs, creada: ahora() })).catch(() => {});
    return { datos, origen: 'red' };
  } catch (e) {
    if (hay) return { datos: guardada.datos, origen: 'caducada' };
    throw e;
  }
}

/** Lunes (hora local) de la semana de `ms`, como «2026-10-19»: la caché del descubrimiento dura hasta el siguiente. */
export function claveSemana(ms = Date.now()) {
  const d = new Date(ms);
  const atras = (d.getDay() + 6) % 7;
  const l = new Date(d.getFullYear(), d.getMonth(), d.getDate() - atras);
  return `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, '0')}-${String(l.getDate()).padStart(2, '0')}`;
}
