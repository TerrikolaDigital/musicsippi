// src/organizador/seguimiento-uso.js
// Cuánto se oyó de cada canción puesta desde un chip de «¿Cómo te sientes?». Puro (sin React ni disco):
// la app avisa cuando cambia la canción (`cambio`) y cada vez que avanza el reloj (`tiempo`); al pasar a otra
// canción se entrega (trackId, estadoId, fracción oída 0–1) a `alCerrar`.
// El tiempo oído se acumula con avances pequeños y positivos: un salto adelante (arrastrar la barra), un
// reinicio o el tiempo viejo de la canción anterior no cuentan como escucha.
const MAX_AVANCE_S = 3;

export function crearSeguimientoUso({ alCerrar }) {
  let actual = null; // { trackId, estadoId, oidos, ultimoT, duracion }

  function cerrar() {
    if (actual && actual.duracion > 0) alCerrar(actual.trackId, actual.estadoId, Math.min(1, actual.oidos / actual.duracion));
    actual = null;
  }

  return {
    /** `trackId` null si no suena nada; `estadoId` solo si la canción viene de un chip. */
    cambio(trackId, estadoId) {
      if (actual && actual.trackId !== trackId) cerrar();
      if (!actual && trackId && estadoId) actual = { trackId, estadoId, oidos: 0, ultimoT: null, duracion: 0 };
    },
    tiempo(t, duracion) {
      if (!actual || !Number.isFinite(t)) return;
      const d = actual.ultimoT === null ? 0 : t - actual.ultimoT;
      actual.ultimoT = t;
      if (d > 0 && d <= MAX_AVANCE_S && duracion > 0) {
        actual.oidos += d;
        actual.duracion = duracion;
      }
    },
  };
}
