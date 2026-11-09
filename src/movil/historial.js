// src/movil/historial.js
// Agrupa las entradas del historial por día (Hoy, Ayer o «dd de mes»), de la más nueva a la más vieja.
import { claveCancion, norm } from './inicio/claves.js';

const MESES =['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Lo que separa una grabación de otra: «Love Again (… Remix)» no es «Love Again», pero «2U (feat. …)» sí es «2U».
const VERSION = /\b(remix|mix|mixed|live|en vivo|ac[oú]stic\w*|instrumental|karaoke|intro|outro|interlude|demo|cover)\b/i;
const versionDe = (titulo) =>
  (titulo.match(/[([][^)\]]*[)\]]/g) ?? [])
    .filter((p) => VERSION.test(p) && !/^.\s*(feat|ft|with|con)\b/i.test(p))
    .map((p) => norm(p.slice(1, -1)))
    .sort()
    .join(' ');

/**
 * Clave de la canción de una entrada: la misma canción tiene ids distintos según de dónde suene
 * (biblioteca, vista previa de la búsqueda, otra subida del vídeo) y debe contar junta. Sin título, su id.
 */
export const claveDeHistorial = ({ trackId, titulo, artista }) => {
  if (!titulo) return trackId;
  const version = versionDe(titulo);
  return version ? `${claveCancion(artista, titulo)}|${version}` : claveCancion(artista, titulo);
};

export function agruparPorDia(entradas, hoy = new Date()) {
  const h = dia(hoy);
  const grupos = new Map();
  for (const e of [...entradas].sort((a, b) => b.ts - a.ts)) {
    const d = new Date(e.ts);
    const diff = Math.round((h - dia(d)) / 86400000);
    const etiqueta = diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : `${d.getDate()} de ${MESES[d.getMonth()]}`;
    if (!grupos.has(etiqueta)) grupos.set(etiqueta, []);
    grupos.get(etiqueta).push(e);
  }
  return [...grupos].map(([etiqueta, lista]) => ({ etiqueta, entradas: lista }));
}

/**
 * Canción de una entrada del historial que ya no está en la biblioteca (vista previa, radio).
 * Las entradas antiguas solo guardaron título y artista; las vistas previas llevan el vídeo en el id.
 * El id es el de la canción, no el de la entrada: así la fila activa y la caché de vídeos la reconocen.
 */
export function trackDeEntrada(h) {
  if (!h.titulo) return null;
  const artista = h.artista ?? '';
  const videoId = h.videoId ?? (h.trackId?.startsWith('preview-') ? h.trackId.slice('preview-'.length) : undefined);
  const coverUrl = h.coverUrl ?? (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined);
  return {
    id: h.trackId,
    trackIdReal: h.trackId,
    titulo: h.titulo,
    artista,
    youtubeQuery: `${artista} ${h.titulo}`.trim(),
    ...(videoId ? { youtubeVideoId: videoId } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ejes: [],
  };
}

/** Cola al tocar una entrada: esa canción y lo escuchado antes, sin repetir (el historial está de nueva a vieja). */
export function colaDesde(entradas, desde) {
  const vistas = new Set();
  const cola = [];
  for (const { track } of entradas.slice(entradas.indexOf(desde))) {
    if (vistas.has(track.id)) continue;
    vistas.add(track.id);
    cola.push(track);
  }
  return cola;
}

/**
 * Canciones más sonadas: cuenta por canción (`claveDeHistorial`), no por id; si alguna
 * reproducción es de la biblioteca, esa copia gana sobre una copia suelta (snapshot) más vieja.
 */
export function rankingCanciones(entradas, limite = 50) {
  const porCancion = new Map();
  for (const e of entradas) {
    const clave = claveDeHistorial({ trackId: e.trackId, titulo: e.track?.titulo, artista: e.track?.artista });
    const actual = porCancion.get(clave) ?? { track: e.track, enBiblioteca: !!e.enBiblioteca, n: 0 };
    if (e.enBiblioteca) {
      actual.track = e.track;
      actual.enBiblioteca = true;
    }
    actual.n += 1;
    porCancion.set(clave, actual);
  }
  return [...porCancion.values()].sort((a, b) => b.n - a.n).slice(0, limite);
}

/** Modos más sonados; ignora los que ya no existen (historial con un ejeId borrado). */
export function rankingModos(entradas, ejes, limite = 12) {
  const validos = new Set(ejes.map((e) => e.id));
  const porModo = new Map();
  for (const e of entradas) {
    if (!e.ejeId || !validos.has(e.ejeId)) continue;
    const actual = porModo.get(e.ejeId) ?? { ejeId: e.ejeId, nombre: e.ejeNombre ?? e.ejeId, n: 0 };
    actual.n += 1;
    porModo.set(e.ejeId, actual);
  }
  return [...porModo.values()].sort((a, b) => b.n - a.n).slice(0, limite);
}
