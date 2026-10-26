// src/movil/useArrastreCerrar.js
// Arrastrar una capa hacia abajo con el dedo (por su tirador/cabecera) y, al
// soltar, cerrarla si `deberiaCerrar` lo decide; si no, vuelve a su sitio.
import { useRef, useState } from 'react';
import { deberiaCerrar } from './gestos.js';

export function useArrastreCerrar(onCerrar, { porAlto = false } = {}) {
  const [dy, setDy] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const inicio = useRef(null);

  const alBajar = (e) => {
    // `porAlto` (hojas): el umbral de distancia es el 30 % del alto de la capa (padre del asa).
    inicio.current = { y: e.clientY, t: e.timeStamp, alto: porAlto ? e.currentTarget.parentElement?.offsetHeight ?? 0 : 0 };
    setArrastrando(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const alMover = (e) => {
    if (!inicio.current) return;
    setDy(Math.max(0, e.clientY - inicio.current.y));
  };
  const alSoltar = (e) => {
    const ini = inicio.current;
    if (!ini) return;
    inicio.current = null;
    setArrastrando(false);
    const d = e.clientY - ini.y;
    const vy = d / Math.max(1, e.timeStamp - ini.t);
    setDy(0);
    if (deberiaCerrar({ dy: d, vy, alto: ini.alto })) onCerrar();
  };

  return {
    dy,
    arrastrando,
    // Se esparcen sobre el elemento que hace de asa (touch-action: none en CSS).
    asa: { onPointerDown: alBajar, onPointerMove: alMover, onPointerUp: alSoltar, onPointerCancel: alSoltar },
  };
}
