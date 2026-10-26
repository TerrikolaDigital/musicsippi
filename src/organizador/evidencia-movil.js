// Géneros por canción en el móvil: lo que mandó el PC (armarEvidenciaPorTrack,
// en `evidenciaPC` del store `generos`) + lo consultado en el móvil
// (generosMB, generosDeezer) + patrones de título y nombres de lista.
import { armarEvidenciaNucleo, PRECEDENCIA_SENALES } from '../../scripts/lib/generos-por-track-nucleo.mjs';
import { generosMBEfectivos } from '../../scripts/lib/musicbrainz-detalle.mjs';

export function mezclarEvidenciaPC(registrosPrevios, evidencia) {
  const previos = new Map(registrosPrevios.map((r) => [r.trackId, r]));
  return Object.entries(evidencia ?? {}).map(([trackId, ev]) => ({
    ...previos.get(trackId),
    trackId,
    evidenciaPC: { generos: ev?.generos ?? [], senal: ev?.senal ?? null },
  }));
}

/** Guarda en el store `generos` la evidencia que mandó el PC, sin tocar lo consultado en el móvil. */
export async function guardarEvidenciaPC(almacen, evidencia) {
  await almacen.guardarVarios('generos', mezclarEvidenciaPC(await almacen.obtenerTodos('generos'), evidencia));
}

export function evidenciaDeBiblioteca(tracks, registros, ejes, fuentes) {
  const porId = new Map(registros.map((r) => [r.trackId, r]));
  const local = armarEvidenciaNucleo(tracks, fuentes, {
    // Canción > álbum > artista (MusicBrainz por canción y por álbum además del artista).
    generosArtistaDe: (id) => generosMBEfectivos(porId.get(id)),
    // Deezer solo cuenta si MusicBrainz no dio nada, tampoco el del PC.
    generosDeezerDe: (id) => {
      const r = porId.get(id);
      return r?.evidenciaPC?.senal === 'genero-musicbrainz' ? [] : (r?.generosDeezer ?? []);
    },
    ejes,
  });
  const resultado = new Map();
  for (const t of tracks) {
    const pc = porId.get(t.id)?.evidenciaPC;
    const movil = local.get(t.id);
    const generos = [...new Set([...(pc?.generos ?? []), ...(movil?.generos ?? [])])];
    const senales = [pc?.senal, movil?.senal].filter(Boolean);
    resultado.set(t.id, { generos, senal: PRECEDENCIA_SENALES.find((s) => senales.includes(s)) ?? null });
  }
  return resultado;
}
