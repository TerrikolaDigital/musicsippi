// API pública de Deezer (sin clave): /playlist/{id} trae la cabecera y una
// primera tanda; el resto se pide con /playlist/{id}/tracks?index=N&limit=100.
import { ErrorImportar, jsonDe } from '../errores.js';

const API = 'https://api.deezer.com';
export const MAX_CANCIONES = 2000;
export const AVISO_PARCIAL = 'No se pudo leer toda la playlist: se importan las canciones leídas hasta ahora.';

export function filasDeTracksDeezer(datos, nombre) {
  return (datos ?? [])
    .filter((t) => t?.title && t?.artist?.name && (t.type ?? 'track') === 'track')
    .map((t) => ({
      titulo: t.title.trim(),
      artista: t.artist.name.trim(),
      album: (t.album?.title ?? '').trim(),
      playlist: nombre,
      tipo: 'Track',
    }));
}

export function parsearPlaylistDeezer(json) {
  if (json?.error) throw new ErrorImportar(json.error.code === 800 ? 'privada' : 'formato-cambiado', json.error.message);
  if (!json?.title || !Array.isArray(json?.tracks?.data)) throw new ErrorImportar('formato-cambiado', 'sin title/tracks');
  const nombre = json.title.trim();
  return {
    nombre,
    portada: json.picture_medium ?? null,
    filas: filasDeTracksDeezer(json.tracks.data, nombre),
    total: json.nb_tracks ?? json.tracks.data.length,
    leidas: json.tracks.data.length,
  };
}

export async function leerPlaylist(id, http) {
  const primera = parsearPlaylistDeezer(jsonDe(await http.get(`${API}/playlist/${id}`)));
  const filas = [...primera.filas];
  let leidas = primera.leidas;
  const objetivo = Math.min(primera.total, MAX_CANCIONES);
  while (leidas < objetivo) {
    const pagina = jsonDe(await http.get(`${API}/playlist/${id}/tracks?index=${leidas}&limit=100`));
    if (pagina?.error || !Array.isArray(pagina?.data) || pagina.data.length === 0) break;
    filas.push(...filasDeTracksDeezer(pagina.data, primera.nombre));
    leidas += pagina.data.length;
  }
  if (filas.length === 0) throw new ErrorImportar('vacia');
  let aviso = null;
  if (leidas < objetivo) aviso = AVISO_PARCIAL;
  else if (primera.total > MAX_CANCIONES) aviso = `La playlist es muy larga: se importan las ${MAX_CANCIONES} primeras canciones.`;
  return { nombre: primera.nombre, portada: primera.portada, filas, aviso };
}
