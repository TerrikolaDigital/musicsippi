// src/movil/useCruce.js
// Fundido cruzado entre carátulas: la nueva se precarga y, solo cuando está lista, se
// monta ENCIMA de la anterior (que sigue debajo hasta que acaba el fundido). Así no hay
// saltos ni parpadeos en negro al cambiar de canción. Devuelve las capas, de abajo arriba.
import { useEffect, useRef, useState } from 'react';
import { respaldoDeUrl } from './respaldoPortadas.js';
import { esPortadaGenerica } from './portadaPlaceholder.js';

export const DURACION_CRUCE_MS = 500;

// `respaldo`: segunda dirección si la primera falla (tras un reintento). Las direcciones de YouTube Music
// fallan a veces en el WebView aunque el reproductor nativo las cargue.
export function useCruce(url, respaldo = null) {
  const contador = useRef(0);
  const [capas, setCapas] = useState(() => (url ? [{ url, k: 0 }] : []));
  useEffect(() => {
    let vigente = true;
    let temporizador;
    if (!url) {
      setCapas([]);
      return undefined;
    }
    let img;
    const alterna = respaldo ?? respaldoDeUrl(url);
    const intentos = [url, url, alterna].filter(Boolean).filter((u, i, l) => i < 2 || u !== url || l.length === 2);
    const probar = (i) => {
      const u = intentos[i];
      img = new Image();
      img.onload = async () => {
        if (!vigente) return;
        // La carátula gris genérica de Deezer carga «bien»: cuenta como imagen caída.
        if (await esPortadaGenerica(u)) {
          if (vigente) img.onerror();
          return;
        }
        if (!vigente) return;
        setCapas((prev) => {
          if (prev.length && prev[prev.length - 1].url === u) return prev;
          contador.current += 1;
          return [...prev.slice(-1), { url: u, k: contador.current }];
        });
        // Acabado el fundido, la capa de abajo ya no se ve: se retira.
        temporizador = setTimeout(() => vigente && setCapas((prev) => prev.slice(-1)), DURACION_CRUCE_MS + 80);
      };
      img.onerror = () => {
        if (!vigente) return;
        // Reintento (tras una pausa) y luego el respaldo; sin más, se vacía y los llamadores enseñan la portada generada.
        if (i + 1 < intentos.length) temporizador = setTimeout(() => vigente && probar(i + 1), i === 0 ? 900 : 0);
        else setCapas([]);
      };
      img.src = u;
    };
    probar(0);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
      if (img) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [url, respaldo]);
  return capas;
}
