// src/data/reproduccion-locales.js
// Qué suena para una canción en Android: su archivo local en este móvil (URI content://) o, si no
// lo hay, el audio de YouTube como hasta ahora. Si YouTube declara el vídeo no disponible y el PC
// sí tiene el archivo, se anota la copia pendiente PC -> móvil (Disponible al sincronizar).
import * as db from './lib/db.js';
import { anotarParaCopiar, obtenerArchivoLocal } from './archivos-locales.js';

const DISPOSITIVO_MOVIL = 'movil';
const DISPOSITIVO_PC = 'pc';

/** En la cola nativa una pista local se identifica como «local:<trackId>» (las de YouTube, por su videoId). */
export const PREFIJO_LOCAL = 'local:';
export const idLocal = (trackId) => `${PREFIJO_LOCAL}${trackId}`;
export const esIdLocal = (id) => typeof id === 'string' && id.startsWith(PREFIJO_LOCAL);
export const trackIdDeIdLocal = (id) => id.slice(PREFIJO_LOCAL.length);

/** Id con el que suena `track` en la cola nativa: el local si se eligió, si no su videoId. */
export function idReproductor(track, resueltos) {
  const resuelto = resueltos.get(track.id);
  return esIdLocal(resuelto) ? resuelto : (track.youtubeVideoId ?? resuelto);
}

export async function tieneArchivoLocal(trackId, almacen = db) {
  return !!(await obtenerArchivoLocal(trackId, DISPOSITIVO_MOVIL, almacen));
}

/** Si el PC tiene el archivo, deja anotada la copia a este móvil (una sola vez). Devuelve si lo está. */
export async function anotarSiDisponibleEnPC(trackId, almacen = db) {
  const enPC = await obtenerArchivoLocal(trackId, DISPOSITIVO_PC, almacen);
  if (!enPC) return false;
  await anotarParaCopiar(
    { trackId, origen: DISPOSITIVO_PC, destino: DISPOSITIVO_MOVIL, sha256: enPC.sha256, tamano: enPC.tamano },
    almacen
  );
  return true;
}

/**
 * @param {{trackId?: string, videoId?: string, usarLocal?: boolean, forzar?: boolean, fetch?: Function,
 *   resolver?: Function, almacen?: object}} p
 *   `usarLocal:false` salta el archivo local (ya falló: se sigue con YouTube).
 * @returns {Promise<{tipo: 'local'|'youtube', url: string, headers: object, mime: string, duracion: number}>}
 *   Si YouTube lanza `no_disponible` y el PC tiene el archivo, el error sale con `paraCopiar: true`.
 */
export async function resolverFuenteReproduccion({ trackId, videoId, usarLocal = true, forzar = false, fetch, resolver, almacen = db }) {
  if (trackId && usarLocal) {
    const local = await obtenerArchivoLocal(trackId, DISPOSITIVO_MOVIL, almacen);
    if (local?.uri) return { tipo: 'local', url: local.uri, headers: {}, mime: local.mime || 'audio/mpeg', duracion: 0, cliente: 'local' };
  }
  if (!videoId) {
    const e = new Error(`sin archivo local ni videoId para ${trackId ?? 'la canción'}`);
    e.codigo = 'no_disponible';
    throw e;
  }
  const resolverYoutube = resolver ?? (await import('./audio-nativo.js')).resolverAudio;
  try {
    return { tipo: 'youtube', ...(await resolverYoutube(videoId, { forzar, fetch })) };
  } catch (e) {
    if (e?.codigo === 'no_disponible' && trackId && (await anotarSiDisponibleEnPC(trackId, almacen))) e.paraCopiar = true;
    throw e;
  }
}
