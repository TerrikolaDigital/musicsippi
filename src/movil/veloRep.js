// src/movil/veloRep.js
// Velo oscuro del reproductor según lo clara que sea la carátula, para que el texto blanco
// cumpla contraste >= 4.5:1 (WCAG AA). Parte pura, sin DOM.

const OBJETIVO = 0.15; // luminancia máxima del fondo tras el velo: blanco/(L+0.05) >= 4.5 exige <= 0.183
const L_VELO = 0.004; // luminancia del color del velo, rgb(10 11 22)

const lineal = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Luminancia relativa WCAG (0..1) de un color 0..255. */
export const luminanciaRgb = (r, g, b) => 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);

/** Parte pura: array RGBA (cuadrado) -> luminancia media; el máximo entre toda la imagen y su mitad inferior (donde va el texto). */
export function luminanciaDeDatos(data) {
  const n = data.length / 4;
  if (!n) return 0;
  let total = 0;
  let abajo = 0;
  for (let i = 0; i < n; i++) {
    const l = luminanciaRgb(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    total += l;
    if (i >= n / 2) abajo += l;
  }
  return Math.max(total / n, abajo / (n / 2));
}

/** Contraste del texto blanco sobre un fondo de luminancia l. */
export const contrasteBlanco = (l) => 1.05 / (l + 0.05);

/** Opacidad mínima del velo para que un fondo de luminancia l quede en el objetivo. */
const opacidadNecesaria = (l) => (l <= OBJETIVO ? 0 : Math.min(0.9, (l - OBJETIVO) / (l - L_VELO)));

/**
 * Valores de las variables CSS del reproductor completo para una carátula de luminancia lum.
 * medio/fin: opacidad del velo a mitad y al final; mascara: opacidad del degradado de la portada en su 74 %.
 * Con carátula oscura (o desconocida) devuelve los valores de siempre.
 */
export function veloReproductor(lum) {
  const a = opacidadNecesaria(Number.isFinite(lum) ? lum : 0);
  return {
    medio: Math.max(0.25, +a.toFixed(3)),
    fin: Math.max(0.72, +a.toFixed(3)),
    mascara: +(0.55 - 0.3 * Math.min(1, a / 0.8)).toFixed(3),
  };
}

/** Velo del mini-reproductor: su fondo ya va con brightness(0.6) (~0.33 en luminancia lineal). */
export function veloMini(lum) {
  const a = opacidadNecesaria(Number.isFinite(lum) ? lum * 0.33 : 0);
  return Math.max(0.35, +a.toFixed(3));
}
