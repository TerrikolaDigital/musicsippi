// src/data/reproduccion-local.js
import { obtenerClaveYoutube } from './configuracion.js';
import {
  obtenerPorClave,
  guardarRegistro,
  guardarVarios,
  obtenerTodos,
  borrarRegistro,
  obtenerValorConfig,
  guardarValorConfig,
} from './lib/db.js';
import cacheSemilla from '../../data/cache-youtube.json';
import { entradasSemillaQueFaltan } from './lib/semilla-cache.js';

import { Capacitor } from '@capacitor/core';

const BASE = 'https://www.googleapis.com/youtube/v3';

// En la app Android se busca con youtubei.js (YouTube Music, tipo canción)
// por HTTP nativo: sin clave ni cuota diaria. La PWA sigue con la Data API
// porque desde un navegador youtubei.js choca con CORS.
const ES_NATIVO = Capacitor.isNativePlatform();
let fetchNativo = null;

async function buscarNativo(query, max) {
  const { buscarCanciones, crearFetchNativo } = await import('./audio-nativo.js');
  fetchNativo ??= crearFetchNativo();
  try {
    return { canciones: await buscarCanciones(query, { fetch: fetchNativo, max }) };
  } catch (e) {
    return { error: 'error_red', detalle: String(e?.message ?? e) };
  }
}

// VOCABULARIO DE ERRORES — tiene que ser el MISMO que emite el modo servidor
// (`sin_api_key` / `youtube_error` en vite.config.js), porque quien los
// interpreta es App.jsx y no sabe en qué modo está corriendo.
//
// Este módulo devolvía antes códigos propios con guiones medios
// ('sin-clave-configurada', 'cuota-agotada', 'red-fallo',
// 'error-desconocido'). Ninguno coincidía, así que TODOS caían al `else`
// genérico de App.jsx, que significa "YouTube no tiene esta canción puntual,
// saltala" — y la app desfilaba por la cola entera en silencio en vez de
// avisar que faltaba la clave. Justo lo que el comentario de App.jsx advertía
// que no debía pasar ("saltar fallaría en cadena por TODA la cola").
//
// Todos estos son SISTÉMICOS: afectan a cualquier track que intente resolver,
// no a uno en particular. Ninguno debe saltar la canción.
function esCuotaAgotada(cuerpoError) {
  return (cuerpoError?.error?.errors ?? []).some((e) => e.reason === 'quotaExceeded');
}

async function buscarEnDataApi(query, maxResultados) {
  const clave = await obtenerClaveYoutube();
  if (!clave) return { error: 'sin_api_key' };

  const url = `${BASE}/search?part=snippet&type=video&videoCategoryId=10&maxResults=${maxResultados}&q=${encodeURIComponent(query)}&key=${clave}`;
  let r;
  try {
    r = await fetch(url);
  } catch (e) {
    // Fallo a nivel de red (sin conexión, DNS, TLS) — no un status HTTP de
    // error (eso ya lo maneja el !r.ok de abajo). Sin este catch, un celu
    // que pierde conexión a mitad de una búsqueda tira un unhandled
    // rejection en vez de un resultado tipado que el caller pueda manejar
    // igual que 'sin-clave-configurada'/'cuota-agotada'.
    return { error: 'error_red', detalle: String(e) };
  }
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => null);
    // La cuota agotada tiene código propio y no se pliega a youtube_error: es
    // el fallo MÁS probable de este modo (10.000 unidades/día ÷ 100 que cuesta
    // cada búsqueda = ~100 canciones nuevas por día) y necesita un mensaje que
    // diga "volvé mañana", no un "error al buscar" que suena a algo roto.
    if (esCuotaAgotada(cuerpo)) return { error: 'cuota_agotada' };
    return { error: 'youtube_error', detalle: cuerpo };
  }
  return r.json();
}

