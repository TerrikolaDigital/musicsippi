import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { asegurarVectores, vectorDe, cargarIndice } from './indice-vectores.mjs';
import { embeber, embeberTermino } from './clasificar-embeddings.mjs';
import { descubrirModosNucleo } from './descubrir-modos-nucleo.mjs';

export * from './descubrir-modos-nucleo.mjs';

/**
 * tracks: los tracks a agrupar/clusterizar — normalmente biblioteca.tracks
 * completa, pero puede ser un subconjunto (p.ej. solo los tracks nuevos sin
 * modo, ver Tarea 18: detección incremental vía POST /api/descubrir-modos con
 * `trackIds`).
 * generosPorTrack: Map<trackId, string[]> ya combinando MusicBrainz + YouTube + Deezer.
 * fuentes: objeto de fuentes.json (vocabulario, umbrales, nombresHumanos).
 * dataDir: para leer/escribir el indice de vectores.
 * totalTracksReal: tamaño de la biblioteca COMPLETA contra el que se mide la
 * masa mínima (Tarea 12: calcularMasaMinima). Default `tracks.length` para no
 * romper a los llamadores existentes que ya pasan la biblioteca entera (Tarea
 * 16). Cuando `tracks` es un subconjunto chico, hay que pasar acá el total
 * real: si se dejara calcularMasaMinima(tracks.length, ...) con `tracks` ya
 * chico, el umbral de masa mínima se desploma (25 -> 2 con 50 tracks, ver
 * Tarea 18) y grupos minúsculos y poco confiables calificarían como "modo
 * nuevo" cuando nunca calificarían evaluados contra la biblioteca completa.
 * Devuelve { modosCandidatos, residuoSinModo, gruposSinMasa } sin escribir nada
 * a disco salvo el indice de vectores (vía asegurarVectores, que persiste solo
 * lo que cambió).
 *
 * Envoltorio del PC: vectores en dataDir (vectores-indice.json + vectores.bin)
 * y modelo fp32. La lógica vive en descubrir-modos-nucleo.mjs.
 */
export async function descubrirModos(tracks, generosPorTrack, fuentes, dataDir, totalTracksReal = tracks.length) {
  let indice = null;
  const rutaEjes = join(dataDir, 'ejes.json');
  const ejes = existsSync(rutaEjes) ? JSON.parse(readFileSync(rutaEjes, 'utf8')).ejes ?? [] : [];
  return descubrirModosNucleo(
    tracks,
    generosPorTrack,
    fuentes,
    {
      ejes,
      embeber,
      embeberTermino,
      async prepararVectores(ts, textoDe) {
        await asegurarVectores(dataDir, ts, textoDe, embeber);
        // Se carga una sola vez y se reusa en cada vectorDe(): evita re-parsear el
        // JSON de offsets en cada track del residuo.
        indice = cargarIndice(dataDir);
      },
      vectorDe: (trackId) => vectorDe(dataDir, trackId, indice),
    },
    totalTracksReal
  );
}
