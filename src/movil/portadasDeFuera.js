// src/movil/portadasDeFuera.js
// Canciones de fuera de la biblioteca (vistas previas, radio): la entrada del historial no guardó carátula, así
// que se busca la de la misma canción en la biblioteca y, si no, la miniatura del vídeo (`coverRespaldo`).
// Pura y compartida por Historial del móvil y «Recientes» del escritorio.

const clave = (t) => `${String(t.titulo ?? '').trim().toLowerCase()}|${String(t.artista ?? '').trim().toLowerCase()}`;

/** @returns {(track:object)=>{coverUrl:string|null, coverRespaldo:string|null}} */
export function crearMetaDeFuera({ tracks, metadataDe }) {
  const m = new Map();
  for (const t of tracks) {
    const url = metadataDe(t.trackIdReal ?? t.id)?.coverUrl ?? t.coverUrl;
    if (typeof url === 'string' && url.startsWith('http') && !m.has(clave(t))) m.set(clave(t), url);
  }
  return (track) => ({
    coverUrl: track.coverUrl ?? m.get(clave(track)) ?? null,
    coverRespaldo: metadataDe(track.trackIdReal ?? track.id)?.coverRespaldo ?? null,
  });
}
