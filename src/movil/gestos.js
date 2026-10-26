// src/movil/gestos.js
// Gestos de las capas móviles, sin React. Cerrar deslizando hacia abajo vale por
// distancia (> 30 % del alto de la capa; sin alto, > 120 px) o por velocidad
// (> 0.11 px/ms, como en la maqueta v4). Un roce de menos de MIN_ARRASTRE px
// nunca cierra: un toque con el dedo tembloroso no debe tirar la hoja.
export const VELOCIDAD_CIERRE = 0.11;
const MIN_ARRASTRE = 10;
const FRACCION_ALTO = 0.3;
const DISTANCIA_SIN_ALTO = 120;

export function deberiaCerrar({ dy, vy, alto }) {
  if (!(dy > MIN_ARRASTRE)) return false;
  const limite = alto > 0 ? alto * FRACCION_ALTO : DISTANCIA_SIN_ALTO;
  return dy > limite || vy > VELOCIDAD_CIERRE;
}

/**
 * Deslizar horizontal sobre el mini-reproductor: -1 = siguiente (hacia la izquierda),
 * 1 = anterior, 0 = no es un deslizamiento (toque o gesto demasiado vertical/corto).
 */
export function direccionDeslizar({ dx, dy, ancho }) {
  if (Math.abs(dx) < Math.max(52, (ancho || 0) * 0.25)) return 0;
  if (!(Math.abs(dx) > Math.abs(dy) * 1.4)) return 0;
  return dx < 0 ? -1 : 1;
}
