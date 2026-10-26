// Apple Music publica el estado de álbumes y playlists en el HTML. Según la
// versión de la página viene como `serialized-server-data` o como JSON-LD.
import { ErrorImportar } from '../errores.js';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const RE_SCRIPT = /<script[^>]+(?:id="serialized-server-data"|type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi;

const RE_TIPO_ALBUM = /\s-\s(?:[ÁA]lbum|Album|EP|Sencillo|Single)\b/i;

function texto(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function recorrer(valor, visita) {
  if (!valor || typeof valor !== 'object') return;
  visita(valor);
  if (Array.isArray(valor)) valor.forEach((x) => recorrer(x, visita));
  else Object.values(valor).forEach((x) => recorrer(x, visita));
}

function jsonDelHtml(html) {
  const datos = [];
  for (const m of String(html ?? '').matchAll(RE_SCRIPT)) {
    try { datos.push(JSON.parse(m[1])); } catch { /* otro script no válido no invalida el resto */ }
  }
  if (!datos.length) throw new ErrorImportar('formato-cambiado', 'sin JSON público de Apple Music');
  return datos;
}

function filaDe(obj, nombre) {
  // Página actual (2026): pistas como «trackLockup» con title, subtitleLinks (artista) y tertiaryLinks (álbum).
  if (obj?.contentDescriptor?.kind === 'song' && obj.title) {
    const titulo = texto(obj.title);
    const artista = texto(obj.artistName ?? obj.subtitleLinks?.[0]?.title);
    if (!titulo || !artista) return null;
    return { titulo, artista, album: texto(obj.tertiaryLinks?.[0]?.title), playlist: nombre, tipo: 'Track' };
  }
  const a = obj?.attributes ?? obj;
  const titulo = texto(a?.name ?? a?.title);
  const artista = texto(a?.artistName ?? a?.byArtist?.name ?? a?.author?.name);
  if (!titulo || !artista) return null;
  return { titulo, artista, album: texto(a.albumName), playlist: nombre, tipo: 'Track' };
}

export function parsearPaginaApple(html) {
  const bloques = jsonDelHtml(html);
  let nombre = '';
  let portada = null;
  let esAlbum = false;
  const candidatas = [];
  recorrer(bloques, (obj) => {
    const a = obj?.attributes ?? obj;
    if (!nombre && (a?.trackCount || Array.isArray(obj?.trackList) || Array.isArray(obj?.tracks))) {
      nombre = texto(a?.name ?? a?.title);
      portada = a?.artwork?.url ?? a?.image ?? portada;
    }
    const fila = filaDe(obj, nombre || 'Lista de Apple Music');
    // Los nodos de álbum/lista también llevan name y artistName: solo las pistas.
    if (!nombre && typeof obj?.pageTitle === 'string') {
      nombre = texto(obj.pageTitle.split(' - ')[0]);
      // «Sol - Álbum de La Banda - Apple Music» (también EP / Sencillo): las pistas no repiten el álbum.
      esAlbum = RE_TIPO_ALBUM.test(obj.pageTitle);
    }
    if (fila && (obj?.contentDescriptor?.kind === 'song' || obj?.type === 'songs' || obj?.type === 'track' || obj?.['@type'] === 'MusicRecording' || a?.albumName)) candidatas.push(fila);
  });
  nombre ||= 'Lista de Apple Music';
  const vistas = new Set();
  const filas = candidatas.filter((f) => {
    const clave = `${f.titulo}\u0000${f.artista}\u0000${f.album}`.toLowerCase();
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    f.playlist = nombre;
    if (esAlbum && !f.album) f.album = nombre;
    return true;
  });
  if (!filas.length) throw new ErrorImportar('vacia');
  return { nombre, portada, filas };
}

export async function leerPlaylist(url, http) {
  const r = await http.get(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' } });
  if (r.status === 404) throw new ErrorImportar('privada', 'HTTP 404');
  if (r.status >= 400) throw new ErrorImportar('formato-cambiado', `HTTP ${r.status}`);
  return parsearPaginaApple(r.texto);
}
