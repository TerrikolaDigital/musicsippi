// src/movil/resumen/coloresHistorias.js
// Color de cada historia del resumen (y de su tarjeta para compartir): el de la carátula en la
// canción en bucle y el descubrimiento, la foto del primer artista, el del modo en la historia
// del modo y una paleta de la marca en minutos, hora y la tarjeta final sin carátula.
import { paletaDePortada } from '../../colorPortada.js';
import { aRgbDeHex, tinteLegible } from '../portadaGenerada.js';

export const MARCA = { minutos: '#7c5cff', hora: '#c64ff0', artistas: '#ff4d8d', bucle: '#7c5cff', curioso: '#ff8a3d', final: '#ff4d8d' };

const css = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;
/** Color de marca ya legible bajo texto blanco. */
export const legible = (hex) => css(tinteLegible(aRgbDeHex(hex)));

/** Colores iniciales (sin leer imágenes): marca + color del modo. */
export function coloresBase(colorModo) {
  return { ...Object.fromEntries(Object.entries(MARCA).map(([k, v]) => [k, legible(v)])), modo: colorModo };
}

/** Colores definitivos; lo que no se pueda leer de las imágenes queda en el de marca. */
export async function coloresHistorias(urls, colorModo) {
  const base = coloresBase(colorModo);
  const dominante = async (url) => {
    if (!url) return null;
    try {
      const p = await paletaDePortada(url);
      return p?.principal ? css(tinteLegible(p.principal)) : null;
    } catch {
      return null;
    }
  };
  const [bucle, curioso, artista] = await Promise.all([dominante(urls.bucle), dominante(urls.descubre), dominante(urls.artistas?.[0])]);
  return { ...base, bucle: bucle ?? base.bucle, curioso: curioso ?? base.curioso, artistas: artista ?? base.artistas, final: bucle ?? base.final };
}
