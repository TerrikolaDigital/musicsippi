// src/movil/useEsMovil.js
import { useEffect, useState } from 'react';

const CONSULTA = '(max-width: 820px)';

/** true en pantallas estrechas (app Android y navegador del móvil). */
export function useEsMovil() {
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    const alCambiar = () => setEsMovil(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return esMovil;
}
