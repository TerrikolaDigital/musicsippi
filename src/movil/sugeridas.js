// src/movil/sugeridas.js
// «Canciones sugeridas» al final de un mood: mezcla de éxitos de los artistas que más se repiten en la
// lista y de artistas relacionados (Deezer), sin lo que ya está en la biblioteca, paginado de 10 en 10.
// Lógica pura: el cliente Deezer (`dz`) se inyecta para poder probarla con respuestas simuladas.
import { artistasDe, claveCancion, entrelazar, norm } from './inicio/claves.js';
import { popularesSinLasPropias } from './populares.js';

export const POR_PAGINA = 10;
export const MAX_POOL = 40;
export const MAX_SEMILLAS = 5;
const SEMILLAS_RELACIONADOS = 3;
const MAX_RELACIONADOS = 4;

/** Los artistas (nombre suelto, sin colaboraciones) que más se repiten en la lista; hasta `max`, por número de canciones. */
export function semillasDe(tracks, max = MAX_SEMILLAS) {
  const cuenta = new Map();
  for (const t of tracks ?? []) {
    const nombre = artistasDe(t.artista)[0];
    const k = norm(nombre);
    if (!k) continue;
    const e = cuenta.get(k) ?? { nombre, veces: 0 };
    e.veces += 1;
    cuenta.set(k, e);
  }
  // Orden estable: más canciones primero y, a igualdad, el que apareció antes.
  return [...cuenta.values()].sort((a, b) => b.veces - a.veces).slice(0, max).map((e) => e.nombre);
}

/** Identifica el conjunto de semillas (clave de caché): no depende del orden. */
export const firmaSemillas = (semillas) => semillas.map(norm).sort().join('+');

const clave = (c) => claveCancion(c.artista, c.titulo);

/** Mezcla las dos mitades (propias de los artistas y de relacionados) alternando, sin repetir. */
export function mezclarSugeridas(delasSemillas, delosRelacionados, max = MAX_POOL) {
  const mitad = Math.ceil(max / 2);
  const a = entrelazar(delasSemillas, clave, mitad);
  const b = entrelazar(delosRelacionados, clave, mitad);
  return entrelazar([a, b], clave, max);
}

/** Candidatas visibles: el pool sin lo que ya está en la biblioteca. */
export const sinLasPropias = (pool, tracks) => popularesSinLasPropias(pool ?? [], tracks ?? []);

/** ¿Hay material para ofrecer «Otras sugerencias»? (al menos dos páginas) */
export const haceFaltaOtras = (n, porPagina = POR_PAGINA) => n >= porPagina * 2;

/** La página `pagina` (0, 1, 2…) de la lista, dando la vuelta al llegar al final. */
export function paginaDe(lista, pagina, porPagina = POR_PAGINA) {
  const n = lista.length;
  if (n <= porPagina) return lista.slice();
  const inicio = (pagina * porPagina) % n;
  return Array.from({ length: porPagina }, (_, i) => lista[(inicio + i) % n]);
}

/** Cómo se asigna una canción nueva al mood: Favoritos y las playlists son colecciones; el resto, modos. */
export const viaDeAsignacion = (eje) => (eje?.id === 'favoritos' || eje?.tipo === 'playlist' ? 'coleccion' : 'eje');

async function algunas(items, fn) {
  const r = await Promise.allSettled(items.map(fn));
  const buenos = r.filter((x) => x.status === 'fulfilled' && x.value).map((x) => x.value);
  if (items.length > 0 && r.every((x) => x.status === 'rejected')) throw r[0].reason ?? new Error('sin resultados');
  return buenos;
}

/**
 * Construye el pool: éxitos de los artistas semilla + éxitos de artistas relacionados de las primeras semillas.
 * Lanza si Deezer falla del todo; los fallos sueltos se ignoran.
 */
export async function calcularSugeridas({ semillas, dz, max = MAX_POOL }) {
  const propias = await algunas(semillas, async (nombre) => {
    const artista = await dz.buscarArtista(nombre);
    return artista ? { artista, top: await dz.top(artista.id, 10) } : null;
  });
  const vistos = new Set(semillas.map(norm));
  const cuenta = new Map();
  const listas = await algunas(propias.slice(0, SEMILLAS_RELACIONADOS), (p) => dz.relacionados(p.artista.id, 10));
  listas.forEach((lista) =>
    lista.forEach((a, i) => {
      const k = norm(a.nombre);
      if (!k || vistos.has(k)) return;
      const e = cuenta.get(k) ?? { artista: a, veces: 0, pos: 0 };
      e.veces += 1;
      e.pos += i;
      cuenta.set(k, e);
    }),
  );
  const elegidos = [...cuenta.values()]
    .sort((x, y) => y.veces - x.veces || x.pos - y.pos || y.artista.fans - x.artista.fans)
    .slice(0, MAX_RELACIONADOS)
    .map((e) => e.artista);
  const relacionadas = await algunas(elegidos, (a) => dz.top(a.id, 6)).catch(() => []);
  return mezclarSugeridas(
    propias.map((p) => p.top),
    relacionadas,
    max,
  );
}
