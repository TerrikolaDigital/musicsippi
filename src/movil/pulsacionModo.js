// src/movil/pulsacionModo.js
// Pulsación larga para tarjetas dentro de carruseles: se cancela si el dedo se mueve
// (scroll) o se levanta antes. Devuelve los manejadores de puntero y `consumida()`,
// que dice (una sola vez) si el click que sigue viene de una pulsación larga.
import { useRef } from 'react';

export const MS_LARGA = 500;
export const MOVIMIENTO_MAX = 8; // px: más que esto es un scroll, no una pulsación

/** ¿Se ha movido el dedo lo bastante como para considerarlo scroll? */
export function esMovimiento(x0, y0, x, y, max = MOVIMIENTO_MAX) {
  return Math.hypot(x - x0, y - y0) > max;
}

export function usePulsacionLarga(alLargo, { ignorarBotones = false } = {}) {
  const temporizador = useRef(null);
  const inicio = useRef(null);
  const largo = useRef(false);
  const cb = useRef(alLargo);
  cb.current = alLargo;

  const cancelar = () => {
    clearTimeout(temporizador.current);
    temporizador.current = null;
  };

  const props = {
    onPointerDown: (e) => {
      if (ignorarBotones && e.target.closest?.('button')) return;
      largo.current = false;
      cancelar();
      inicio.current = [e.clientX, e.clientY];
      temporizador.current = setTimeout(() => {
        largo.current = true;
        try {
          globalThis.navigator?.vibrate?.(15);
        } catch {
          /* sin vibración */
        }
        cb.current?.();
      }, MS_LARGA);
    },
    onPointerMove: (e) => {
      if (temporizador.current && inicio.current && esMovimiento(inicio.current[0], inicio.current[1], e.clientX, e.clientY)) cancelar();
    },
    onPointerUp: cancelar,
    onPointerLeave: cancelar,
    onPointerCancel: cancelar,
    onContextMenu: (e) => e.preventDefault(),
  };
  const consumida = () => {
    const v = largo.current;
    largo.current = false;
    return v;
  };
  return { props, consumida };
}
