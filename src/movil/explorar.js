// src/movil/explorar.js
// Buscar > Explorar por género (móvil). Lógica pura sobre la API pública de Deezer.
// Ojo: `chart/<id>/artists` y `genre/<id>/artists` devuelven SIEMPRE los mismos artistas globales
// (comprobado con red real), así que los artistas de un género se sacan de sus canciones y álbumes.
// Los géneros que Deezer no tiene como tal (Rock en español, House, Soundtracks, Instrumental)
// salen de playlists editoriales: `search/playlist?q=` y luego `playlist/<id>/tracks`.
import { norm } from './inicio/claves.js';

/** charts: ids de género de Deezer (`chart/<id>/tracks|albums`). listas: búsquedas de playlists editoriales. */
export const GENEROS_EXPLORAR = [
  { id: 'todos', nombre: 'Todos', charts: ['0'] },
  { id: 'pop', nombre: 'Pop', charts: ['132'] },
  { id: 'rock', nombre: 'Rock', charts: ['152'] },
  { id: 'rock-es', nombre: 'Rock en español', listas: ['rock en español'] },
  { id: 'latino', nombre: 'Latino', charts: ['197'] },
  { id: 'reggaeton', nombre: 'Reggaetón', charts: ['122'], listas: ['reggaeton hits'] },
  { id: 'electronica', nombre: 'Electrónica', charts: ['106'] },
  { id: 'house', nombre: 'House', listas: ['fresh house', 'tech house'] },
  { id: 'dance', nombre: 'Dance', charts: ['113'] },
  { id: 'hiphop', nombre: 'Hip hop / Rap', charts: ['116'] },
  { id: 'rnb', nombre: 'R&B / Soul', charts: ['165', '169'] },
  { id: 'indie', nombre: 'Indie / Alternativo', charts: ['85'], listas: ['indie rock essentials'] },
  { id: 'jazz', nombre: 'Jazz', charts: ['129'] },
  { id: 'clasica', nombre: 'Clásica', charts: ['98'] },
  { id: 'soundtracks', nombre: 'Soundtracks', listas: ['soundtracks', 'film classics'] },
  { id: 'instrumental', nombre: 'Instrumental', listas: ['piano instrumental', 'instrumental chill'] },
];

export const generoPorId = (id) => GENEROS_EXPLORAR.find((g) => g.id === id) ?? GENEROS_EXPLORAR[0];

export const MAX_ARTISTAS = 20;
export const MAX_ALBUMES = 12; // 4 filas de 3
export const MAX_CANCIONES = 10; // 5 filas de 2
const POR_CHART = 50;
const POR_LISTA = 60;
const LISTAS_POR_BUSQUEDA = 2;

/** Playlists editoriales («... Editor» de Deezer) primero; sin ellas, las primeras con contenido. */
export function elegirListas(json, cuantas = LISTAS_POR_BUSQUEDA) {
  const buenas = (json?.data ?? []).filter((p) => p?.id && (p.nb_tracks ?? 0) >= 25);
  const editorial = buenas.filter((p) => /deezer/i.test(p.user?.name ?? ''));
  return (editorial.length >= cuantas ? editorial : [...editorial, ...buenas.filter((p) => !editorial.includes(p))]).slice(0, cuantas);
}

const cover = (a) => a?.cover_medium ?? a?.cover_big ?? null;
const foto = (a) => a?.picture_medium ?? a?.picture_big ?? null;

/** Canción de Deezer con lo que hace falta de su álbum y artista (null si le falta algo). */
export function leerCancion(t) {
  if (!t?.id || !t.title || !t.artist?.name) return null;
  return {
    id: `deezer-${t.id}`,
    titulo: t.title,
    artista: t.artist.name,
    cover: cover(t.album),
    artistaInfo: { id: t.artist.id, nombre: t.artist.name, foto: foto(t.artist) },
    albumInfo: t.album?.id && t.album.title ? { id: `deezer-album-${t.album.id}`, titulo: t.album.title, artista: t.artist.name, cover: cover(t.album) } : null,
  };
}

function leerAlbum(a) {
  const nombre = a?.artist?.name;
  if (!a?.id || !a.title || !nombre) return null;
  return {
    albumInfo: { id: `deezer-album-${a.id}`, titulo: a.title, artista: nombre, cover: cover(a) },
    artistaInfo: { id: a.artist.id, nombre, foto: foto(a.artist) },
  };
}