/**
 * Copia las resoluciones ya conocidas (trackId -> videoId) a IndexedDB la
 * primera vez, igual que `asegurarEjesSembrados` hace con los ejes.
 *
 * Sin esto el store arranca VACÍO, y como ningún track de biblioteca.json
 * trae `youtubeVideoId` (0 de 2292 — los ids viven solo en este caché), cada
 * canción exigía una búsqueda contra la Data API. Sin clave configurada eso
 * fallaba, y la app desfilaba por la cola entera sin reproducir nada.
 *
 * ALCANCE, PARA NO CONFUNDIRSE: esto sirve porque el build lleva una
 * biblioteca ya resuelta por el escritorio (InnerTube). Para un usuario que
 * carga SU propia música el caché nace vacío igual, y ahí el problema de
 * fondo sigue en pie: resolver desde un navegador exige clave propia y tope
 * de ~100 canciones por día. Esta semilla comparte destino con los otros dos
 * imports estáticos (biblioteca.json y ejes.json): cuando se corten para
 * hacer el build distribuible, los tres se reemplazan por el mismo mecanismo
 * (carga del usuario + sync desde el escritorio, que es de donde estas
 * resoluciones deberían llegar).
 */
async function asegurarCacheSembrado() {
  if (await obtenerValorConfig('cacheYoutubeSembrado', false)) return;
  const existentes = new Set((await obtenerTodos('cacheYoutube')).map((c) => c.trackId));
  await guardarVarios('cacheYoutube', entradasSemillaQueFaltan(cacheSemilla, existentes));
  await guardarValorConfig('cacheYoutubeSembrado', true);
}

// Espejo local de videos-descartados.json del modo servidor: ids que fallaron
// de verdad en ESTE dispositivo. Va en el store genérico `configuracion` y no
// en uno propio para no tener que subir la versión del esquema de IndexedDB
// por un índice que es puramente reconstruible.
const CLAVE_DESCARTADOS = 'videosDescartados';

async function leerDescartados() {
  return (await obtenerValorConfig(CLAVE_DESCARTADOS, null)) ?? {};
}

export async function descartarVideo(trackId, videoId) {
  const mapa = await leerDescartados();
  const previos = Object.hasOwn(mapa, trackId) && Array.isArray(mapa[trackId]) ? mapa[trackId] : [];
  if (!previos.includes(videoId)) {
    await guardarValorConfig(CLAVE_DESCARTADOS, { ...mapa, [trackId]: [...previos, videoId] });
  }
  // Se saca del caché: si no, la próxima resolución lo devolvería igual y el
  // track quedaría roto de por vida, que es exactamente el fallo que esto
  // viene a arreglar.
  const cacheado = await obtenerPorClave('cacheYoutube', trackId);
  if (cacheado?.videoId === videoId) await borrarRegistro('cacheYoutube', trackId);
  return { ok: true };
}

// Solo lectura del caché: para compartir no se lanza ninguna resolución.
export async function videoIdCacheado(trackId) {
  const cacheado = await obtenerPorClave('cacheYoutube', trackId);
  return cacheado?.videoId ?? null;
}

// ---- Elección de versión (como el TrackMatcher de BitChord) -----------------
// YouTube Music devuelve la de estudio casi siempre primero, pero no siempre:
// directos, remixes, versiones extendidas o de otro artista. Se puntúa cada
// candidato por título, artista y duración contra lo que sabemos del track.
// La duración penaliza pero no descarta: mejor una versión rara que silencio.

const VARIANTES = /\b(live|en vivo|en directo|directo|remix|karaoke|cover|instrumental|sped up|slowed|acoustic|acustic[oa]|8d|nightcore|reverb)\b/;

function normalizar(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\((?:feat|ft|with|con)[^)]*\)|\[(?:feat|ft)[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sinParentesis(s) {
  return normalizar(String(s ?? '').replace(/[([][^)\]]*[)\]]/g, ' '));
}

function parecido(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.75;
  const ta = new Set(a.split(' '));
  const tb = b.split(' ');
  const comunes = tb.filter((t) => ta.has(t)).length;
  return comunes / Math.max(ta.size, tb.length);
}

let metadataPromesa = null;
async function referenciaDelTrack(trackId) {
  try {
    const track = await obtenerPorClave('biblioteca', trackId);
    if (!track) return null;
    metadataPromesa ??= import('./biblioteca-local.js').then((m) => m.obtenerMetadata());
    const meta = (await metadataPromesa).tracks?.[trackId];
    return { titulo: track.titulo, artista: track.artista, duracionS: meta?.duracionMs ? meta.duracionMs / 1000 : null };
  } catch {
    return null;
  }
}

