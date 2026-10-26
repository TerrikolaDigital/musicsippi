// src/movil/reordenar.js
// Cálculo puro del arrastre para reordenar la cola con el dedo.

/** Fila a la que iría la arrastrada: sigue al dedo en filas enteras, dentro de [min, max]. */
export function destinoArrastre({ origen, dy, alto, min, max }) {
  if (!(alto > 0)) return origen;
  const filas = Math.round(dy / alto);
  return Math.max(min, Math.min(max, origen + filas));
}

/** Cuánto se aparta (px) la fila `i` para dejar hueco mientras `origen` se arrastra hacia `destino`. */
export function desplazamientoFila({ i, origen, destino, alto }) {
  if (i === origen) return 0;
  if (destino > origen && i > origen && i <= destino) return -alto;
  if (destino < origen && i >= destino && i < origen) return alto;
  return 0;
}
