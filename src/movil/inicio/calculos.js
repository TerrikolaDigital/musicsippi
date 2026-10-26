// src/movil/inicio/calculos.js
// Lógica pura de las secciones externas de Inicio (descubrimiento, novedades, tendencias,
// artistas parecidos). Reciben un cliente Deezer (`dz`, ver deezer.js) para poder probarlas con respuestas simuladas.
import { GENEROS_DEEZER } from '../../data/generos.js';
import { artistasDe, claveCancion, entrelazar, indiceBiblioteca, norm } from './claves.js';

const DIA_MS = 24 * 3600 * 1000;

/** Ejecuta `fn` sobre cada elemento sin que un fallo tumbe al resto; lanza solo si fallan todos. */
async function enParalelo(items, fn) {
  const r = await Promise.allSettled(items.map(fn));
  const buenos = r.filter((x) => x.status === 'fulfilled').map((x) => x.value);
  if (items.length > 0 && buenos.length === 0) throw r[0].reason ?? new Error('sin resultados');
  return buenos;
}

/** Artistas de la biblioteca (nombre suelto, sin colaboraciones) más escuchados, sin repetir. */
export function artistasSemilla(listas, max) {
  const vistos = new Set();
  const salida = [];
  for (const lista of listas) {
    for (const a of lista ?? []) {
      const nombre = artistasDe(a.nombre)[0] ?? a.nombre;
      const k = norm(nombre);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      salida.push(nombre);
      if (salida.length >= max) return salida;
    }
  }
  return salida;
}

// ---- Descubrimiento semanal --------------------------------------------------------

/**
 * Canciones de artistas parecidos a las semillas. Devuelve hasta `max` candidatas (se filtrarán
 * contra la biblioteca al mostrarlas, que puede haber cambiado desde que se calcularon).
 */
export async function calcularDescubrimiento({ semillas, dz, tracks, max = 40, porSemilla = 3, porArtista = 3 }) {
  const { canciones, artistas } = indiceBiblioteca(tracks);
  const listas = await enParalelo(semillas, async (nombre) => {
    const art = await dz.buscarArtista(nombre);
    if (!art) return [];
    const relacionados = (await dz.relacionados(art.id, 12)).filter((r) => norm(r.nombre) !== norm(nombre));
    // Primero los que aún no se escuchan en la biblioteca: de ahí sale lo realmente nuevo.
    relacionados.sort((a, b) => Number(artistas.has(norm(a.nombre))) - Number(artistas.has(norm(b.nombre))));
    const elegidos = relacionados.slice(0, porSemilla);
    const tops = await Promise.allSettled(elegidos.map((r) => dz.top(r.id, 8)));
    const propias = tops
      .filter((t) => t.status === 'fulfilled')
      .map((t) => t.value.filter((c) => !canciones.has(claveCancion(c.artista, c.titulo))).slice(0, porArtista));
    return entrelazar(propias, (c) => c.id, 99);
  });
  return entrelazar(listas, (c) => claveCancion(c.artista, c.titulo), max);
}

/** Quita lo que ya está en la biblioteca y recorta. */
export function sinLoQueTengo(items, tracks, max) {
  const { canciones } = indiceBiblioteca(tracks);
  return items.filter((c) => !canciones.has(claveCancion(c.artista, c.titulo))).slice(0, max);
}

// ---- Lo nuevo de tus artistas ------------------------------------------------------

export const DIAS_NOVEDADES = 60;

