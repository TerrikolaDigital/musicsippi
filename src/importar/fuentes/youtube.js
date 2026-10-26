// Playlist de YouTube / YouTube Music vía InnerTube (youtubei.js, ya usado en
// el móvil con el fetch nativo de audio-nativo.js). Se usa la vista de YouTube
// Music: trae artistas separados (en youtube.com, getPlaylist devuelve
// LockupView sin título ni autor en youtubei.js 18). Cada canción trae su
// videoId, así que suena sin buscarla.
import { ErrorImportar } from '../errores.js';

export const MAX_CANCIONES = 1000;
export const AVISO_PARCIAL = 'No se pudo leer toda la playlist: se importan las canciones leídas hasta ahora.';

export function planoDePlaylistMusic(pl) {
  const titulo = pl?.header?.title;
  return {
    titulo: titulo ? String(titulo.toString?.() ?? titulo.text ?? '').trim() || null : null,
    portada: pl?.header?.thumbnail?.contents?.[0]?.url ?? pl?.background?.contents?.[0]?.url ?? null,
    items: (pl?.contents ?? []).map((i) => ({
      id: i?.id ?? null,
      titulo: i?.title ?? null,
      artistas: (i?.artists ?? i?.authors ?? []).map((a) => a?.name).filter(Boolean),
      album: i?.album?.name ?? null,
    })),
  };
}

export function filasDePlano(plano) {
  if (!plano?.titulo) throw new ErrorImportar('privada', 'sin cabecera');
  const nombre = plano.titulo;
  const filas = plano.items
    .filter((i) => i.id && i.titulo && i.artistas.length > 0)
    .map((i) => ({
      titulo: String(i.titulo).trim(),
      artista: i.artistas.join(', '),
      album: i.album ?? '',
      playlist: nombre,
      tipo: 'Track',
      videoId: i.id,
    }));
  if (filas.length === 0) throw new ErrorImportar('vacia');
  return { nombre, portada: plano.portada, filas };
}

async function innertubePorDefecto() {
  const { Capacitor } = await import('@capacitor/core');
  const { crearFetchNativo } = await import('../../data/audio-nativo.js');
  const { Innertube } = await import('youtubei.js');
  return Innertube.create({
    ...(Capacitor.isNativePlatform() ? { fetch: crearFetchNativo() } : {}),
    generate_session_locally: true,
    retrieve_player: false,
  });
}

export async function leerPlaylist(id, _http, { crearInnertube = innertubePorDefecto } = {}) {
  let yt;
  try {
    yt = await crearInnertube();
  } catch (e) {
    throw new ErrorImportar('sin-red', e?.message);
  }
  let pl;
  try {
    pl = await yt.music.getPlaylist(id);
  } catch (e) {
    const mensaje = e?.message ?? '';
    throw new ErrorImportar(/fetch|network|timeout/i.test(mensaje) ? 'sin-red' : 'privada', mensaje);
  }
  const plano = planoDePlaylistMusic(pl);
  let incompleta = false;
  try {
    while (pl?.has_continuation && plano.items.length < MAX_CANCIONES) {
      pl = await pl.getContinuation();
      plano.items.push(...planoDePlaylistMusic(pl).items);
    }
  } catch {
    // Una continuación que falla no tira la importación: se queda con lo leído y se avisa.
    incompleta = true;
  }
  plano.items = plano.items.slice(0, MAX_CANCIONES);
  const lectura = filasDePlano(plano);
  let aviso = null;
  if (incompleta) aviso = AVISO_PARCIAL;
  else if (plano.items.length >= MAX_CANCIONES) aviso = `La playlist es muy larga: se importan las ${MAX_CANCIONES} primeras canciones.`;
  return { ...lectura, aviso };
}
