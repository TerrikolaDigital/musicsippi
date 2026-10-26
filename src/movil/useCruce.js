// src/movil/useCruce.js
// Fundido cruzado entre carátulas: la nueva se precarga y, solo cuando está lista, se
// monta ENCIMA de la anterior (que sigue debajo hasta que acaba el fundido). Así no hay
// saltos ni parpadeos en negro al cambiar de canción. Devuelve las capas, de abajo arriba.
import { useEffect, useRef, useState } from 'react';

export const DURACION_CRUCE_MS = 500;

export function useCruce(url) {
  const contador = useRef(0);
  const [capas, setCapas] = useState(() => (url ? [{ url, k: 0 }] : []));
  useEffect(() => {
    let vigente = true;
    let temporizador;
    if (!url) {
      setCapas([]);
      return undefined;
    }
    const img = new Image();
    img.onload = () => {
      if (!vigente) return;
      setCapas((prev) => {
        if (prev.length && prev[prev.length - 1].url === url) return prev;
        contador.current += 1;
        return [...prev.slice(-1), { url, k: contador.current }];
      });
      // Acabado el fundido, la capa de abajo ya no se ve: se retira.
      temporizador = setTimeout(() => vigente && setCapas((prev) => prev.slice(-1)), DURACION_CRUCE_MS + 80);
    };
    // Imagen caída: se vacía y los llamadores enseñan la portada generada.
    img.onerror = () => vigente && setCapas([]);
    img.src = url;
    return () => {
      vigente = false;
      clearTimeout(temporizador);
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);
  return capas;
}
