// src/movil/anadirActual.js
// Canción que suena y no está en la biblioteca (vista previa de Buscar, tarjeta de Inicio, radio de
// YouTube, aleatorio de la ficha de artista…): el reproductor ofrece guardarla en la biblioteca, en un
// mood o en una lista, y el corazón la guarda en Favoritas. Puro.
import { esLaQueSuena } from './cancionSonando.js';

/**
 * La copia de la biblioteca de esta canción, o null si no está: mismo id, mismo vídeo o la misma
 * canción con otra identidad (`album-…`, `preview-…`, `deezer:…`, `radio-…`).
 * `videoDe` permite mirar también el vídeo guardado en la caché de resolución.
 */
export function buscarEnBiblioteca(track, tracks, videoDe = (t) => t.youtubeVideoId) {
  if (!track) return null;
  const lista = tracks ?? [];
  const video = track.youtubeVideoId ?? null;
  // Primero lo barato (ids y vídeo); la comparación por título solo si no hubo suerte.
  return (
    lista.find((t) => t.id === track.id || (track.trackIdReal && t.id === track.trackIdReal) || (video && videoDe(t) === video)) ??
    lista.find((t) => esLaQueSuena(track, t)) ??
    null
  );
}

/** ¿Suena una canción de fuera que se puede añadir (con título y artista, y no está en la biblioteca)? */
export function esCancionExterna(track, tracks, videoDe) {
  if (!track?.titulo || !track?.artista) return false;
  return !buscarEnBiblioteca(track, tracks, videoDe);
}

/** ¿Está marcada como favorita la copia de la biblioteca de esta canción? */
export function esFavoritaEnBiblioteca(track, tracks, videoDe) {
  const real = buscarEnBiblioteca(track, tracks, videoDe) ?? track;
  return !!real?.ejes?.some((e) => e.ejeId === 'favoritos');
}