function puntuar(c, ref) {
  let p = 2 * parecido(sinParentesis(ref.titulo), sinParentesis(c.titulo));
  const artistaRef = normalizar(ref.artista);
  p += 1.5 * Math.max(0, ...c.artistas.map((a) => parecido(artistaRef, normalizar(a))));
  if (ref.duracionS && c.duracion) {
    const dif = Math.abs(ref.duracionS - c.duracion);
    p += dif <= 3 ? 1.5 : dif <= 10 ? 0.9 : dif <= 30 ? 0.2 : -1.5;
  }
  // Directo/remix/etc. solo si el track original también lo es.
  const variante = VARIANTES.exec(normalizar(c.titulo));
  if (variante && !normalizar(ref.titulo).includes(variante[1])) p -= 1.5;
  return p;
}

function ordenarPorParecido(canciones, ref) {
  if (!ref) return canciones;
  return canciones
    .map((c, i) => ({ c, i, p: puntuar(c, ref) }))
    // Empate: se respeta el orden de YouTube Music (su relevancia ya cuenta).
    .sort((x, y) => y.p - x.p || x.i - y.i)
    .map((x) => x.c);
}

export async function resolverVideoId(query, trackId) {
  await asegurarCacheSembrado();
  const mapa = await leerDescartados();
  const vetados =
    Object.hasOwn(mapa, trackId) && Array.isArray(mapa[trackId]) ? mapa[trackId] : [];

  const cacheado = await obtenerPorClave('cacheYoutube', trackId);
  if (cacheado && !vetados.includes(cacheado.videoId)) {
    return { videoId: cacheado.videoId, cacheado: true };
  }

  // Se piden varios: el primer resultado puede tener el embebido prohibido y
  // sin alternativas el track no sonaría nunca. Cuesta lo mismo de cuota que
  // pedir uno solo (search.list se cobra por llamada, no por resultado).
  let ids;
  if (ES_NATIVO) {
    const resultado = await buscarNativo(query, 8);
    if (resultado.error) return resultado;
    const referencia = await referenciaDelTrack(trackId);
    ids = ordenarPorParecido(resultado.canciones, referencia).map((c) => c.videoId);
  } else {
    const resultado = await buscarEnDataApi(query, 5);
    if (resultado.error) return resultado;
    ids = (resultado.items ?? []).map((it) => it.id?.videoId);
  }

  const candidatos = ids.filter((id) => id && !vetados.includes(id));
  const videoId = candidatos[0] ?? null;
  if (!videoId) return { videoId: null, candidatos: [], cacheado: false };

  await guardarRegistro('cacheYoutube', { trackId, videoId });
  return { videoId, candidatos, cacheado: false };
}

export async function buscarExterno(q) {
  if (ES_NATIVO) {
    const r = await buscarNativo(q, 12);
    if (r.error) return r;
    return {
      resultados: r.canciones.map((c) => ({
        videoId: c.videoId,
        tituloSugerido: c.titulo,
        artistaSugerido: c.artistas.join(', '),
        duracionTexto: c.duracion
          ? `${Math.floor(c.duracion / 60)}:${String(c.duracion % 60).padStart(2, '0')}`
          : null,
        canal: c.artistas[0] ?? '',
        album: c.album ?? null,
        thumbnail: c.thumbnail,
      })),
    };
  }
  const resultado = await buscarEnDataApi(q, 12);
  if (resultado.error) return resultado;

  return {
    resultados: (resultado.items ?? []).map((item) => {
      const titulo = item.snippet.title;
      const [artistaSugerido, tituloSugerido] = titulo.includes(' - ')
        ? titulo.split(' - ', 2)
        : [item.snippet.channelTitle, titulo];
      return {
        videoId: item.id.videoId,
        tituloSugerido: tituloSugerido.trim(),
        artistaSugerido: artistaSugerido.trim(),
        duracionTexto: null, // Data API v3 no trae duración en search.list; pediría un videos.list aparte (costo extra de cuota, se omite en Fase A)
        canal: item.snippet.channelTitle.replace(/\s*-\s*Topic$/, ''),
        thumbnail: item.snippet.thumbnails?.medium?.url ?? null,
      };
    }),
  };
}

/** Radio desde esta canción (solo app Android: el navegador choca con CORS). */
export async function obtenerRadio(videoId, artista) {
  if (!ES_NATIVO) throw new Error('La radio necesita la app de escritorio o la de Android.');
  const { radioDesde, crearFetchNativo } = await import('./audio-nativo.js');
  fetchNativo ??= crearFetchNativo();
  return radioDesde(videoId, artista, { fetch: fetchNativo });
}
