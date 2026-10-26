// src/movil/disposicion.js
/** Espacio inferior que el contenido deja libre: barra (66 + 10 + 16) y mini-reproductor (62 + 6). */
export function alturaInferior({ hayTrack }) {
  return hayTrack ? 160 : 92;
}
