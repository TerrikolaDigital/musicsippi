// src/movil/populares.js
// «Populares» en la ficha de un artista con pocas canciones propias: los éxitos de Deezer que aún no tienes.
import { claveDe } from './cancionSonando.js';
import { norm } from './inicio/claves.js';

export const MINIMO_PROPIAS = 5;
export const LIMITE_POPULARES = 10;

export const hacenFaltaPopulares = (nPropias) => nPropias < MINIMO_PROPIAS;

export function popularesSinLasPropias(canciones, propias) {
  const suyas = new Set(propias.map(claveDe));
  return canciones.filter((c) => !suyas.has(claveDe(c)));
}

// Pestaña con la que abre la ficha de un artista: sin canciones propias no hay nada que
// enseñar en «En tu biblioteca», así que se abre directamente en «Populares».
export const pestanaInicialArtista = (nPropias) => (nPropias === 0 ? 'populares' : 'biblioteca');

// Pista provisional de una canción de Deezer: suena al momento y se resuelve sola a YouTube.
function pistaProvisional(id, { artista, titulo }, coverUrl, album) {
  return {
    id: `album-${id}`,
    trackIdReal: id,
    artista,
    titulo,
    fuentes: ['album'],
    youtubeQuery: `${artista} ${titulo}`,
    youtubeVideoId: null,
    ejes: [],
    coverUrl: coverUrl ?? null,
    ...(album ? { album } : {}),
  };
}

// Las canciones populares del artista (Deezer) como cola reproducible: la copia real si ya
// está en la biblioteca y, si no, una provisional.
export function pistasDePopulares(canciones, tracks) {
  const porId = new Map(tracks.map((t) => [t.id, t]));
  return (canciones ?? []).map((c) => porId.get(c.trackId) ?? pistaProvisional(c.trackId, c, c.coverUrl, c.albumTitulo));
}

// Lo mismo para las canciones del cliente de Deezer ({ id, titulo, artista, cover, album? }).
export const pistasDeDeezer = (canciones) => (canciones ?? []).map((c) => pistaProvisional(c.id, c, c.cover, c.album));

/** Las de `resto` que no están en `cola`, sin repetir (por artista y título: quita también otras versiones). */
export function nuevasParaCola(cola, resto) {
  const vistas = new Set(cola.map(claveDe));
  return resto.filter((t) => {
    const k = claveDe(t);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/** Una por canción: entre repetidas gana la de la lista anterior (la copia de la biblioteca). */
export const unirCanciones = (...listas) => nuevasParaCola([], listas.flat());

export const claveArtista = (nombre) => norm(nombre);

// El botón aleatorio de un artista se marca si la cola salió de ese botón y sigue en aleatorio.
export const aleatorioDelArtista = ({ aleatorio, ejeActivo }, nombre) => !!aleatorio && ejeActivo?.origenArtista === claveArtista(nombre);
