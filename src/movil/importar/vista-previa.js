// src/movil/importar/vista-previa.js
// Copia local de NOMBRE_ORIGEN (src/importar/leer.js): importarlo aquí metería
// leer.js (y youtubei.js) en el bundle principal en vez de cargarlo bajo demanda.
import { pluralCanciones } from '../avisos.js';

const NOMBRE_ORIGEN = { spotify: 'Spotify', youtube: 'YouTube Music', deezer: 'Deezer', apple: 'Apple Music', amazon: 'Amazon Music' };

export function resumenVistaPrevia(lectura) {
  return `${NOMBRE_ORIGEN[lectura.origen] ?? 'Playlist'} · ${pluralCanciones(lectura.filas.length)}`;
}

export function textoImportado(r, lectura) {
  if (!r.tracksNuevos) return `«${lectura.nombre}» ya estaba en tu biblioteca: he actualizado la lista.`;
  const nuevas = r.tracksNuevos === 1 ? '1 canción nueva' : `${r.tracksNuevos} canciones nuevas`;
  return `«${lectura.nombre}»: ${nuevas}. Ya puedes escucharlas; ahora las ordeno en moods.`;
}
