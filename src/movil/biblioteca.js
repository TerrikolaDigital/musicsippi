// src/movil/biblioteca.js
// Lógica de la pestaña Biblioteca, sin React: qué pestañas hay, cómo pedir una
// desde fuera (p. ej. «Ver todo» de «Tus artistas») y cómo se filtran las canciones.
export const PESTANAS_BIBLIOTECA = [
  ['canciones', 'Canciones'],
  ['artistas', 'Artistas'],
  ['albumes', 'Álbumes'],
];

const IDS = PESTANAS_BIBLIOTECA.map(([id]) => id);

// Pestaña que otra pantalla ha pedido abrir; se consume al montar la Biblioteca.
let pedida = null;

/** `favoritas` solo vale para «canciones»: la abre con el filtro ♥ puesto. */
export function pedirPestanaBiblioteca(id, { favoritas = false } = {}) {
  pedida = IDS.includes(id) ? { pestana: id, favoritas: id === 'canciones' && favoritas } : null;
}

export function tomarPestanaBiblioteca() {
  const p = pedida ?? { pestana: 'canciones', favoritas: false };
  pedida = null;
  return p;
}

const colador = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Canciones por título (sin tildes ni mayúsculas); si `soloFavoritas`, solo las de `favoritasIds`. */
export function cancionesDeBiblioteca(tracks, { soloFavoritas = false, favoritasIds = new Set() } = {}) {
  const lista = soloFavoritas ? tracks.filter((t) => favoritasIds.has(t.id)) : [...tracks];
  return lista.sort((a, b) => colador.compare(a.titulo ?? '', b.titulo ?? ''));
}

/**
 * Qué pistas de un álbum (las de la fuente externa) ya están en la biblioteca:
 * por id o, si el id no coincide, por artista+título sin acentos ni mayúsculas.
 * Devuelve { faltan, ids }: las que faltan y los ids de la biblioteca que corresponden al álbum.
 */
export function estadoAlbumEnBiblioteca(pistas, tracks, norm) {
  const porId = new Map(tracks.map((t) => [t.id, t]));
  const porTitulo = new Map(tracks.map((t) => [`${norm(t.artista)}|${norm(t.titulo)}`, t]));
  const ids = new Set();
  const faltan = [];
  for (const p of pistas) {
    const t = porId.get(p.trackId) ?? porTitulo.get(`${norm(p.artista)}|${norm(p.titulo)}`);
    if (t) ids.add(t.id);
    else faltan.push(p);
  }
  return { faltan, ids: [...ids] };
}
