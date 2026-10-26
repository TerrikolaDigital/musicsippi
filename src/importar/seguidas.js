// Playlists seguidas: cada playlist importada por enlace se vuelve a leer al
// abrir la app (como mucho una vez cada 24 h) y las canciones nuevas se
// importan solas. Lo que el usuario quitó en el origen no se borra aquí.
import * as db from '../data/lib/db.js';

const DIA_MS = 24 * 60 * 60 * 1000;

export const claveSeguida = (origen, id) => `${origen}:${id}`;

/** Enlace que leerEnlace reconoce sin resolver redirecciones. */
export function urlCanonica(origen, id) {
  if (origen === 'spotify') return `spotify:playlist:${id}`;
  if (origen === 'deezer') return `https://www.deezer.com/playlist/${id}`;
  return `https://music.youtube.com/playlist?list=${id}`;
}

/** Marca una playlist como seguida (se acaba de leer: la próxima revisión, en 24 h). */
export function seguir({ origen, id, url, nombre, ejeId = null }, ahoraMs = Date.now(), almacen = db) {
  return almacen.guardarRegistro('seguidas', {
    clave: claveSeguida(origen, id),
    origen,
    id,
    url: url || urlCanonica(origen, id),
    nombre,
    ejeId,
    ultimaLectura: ahoraMs,
  });
}

export const dejarDeSeguir = (clave, almacen = db) => almacen.borrarRegistro('seguidas', clave);

export const listarSeguidas = (almacen = db) => almacen.obtenerTodos('seguidas');

/** Leer una playlist son pocos KB: vale cualquier conexión, también datos móviles. */
export const hayConexion = (nav = globalThis.navigator) => nav?.onLine !== false;

/** Pura: nunca leída, o leída hace 24 h o más. */
export function debeComprobar(seguida, ahoraMs) {
  if (!Number.isFinite(seguida.ultimaLectura)) return true;
  return ahoraMs - seguida.ultimaLectura >= DIA_MS;
}

/**
 * Relee las playlists seguidas que toquen. Un fallo en una (lectura o
 * importación) no impide revisar las demás y deja su `ultimaLectura` como
 * estaba, así se reintenta en la próxima apertura.
 * - leer(url) → lectura de leerEnlace; importar(lectura, seguida) → {tracksNuevos, ejeLista}
 *   (la seguida lleva su `ejeId`: destino aunque la playlist se renombre en el origen).
 * - avisar se llama por playlist con nuevas; organizar, una sola vez al final.
 */
export async function comprobarSeguidas({ ahoraMs = Date.now(), leer, importar, organizar, avisar, hayRed, almacen = db }) {
  const resultado = { revisadas: 0, nuevas: 0 };
  const pendientes = (await listarSeguidas(almacen)).filter((s) => debeComprobar(s, ahoraMs));
  if (pendientes.length === 0 || !(await hayRed())) return resultado;
  for (const seguida of pendientes) {
    try {
      const lectura = await leer(seguida.url);
      const { tracksNuevos = 0, ejeLista = null } = await importar(lectura, seguida);
      await almacen.guardarRegistro('seguidas', { ...seguida, ejeId: ejeLista ?? seguida.ejeId ?? null, ultimaLectura: ahoraMs });
      resultado.revisadas++;
      if (tracksNuevos > 0) {
        resultado.nuevas += tracksNuevos;
        const cuantas = tracksNuevos === 1 ? '1 canción nueva' : `${tracksNuevos} canciones nuevas`;
        avisar?.(`${cuantas} de «${seguida.nombre}»`);
      }
    } catch {
      // se reintenta en la próxima apertura
    }
  }
  if (resultado.nuevas > 0) await organizar?.({ motivo: 'seguidas' });
  return resultado;
}
