import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { armarEvidenciaNucleo, soloGeneros } from './generos-por-track-nucleo.mjs';
import { textoDeTrack, generosParaVector } from './clasificar-embeddings-puro.mjs';

export { soloGeneros } from './generos-por-track-nucleo.mjs';

function leerJsonSiExiste(ruta, porDefecto) {
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : porDefecto;
}

/** Ver armarEvidenciaNucleo (generos-por-track-nucleo.mjs): aquí solo se leen los archivos del PC. */
export function armarEvidenciaPorTrack(dataDir, tracks, fuentes) {
  const mb = leerJsonSiExiste(join(dataDir, 'metadata-musicbrainz.json'), { tracks: {}, artistas: {} });
  const descYt = leerJsonSiExiste(join(dataDir, 'descripciones-youtube.json'), {});
  const ejesData = leerJsonSiExiste(join(dataDir, 'ejes.json'), { ejes: [] });
  return armarEvidenciaNucleo(tracks, fuentes, {
    generosArtistaDe: (id) => {
      const meta = mb.tracks?.[id];
      return (meta?.artistaMbid ? mb.artistas?.[meta.artistaMbid]?.generos : null) ?? [];
    },
    descripcionDe: (id) => descYt[id],
    ejes: ejesData.ejes ?? [],
  });
}

/**
 * Solo los géneros, para los llamadores que no necesitan saber de dónde salió
 * cada uno (p. ej. POST /api/descubrir-modos, que solo arma candidatos para
 * la pantalla de revisión y no asigna nada).
 */
export function armarGenerosPorTrack(dataDir, tracks, fuentes) {
  return soloGeneros(armarEvidenciaPorTrack(dataDir, tracks, fuentes));
}

/**
 * Texto del vector de cada canción en el PC, el mismo que arma descubrirModos (evidencia + moods de género, ver
 * generosParaVector): todos los que escriben vectores.bin deben usar este, si no cada uno recalcula los del otro.
 */
export function crearTextoDeVector(dataDir, tracks, fuentes) {
  const generosPorTrack = armarGenerosPorTrack(dataDir, tracks, fuentes ?? {});
  const ejesData = leerJsonSiExiste(join(dataDir, 'ejes.json'), { ejes: [] });
  const ejesPorId = new Map((ejesData.ejes ?? []).map((e) => [e.id, e]));
  return (t) => textoDeTrack(t, { generos: generosParaVector(t, generosPorTrack.get(t.id) ?? [], ejesPorId) });
}
