// src/data/revisar-versiones.js
// Vídeos ya guardados en cacheYoutube que se eligieron sin exigir el artista: la caché del PC
// toma el primer resultado y el móvil puntuaba sin mirarlo. Cada canción se revisa una sola vez,
// al ir a sonar, para que el cover no suene ni la primera vez.
import { mejorVersionParaRevisar } from './elegir-version.js';

// Subirla vuelve a revisar todo: hacerlo solo si cambian de verdad los criterios.
export const REVISION_VERSIONES = 2;

// La canción no espera más que esto: la revisión sigue y vale para la próxima vez.
const TOPE_ESPERA_MS = 2500;
// Con mala señal cada búsqueda agotaría el tope y retrasaría todas las canciones de la cola.
const PAUSA_TRAS_FALLO_MS = 60_000;

const yaRevisado = (registro) => (registro.revision ?? 0) >= REVISION_VERSIONES;
// Lo revisado en cualquier versión (>= 1) sigue fijado frente a la sincronización con el PC, aunque
// una versión nueva lo vuelva a revisar: si no, el PC pisaría un vídeo ya corregido en el móvil.
const fijadoFrenteAlPc = (registro) => (registro.revision ?? 0) >= 1;

/** Lo que viene del PC, sin lo que aquí ya se revisó o eligió el usuario. */
export function entradasCacheDelPc(cachePc, propios) {
  const fijados = new Set(propios.filter((r) => fijadoFrenteAlPc(r) || r.origen === 'usuario').map((r) => r.trackId));
  return Object.entries(cachePc)
    .filter(([trackId]) => trackId !== 'version' && !fijados.has(trackId))
    .map(([trackId, v]) => ({ trackId, videoId: typeof v === 'string' ? v : v?.videoId }));
}

export function crearRevisorVersiones({ ahora = Date.now, topeMs = TOPE_ESPERA_MS, pausaMs = PAUSA_TRAS_FALLO_MS } = {}) {
  const enCurso = new Map();
  let pausaHasta = 0;

  async function comprobar({ cacheado, ref, buscar, guardar, elegir }) {
    let candidatos;
    try {
      candidatos = await buscar();
    } catch {
      pausaHasta = ahora() + pausaMs;
      return cacheado.videoId;
    }
    // `elegir` (PC): mismo papel que mejorVersionParaRevisar, con más datos del vídeo guardado.
    const elegido = elegir ? await elegir(candidatos) : mejorVersionParaRevisar(cacheado.videoId, candidatos, ref);
    const videoId = elegido ?? cacheado.videoId;
    await guardar({ trackId: cacheado.trackId, videoId, revision: REVISION_VERSIONES });
    return videoId;
  }

  return {
    /** @returns {Promise<string>} el videoId que debe sonar; la revisión nunca hace fallar la canción. */
    async revisar({ cacheado, ref, intocable, buscar, guardar, elegir }) {
      if (intocable || !ref || ref.manual || cacheado.origen === 'usuario' || yaRevisado(cacheado)) return cacheado.videoId;
      if (ahora() < pausaHasta) return cacheado.videoId;
      const clave = cacheado.trackId;
      if (!enCurso.has(clave)) {
        const tarea = comprobar({ cacheado, ref, buscar, guardar, elegir })
          .catch(() => cacheado.videoId)
          .finally(() => enCurso.delete(clave));
        enCurso.set(clave, tarea);
      }
      let temporizador;
      const tope = new Promise((resolver) => {
        temporizador = setTimeout(() => resolver(cacheado.videoId), topeMs);
      });
      return Promise.race([enCurso.get(clave), tope]).finally(() => clearTimeout(temporizador));
    },
  };
}
