// src/movil/populares.js
// «Populares» en la ficha de un artista con pocas canciones propias: los éxitos de Deezer que aún no tienes.
import { claveCancion } from './inicio/claves.js';
import { primerArtista } from './albumLocal.js';

const clave = (t) => claveCancion(primerArtista(t.artista), t.titulo);

export const MINIMO_PROPIAS = 5;
export const LIMITE_POPULARES = 10;

export const hacenFaltaPopulares = (nPropias) => nPropias < MINIMO_PROPIAS;

export function popularesSinLasPropias(canciones, propias) {
  const suyas = new Set(propias.map((t) => clave(t)));
  return canciones.filter((c) => !suyas.has(clave(c)));
}

// Pestaña con la que abre la ficha de un artista: sin canciones propias no hay nada que
// enseñar en «En tu biblioteca», así que se abre directamente en «Populares».
export const pestanaInicialArtista = (nPropias) => (nPropias === 0 ? 'populares' : 'biblioteca');

// Las canciones populares del artista (Deezer) como cola reproducible: la copia real si ya
// está en la biblioteca y, si no, una provisional que se resuelve sola a YouTube al sonar.
export function pistasDePopulares(canciones, tracks) {
  const porId = new Map(tracks.map((t) => [t.id, t]));
  return (canciones ?? []).map((c) => {
    const real = porId.get(c.trackId);
    if (real) return real;
    return {
      id: `album-${c.trackId}`,
      trackIdReal: c.trackId,
      artista: c.artista,
      titulo: c.titulo,
      fuentes: ['album'],
      youtubeQuery: `${c.artista} ${c.titulo}`,
      youtubeVideoId: null,
      ejes: [],
      coverUrl: c.coverUrl ?? null,
    };
  });
}
