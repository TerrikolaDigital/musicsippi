// src/movil/ola.js — geometría pura de la «ola» de progreso (identidad v4).
// La onda es una curva cuadrática suavizada (Q + T) de longitud de onda `lo`;
// al desplazarla `lo` en X con una animación lineal parece fluir sin saltos.

const finito = (n, por) => (Number.isFinite(n) ? n : por);

/** Path SVG de una onda que empieza en (0, y) y llega al menos a ancho + lo. */
export function trazoOnda(ancho, y, amp, lo) {
  const a = Math.max(0, finito(ancho, 0));
  const yy = finito(y, 0);
  const am = finito(amp, 0);
  const l = finito(lo, 0) > 0 ? lo : 1;
  let d = `M0 ${yy} Q${l / 4} ${yy - am} ${l / 2} ${yy}`;
  for (let x = l; x <= a + l; x += l / 2) d += ` T${x} ${yy}`;
  return d;
}

/** Progreso 0–1 saneado: clamp, y NaN/∞/no numérico → 0. */
export function progresoValido(p) {
  if (typeof p !== 'number' || !Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/** X (en unidades del viewBox) hasta donde llega el tramo escuchado. */
export function xEscuchado(progreso, ancho) {
  return progresoValido(progreso) * finito(ancho, 0);
}
