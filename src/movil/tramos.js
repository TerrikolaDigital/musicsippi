// src/movil/tramos.js
export const TRAMO = 60;
/** Filas a montar en una lista larga: de 60 en 60 según se acerca el final. */
export function tramoVisible(total, mostrados, cerca) {
  const base = Math.max(mostrados, TRAMO);
  return Math.min(total, cerca ? base + TRAMO : base);
}