/** Álbumes lanzados en los últimos `dias` (sin futuros), del más reciente al más antiguo, sin repetidos. */
export function albumesRecientes(albumes, ahora = Date.now(), dias = DIAS_NOVEDADES) {
  const desde = ahora - dias * DIA_MS;
  const vistos = new Set();
  return albumes
    .map((a) => ({ ...a, ms: a.fecha ? Date.parse(`${a.fecha}T12:00:00`) : NaN }))
    .filter((a) => Number.isFinite(a.ms) && a.ms >= desde && a.ms <= ahora + DIA_MS)
    .sort((a, b) => b.ms - a.ms)
    .filter((a) => {
      const k = `${norm(a.artista)}|${norm(a.titulo)}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

export async function calcularNovedades({ artistas, dz, ahora = Date.now(), max = 20 }) {
  const listas = await enParalelo(artistas, async (nombre) => {
    const art = await dz.buscarArtista(nombre);
    return art ? albumesRecientes(await dz.albumes(art.id, art.nombre), ahora) : [];
  });
  return listas
    .flat()
    .sort((a, b) => b.ms - a.ms)
    .filter((a, i, todos) => todos.findIndex((b) => norm(b.artista) === norm(a.artista) && norm(b.titulo) === norm(a.titulo)) === i)
    .slice(0, max);
}

/** «Hoy», «Ayer», «Hace 3 días», «Hace 2 semanas», «Hace 1 mes». */
export function haceTexto(ms, ahora = Date.now()) {
  const dias = Math.max(0, Math.floor((ahora - ms) / DIA_MS));
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 14) return `Hace ${dias} días`;
  if (dias < 60) return `Hace ${Math.floor(dias / 7)} semanas`;
  const meses = Math.floor(dias / 30);
  return `Hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

// ---- Tendencias en tu estilo -------------------------------------------------------

// Palabras de un modo -> id de género de Deezer (ver data/generos.js).
const ALIAS_GENEROS = [
  [/\b(reggaeton|urbano|perreo|dembow)\b/, '122'],
  [/\b(rap|hip hop|hiphop|trap|drill)\b/, '116'],
  [/\b(r b|rnb|r&b)\b/, '165'],
  [/\b(soul|funk|motown)\b/, '169'],
  [/\b(electro|electronica|electronic|edm|techno|house)\b/, '106'],
  [/\b(dance|disco|club)\b/, '113'],
  [/\b(alternativ[oa]|indie)\b/, '85'],
  [/\b(rock|punk|grunge)\b/, '152'],
  [/\b(metal|hardcore)\b/, '464'],
  [/\b(pop)\b/, '132'],
  [/\b(folk|country|acustic[oa])\b/, '466'],
  [/\b(reggae|ska|dub)\b/, '144'],
  [/\b(jazz)\b/, '129'],
  [/\b(salsa|bachata|merengue)\b/, '67'],
  [/\b(clasica|classical|orquesta)\b/, '98'],
  [/\b(blues)\b/, '153'],
  [/\b(cumbia)\b/, '71'],
  [/\b(latin[oa]?)\b/, '197'],
];

const NOMBRES_GENERO = new Map(GENEROS_DEEZER.map((g) => [g.id, g.nombre]));
export const nombreGenero = (id) => NOMBRES_GENERO.get(id) ?? '';

/** Ids de género de Deezer de los modos con más canciones (hasta `max`); ['0'] si ninguno encaja. */
export function generosDeModos(ejes, conteos, max = 3) {
  const modos = (ejes ?? [])
    .filter((e) => e.tipo === 'gusto' && !e.sistema && e.activo !== false && (conteos.get(e.id) ?? 0) > 0)
    .sort((a, b) => (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0));
  const ids = [];
  for (const m of modos) {
    const n = ` ${String(m.nombre ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `;
    const hit = ALIAS_GENEROS.find(([re]) => re.test(n));
    if (hit && !ids.includes(hit[1])) ids.push(hit[1]);
    if (ids.length >= max) break;
  }
  return ids.length ? ids : ['0'];
}

export async function calcularTendencias({ generos, dz, max = 30 }) {
  const listas = await enParalelo(generos, (g) => dz.chart(g, 30));
  return entrelazar(listas, (c) => claveCancion(c.artista, c.titulo), max);
}

// ---- También te podría gustar ------------------------------------------------------

/** Artistas parecidos a las semillas que no están en la biblioteca; primero los que salen en más listas. */
export async function calcularParecidos({ semillas, dz, tracks, max = 16 }) {
  const { artistas } = indiceBiblioteca(tracks);
  const listas = await enParalelo(semillas, async (nombre) => {
    const art = await dz.buscarArtista(nombre);
    return art ? dz.relacionados(art.id, 12) : [];
  });
  const cuenta = new Map();
  listas.forEach((lista) => {
    lista.forEach((a, i) => {
      const k = norm(a.nombre);
      if (!k || artistas.has(k)) return;
      const e = cuenta.get(k) ?? { artista: a, veces: 0, pos: 0 };
      e.veces += 1;
      e.pos += i;
      cuenta.set(k, e);
    });
  });
  return [...cuenta.values()]
    .sort((x, y) => y.veces - x.veces || x.pos - y.pos || y.artista.fans - x.artista.fans)
    .slice(0, max)
    .map((e) => e.artista);
}
