// src/movil/ordenAlbumes.js
// Orden de la pestaña Álbumes de la Biblioteca: «Recientes» o «A-Z». Sin React.
// `indice` es la posición de la última canción del álbum en la biblioteca (más alto = añadido después).
export const ORDENES_ALBUMES = [
  ['recientes', 'Recientes'],
  ['az', 'A-Z'],
];

const CLAVE = 'musicsippi-orden-albumes';
const VALIDOS = new Set(ORDENES_ALBUMES.map(([id]) => id));
const POR_DEFECTO = 'recientes';

const comparar = (a, b) => (a ?? '').localeCompare(b ?? '', 'es', { sensitivity: 'base' });

/** Copia ordenada de `albumes` ({ titulo, artista, indice }). 'az': por título; otro valor: recientes primero. */
export function ordenarAlbumes(albumes, criterio) {
  return [...albumes].sort((a, b) => {
    if (criterio === 'az') return comparar(a.titulo, b.titulo) || comparar(a.artista, b.artista);
    return (b.indice ?? -1) - (a.indice ?? -1) || comparar(a.titulo, b.titulo);
  });
}

export function leerOrdenAlbumes(almacen = globalThis.localStorage) {
  try {
    const guardado = almacen?.getItem(CLAVE);
    return VALIDOS.has(guardado) ? guardado : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

export function guardarOrdenAlbumes(criterio, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE, criterio);
  } catch {
    // localStorage puede fallar (modo privado, cuota llena); no es crítico.
  }
}
