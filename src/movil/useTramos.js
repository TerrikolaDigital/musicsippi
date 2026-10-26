// src/movil/useTramos.js
// Montaje por tramos de una lista larga: devuelve cuántas filas pintar y la ref
// del centinela que hay que poner tras la última (al acercarse, monta el siguiente tramo).
import { useEffect, useRef, useState } from 'react';
import { tramoVisible, TRAMO } from './tramos.js';

export function useTramos(total, clave) {
  const [mostrados, setMostrados] = useState(TRAMO);
  const centinela = useRef(null);

  // Al cambiar la lista (otro filtro u orden) se vuelve al primer tramo.
  useEffect(() => {
    setMostrados(TRAMO);
  }, [clave]);

  useEffect(() => {
    const el = centinela.current;
    if (!el || mostrados >= total) return undefined;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) setMostrados((m) => tramoVisible(total, m, true));
      },
      { rootMargin: '600px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [total, mostrados]);

  return { cuantas: tramoVisible(total, mostrados, false), centinela };
}
