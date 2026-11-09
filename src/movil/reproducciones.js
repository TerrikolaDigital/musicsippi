// src/movil/reproducciones.js
// Qué entra en el historial. JS solo ve cambios de canción, y con la pantalla bloqueada duerme: se
// perdía todo menos la última canción de la cola, y las vueltas de «repetir» no cambian de canción.
// Por eso lo que arranca el servicio nativo lo anota él (SaltosPendientes, tipo «reproduccion»), con
// su hora real, y aquí se junta con lo que anota JS sin contar dos veces lo mismo.
import { claveDeHistorial } from './historial.js';
import { esIdLocal, trackIdDeIdLocal } from '../data/reproduccion-locales.js';

/** Dos arranques de la misma canción a menos de esto son una sola reproducción (JS y el nativo anotando lo mismo, o reiniciar al poco). */
export const VENTANA_MISMA_MS = 30000;
export const MAX_HISTORIAL = 10000;

/** Mete entradas nuevas (pueden llegar con retraso) y deja el historial de nueva a vieja. */
export const unirAlHistorial = (historial, nuevas, max = MAX_HISTORIAL) =>
  [...nuevas, ...historial].sort((a, b) => b.ts - a.ts).slice(0, max);

/** Canción de una anotación nativa que ya no está en la biblioteca ni en la cola. */
export function trackDeNota(nota) {
  if (!nota?.titulo) return null;
  const local = esIdLocal(nota.id);
  return {
    id: local ? trackIdDeIdLocal(nota.id) : `preview-${nota.id}`,
    titulo: nota.titulo,
    artista: nota.artista ?? '',
    ...(local ? {} : { youtubeVideoId: nota.id }),
  };
}

/**
 * @param {object} p
 * @param {() => Array} p.historial entradas actuales
 * @param {(track: object, ts: number) => object} p.entradaDe arma la entrada del historial
 * @param {(entrada: object) => void} p.anotar la guarda
 */
// `ultimoId`: la canción de la sesión restaurada, que ya contó cuando sonó; abrir la app no es oírla otra vez.
export function crearRegistroReproducciones({ historial, entradaDe, anotar, ventanaMs = VENTANA_MISMA_MS, ultimoId = null }) {
  const anotarSiEsNueva = (track, ts) => {
    const entrada = entradaDe(track, ts);
    const clave = claveDeHistorial(entrada);
    if (!historial().some((e) => Math.abs(e.ts - ts) < ventanaMs && claveDeHistorial(e) === clave)) anotar(entrada);
  };
  return {
    /** Cambió la canción actual en JS. Se anota una vez por canción: el efecto se repite en los reintentos de resolución. */
    cambio(track, ts = Date.now()) {
      if (!track || track.id === ultimoId) return;
      ultimoId = track.id;
      anotar(entradaDe(track, ts));
    },
    /** El servicio pasó solo a esta canción y ya la anotó: JS la adopta tarde, y anotarla de nuevo la contaría dos veces. */
    avanceNativo(track) {
      if (track) ultimoId = track.id;
    },
    /** La misma canción vuelve a empezar sin cambiar de pista (reiniciar, cola de una sola canción). */
    reinicio(track, ts = Date.now()) {
      if (track) anotarSiEsNueva(track, ts);
    },
    /** Reproducción anotada por el servicio nativo, con su hora real. */
    nota(track, ts) {
      if (track) anotarSiEsNueva(track, ts);
    },
  };
}
