// Qué hace el reproductor al quitar una canción de la biblioteca: si es la que suena, no debe seguir sonando.

/**
 * 'siguiente' si suena y hay otra en la cola, 'parar' si es la única, 'nada' si no es la que suena.
 * Una canción añadida desde la búsqueda o la radio sigue en la cola con el id de la vista previa:
 * por eso también se compara el vídeo.
 */
export function accionAlQuitar(cola, indice, trackId, videoId = null) {
  const actual = cola[indice];
  if (!actual) return 'nada';
  const esLaQueSuena = (actual.trackIdReal ?? actual.id) === trackId || (videoId != null && actual.youtubeVideoId === videoId);
  if (!esLaQueSuena) return 'nada';
  return cola.length > 1 ? 'siguiente' : 'parar';
}
