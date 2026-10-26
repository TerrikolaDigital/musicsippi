// src/data/lib/radio.js
// "Radio desde esta canción": reglas de BitChord sobre el mix automático de
// YouTube Music (getUpNext con automix). Puro, sin red: lo usan la app Android
// (youtubei.js en el WebView) y el servidor de escritorio (/api/radio).
//
// - Sin repetir grabación: título normalizado (sin "(Remastered)", "feat."...) + artista.
// - Tope por artista: 4 del artista de la canción semilla, 2 de cualquier otro.
// - 24 canciones (sin contar la semilla).

export const TAMANO_RADIO = 24;
const TOPE_SEMILLA = 4;
const TOPE_OTRO = 2;

function normalizar(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/\b(feat|ft)\b.*$/, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nodo PlaylistPanelVideo de youtubei.js -> pista plana. */
export function pistaDeNodo(n) {
  const artistas = (n.artists ?? []).map((a) => a.name).filter(Boolean);
  return {
    videoId: n.video_id,
    titulo: n.title?.toString?.() ?? String(n.title ?? ''),
    artista: artistas.join(', ') || n.author || '',
    duracionS: Number(n.duration?.seconds ?? 0),
    album: n.album?.name ?? null,
    portadaUrl: n.thumbnail?.[0]?.url ?? null,
  };
}

/**
 * @param {Array<{videoId,titulo,artista}>} pistas en el orden del mix
 * @param {{videoId?: string, artista?: string}} semilla
 */
export function armarRadio(pistas, semilla, tamano = TAMANO_RADIO) {
  const artistaSemilla = normalizar(semilla?.artista);
  const vistas = new Set();
  const porArtista = new Map();
  const salida = [];
  for (const p of pistas) {
    if (!p?.videoId || p.videoId === semilla?.videoId) continue;
    const art = normalizar(p.artista.split(',')[0]);
    const clave = `${normalizar(p.titulo)}|${art}`;
    if (vistas.has(clave)) continue;
    const tope = art && art === artistaSemilla ? TOPE_SEMILLA : TOPE_OTRO;
    const n = porArtista.get(art) ?? 0;
    if (n >= tope) continue;
    vistas.add(clave);
    porArtista.set(art, n + 1);
    salida.push(p);
    if (salida.length >= tamano) break;
  }
  return salida;
}
