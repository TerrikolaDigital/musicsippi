// src/movil/bienvenida/bienvenida.js
export const CLAVE_BIENVENIDA = 'bienvenidaMovilVista';
export const PASOS = 6;

/** Solo la primera apertura: tras verla (o pulsar «Saltar») no vuelve, aunque la biblioteca siga vacía (Inicio ya ofrece «Explorar música»). */
export function debeMostrarBienvenida({ vista }) {
  return !vista;
}

/** Paso válido (1..PASOS); lo que no sea un número entero cae en el primero. */
export function pasoValido(paso) {
  return Number.isInteger(paso) ? Math.min(PASOS, Math.max(1, paso)) : 1;
}

/**
 * Gesto horizontal sobre el recorrido: +1 (siguiente), -1 (anterior) o 0 (se queda).
 * Cuenta si el dedo fue sobre todo horizontal y llegó lejos o fue rápido (un
 * golpe seco basta, sin arrastrar media pantalla).
 */
export function pasoPorGesto({ dx, dy, ms, ancho }) {
  if (![dx, dy, ms, ancho].every(Number.isFinite) || ancho <= 0) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  const rapido = Math.abs(dx) / Math.max(ms, 1) > 0.35 && Math.abs(dx) > 28;
  if (Math.abs(dx) < Math.min(80, ancho * 0.22) && !rapido) return 0;
  return dx < 0 ? 1 : -1;
}
