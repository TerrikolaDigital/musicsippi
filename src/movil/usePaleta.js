// src/movil/usePaleta.js
// Colores de tinte (principal y secundario, ya legibles bajo texto blanco) para el reproductor
// y el mini: salen de la carátula; sin ella (o si no se puede leer) de la portada generada.
import { useEffect, useState } from 'react';
import { luminanciaDePortada, paletaDePortada } from '../colorPortada.js';
import { aRgbDeHex, portadaGenerada, tinteLegible } from './portadaGenerada.js';

const css = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;

export function usePaleta(url, texto) {
  const [paleta, setPaleta] = useState(null);
  const [lum, setLum] = useState(null); // luminancia de la carátula; null = desconocida (velo de siempre)
  useEffect(() => {
    let vigente = true;
    if (!url) {
      setPaleta(null);
      setLum(null);
    } else {
      // Mientras llega la nueva se conserva la anterior: el color cambia con transición.
      paletaDePortada(url).then((p) => vigente && setPaleta(p));
      luminanciaDePortada(url).then((l) => vigente && setLum(l));
    }
    return () => {
      vigente = false;
    };
  }, [url]);
  const g = portadaGenerada(texto);
  const uno = paleta ? paleta.principal : aRgbDeHex(g.color);
  const dos = paleta ? paleta.secundario : aRgbDeHex(g.color2);
  return { t1: css(tinteLegible(uno)), t2: css(tinteLegible(dos)), lum };
}
