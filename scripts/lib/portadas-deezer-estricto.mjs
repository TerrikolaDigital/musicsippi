/**
 * Coincidencia ESTRICTA entre una canción de la biblioteca y un resultado de Deezer, para completar carátulas de
 * canciones que la búsqueda normal no encontró. Un falso positivo (portada de otro artista) es peor que las iniciales,
 * así que exige: (1) que el artista del resultado sea uno de los artistas de la canción y (2) que los títulos,
 * sin paréntesis ni sufijos («– instrumental», «(feat. X)»), compartan casi todas sus palabras.
 */
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const soloLetras = (s) => norm(s).replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

export const limpiarTitulo = (s) =>
  soloLetras(
    norm(s)
      .replace(/\s*[([][^)\]]*[)\]]/g, ' ')
      .replace(/\s+-\s+.*$/, ' '),
  );

export const artistasDe = (artista) =>
  String(artista ?? '')
    .split(/\s*(?:[·,&+]|\s(?:x|vs\.?|with|con|feat\.?|ft\.?|featuring)\s)\s*/i)
    .map(soloLetras)
    .filter(Boolean);

const palabras = (t) => limpiarTitulo(t).split(' ').filter((p) => p.length > 1);

export function esCoincidencia(track, item) {
  const nombre = soloLetras(item?.artist?.name);
  if (!nombre) return false;
  const mismoArtista = artistasDe(track.artista).some(
    (a) => a === nombre || (a.length >= 4 && nombre.length >= 4 && (a.includes(nombre) || nombre.includes(a))),
  );
  if (!mismoArtista) return false;
  const a = palabras(track.titulo);
  const b = new Set(palabras(item.title));
  if (!a.length || !b.size) return false;
  const comunes = a.filter((p) => b.has(p)).length;
  return comunes / Math.max(a.length, b.size) >= 0.8 && comunes >= 1;
}
