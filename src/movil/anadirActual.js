// src/movil/anadirActual.js
// Canción que suena y no está en la biblioteca (vista previa de Buscar, tarjeta de
// Inicio, radio de YouTube…): el reproductor y el mini ofrecen «Añadir» para guardarla.
// Puro.

/** ¿Suena una canción de fuera que se puede añadir (tiene vídeo y no está en la biblioteca)? */
export function esCancionExterna(track, tracks) {
  if (!track?.youtubeVideoId) return false;
  return !(tracks ?? []).some((t) => t.id === track.id || (track.trackIdReal && t.id === track.trackIdReal));
}
