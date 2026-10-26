// src/movil/ordenArtistas.js
// Orden de la pestaña Artistas de la Biblioteca: «Más canciones» o «A-Z». Sin React.
// La elección se guarda en localStorage, como el resto de preferencias del móvil.
export const ORDENES_ARTISTAS = [
  ['canciones', 'Más canciones'],
  ['az', 'A-Z'],
];

const CLAVE = 'musicsippi-orden-artistas';
const VALIDOS = new Set(ORDENES_ARTISTAS.map(([id]) => id));
const POR_DEFECTO = 'canciones';

// Sin distinguir tildes ni mayúsculas.
const comparar = (a, b) => (a ?? '').localeCompare(b ?? '', 'es', { sensitivity: 'base' });

/**
 * Copia ordenada de `artistas` ({ nombre, cantidad }).
 * `criterio` 'az': por nombre. Cualquier otro valor: más canciones primero y, en empate, por nombre.
 */
export function ordenarArtistas(artistas, criterio) {
  return [...artistas].sort((a, b) => {
    if (criterio === 'az') return comparar(a.nombre, b.nombre);
    return b.cantidad - a.cantidad || comparar(a.nombre, b.nombre);
  });
}

export function leerOrdenArtistas(almacen = globalThis.localStorage) {
  try {
    const guardado = almacen?.getItem(CLAVE);
    return VALIDOS.has(guardado) ? guardado : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

export function guardarOrdenArtistas(criterio, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE, criterio);
  } catch {
    // localStorage puede fallar (modo privado, cuota llena); no es crítico.
  }
}
