// Playlist pública de Spotify sin login: la página embed lleva la lista en
// __NEXT_DATA__ (máx. 100 canciones). El token anónimo de ese JSON no sirve
// para la Web API (429 QUOTA_EXCEEDED, comprobado 2026-10-15): de más de 100
// se importan las 100 primeras y se avisa.
import { ErrorImportar } from '../errores.js';

export const LIMITE_EMBED = 100;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const RE_NEXT = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

export function parsearEmbedSpotify(html) {
  const m = RE_NEXT.exec(html ?? '');
  if (!m) throw new ErrorImportar('formato-cambiado', 'sin __NEXT_DATA__');
  let datos;
  try {
    datos = JSON.parse(m[1]);
  } catch {
    throw new ErrorImportar('formato-cambiado', '__NEXT_DATA__ ilegible');
  }
  const props = datos?.props?.pageProps;
  if (props?.status === 404) throw new ErrorImportar('privada', 'embed 404');
  const entidad = props?.state?.data?.entity;
  if (!entidad || !Array.isArray(entidad.trackList)) throw new ErrorImportar('formato-cambiado', 'sin entity.trackList');

  const nombre = (entidad.name ?? entidad.title ?? 'Playlist de Spotify').trim();
  const filas = entidad.trackList
    .filter((t) => t?.title && t?.subtitle && (t.entityType ?? 'track') === 'track')
    .map((t) => ({
      titulo: t.title.trim(),
      artista: t.subtitle.replace(/\u00a0/g, ' ').trim(),
      album: '',
      playlist: nombre,
      tipo: 'Track',
    }));
  if (filas.length === 0) throw new ErrorImportar('vacia');
  const aviso =
    entidad.trackList.length >= LIMITE_EMBED
      ? `Spotify solo deja leer las ${LIMITE_EMBED} primeras canciones de una playlist: se importan esas.`
      : null;
  return { nombre, portada: entidad.coverArt?.sources?.[0]?.url ?? null, filas, aviso };
}

export async function leerPlaylist(id, http) {
  const r = await http.get(`https://open.spotify.com/embed/playlist/${id}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' },
  });
  if (r.status === 404) throw new ErrorImportar('privada', 'HTTP 404');
  if (r.status >= 400) throw new ErrorImportar('formato-cambiado', `HTTP ${r.status}`);
  return parsearEmbedSpotify(r.texto);
}