/**
 * Junta lo que han devuelto las fuentes de un género.
 * @param {{ canciones: any[], albumes: any[] }} crudo respuestas de Deezer, en orden de relevancia
 */
export function armarGenero({ canciones, albumes }) {
  const cs = [];
  const idsC = new Set();
  const alb = new Map(); // id -> álbum con peso
  const art = new Map(); // nombre normalizado -> artista con peso
  let orden = 0;
  const sumarArtista = (info, peso) => {
    if (!info?.nombre) return;
    const k = norm(info.nombre);
    const a = art.get(k) ?? { id: info.id, nombre: info.nombre, foto: info.foto, peso: 0, orden: orden++ };
    a.peso += peso;
    a.foto ??= info.foto;
    art.set(k, a);
  };
  const sumarAlbum = (info, peso) => {
    if (!info) return;
    const a = alb.get(info.id) ?? { ...info, peso: 0, orden: orden++ };
    a.peso += peso;
    alb.set(info.id, a);
  };
  for (const raw of albumes) {
    const a = leerAlbum(raw);
    if (!a) continue;
    sumarAlbum(a.albumInfo, 3); // los álbumes de la lista oficial pesan más que los que asoman en canciones
    sumarArtista(a.artistaInfo, 2);
  }
  for (const raw of canciones) {
    const c = leerCancion(raw);
    if (!c || idsC.has(c.id)) continue;
    idsC.add(c.id);
    cs.push({ id: c.id, titulo: c.titulo, artista: c.artista, cover: c.cover });
    sumarArtista(c.artistaInfo, 1);
    sumarAlbum(c.albumInfo, 1);
  }
  const porPeso = (a, b) => b.peso - a.peso || a.orden - b.orden;
  return {
    canciones: cs.slice(0, MAX_CANCIONES * 2), // margen por si «No me gusta» quita alguna
    albumes: [...alb.values()].sort(porPeso).slice(0, MAX_ALBUMES).map(({ id, titulo, artista, cover: c }) => ({ id, titulo, artista, cover: c })),
    artistas: [...art.values()].sort(porPeso).slice(0, MAX_ARTISTAS).map(({ id, nombre, foto: f }) => ({ id, nombre, foto: f })),
  };
}

/** Rutas que se piden para un género: charts = [canciones, álbumes] por cada id; busquedas = playlists. */
export function rutasDe(genero) {
  return {
    charts: (genero.charts ?? []).flatMap((id) => [`/chart/${id}/tracks?limit=${POR_CHART}`, `/chart/${id}/albums?limit=${POR_CHART}`]),
    busquedas: (genero.listas ?? []).map((q) => `/search/playlist?q=${encodeURIComponent(q)}&limit=10`),
  };
}

/**
 * Todo lo de un género. `pedir(ruta)` devuelve el JSON de Deezer. Si no llega nada, lanza.
 * @returns {Promise<{ canciones: any[], albumes: any[], artistas: any[] }>}
 */
export async function cargarGenero(genero, pedir) {
  const { charts, busquedas } = rutasDe(genero);
  const intentar = (ruta) => pedir(ruta).catch(() => null);
  const [respCharts, respBusquedas] = await Promise.all([Promise.all(charts.map(intentar)), Promise.all(busquedas.map(intentar))]);
  const listas = (await Promise.all(respBusquedas.flatMap((b) => elegirListas(b).map((p) => intentar(`/playlist/${p.id}/tracks?limit=${POR_LISTA}`))))).map(
    (r) => r?.data ?? [],
  );
  // Primero lo oficial de cada género y luego las playlists.
  const canciones = [...respCharts.filter((_, i) => i % 2 === 0).flatMap((r) => r?.data ?? []), ...listas.flat()];
  const albumes = respCharts.filter((_, i) => i % 2 === 1).flatMap((r) => r?.data ?? []);
  const r = armarGenero({ canciones, albumes });
  if (r.canciones.length === 0 && r.albumes.length === 0) throw new Error('Deezer no devolvió contenido para este género');
  return r;
}

/** Artistas parecidos a los del usuario (nombres normalizados) primero y marcados `paraTi`; el resto, en su orden. */
export function ordenarArtistas(artistas, parecidos) {
  const marcados = artistas.map((a) => ({ ...a, paraTi: parecidos.has(norm(a.nombre)) }));
  return [...marcados.filter((a) => a.paraTi), ...marcados.filter((a) => !a.paraTi)];
}
