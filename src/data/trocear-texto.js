// src/data/trocear-texto.js
// Parte un texto en trozos de como máximo `max` caracteres sin cortar un par sustituto UTF-16
// (el lado nativo codifica cada trozo a UTF-8 por separado).
export const TROZO_MAX = 256 * 1024;

export function trocearTexto(texto, max = TROZO_MAX) {
  const trozos = [];
  let i = 0;
  while (i < texto.length) {
    let fin = Math.min(i + max, texto.length);
    if (fin < texto.length) {
      const c = texto.charCodeAt(fin - 1);
      if (c >= 0xd800 && c <= 0xdbff) fin -= 1;
    }
    trozos.push(texto.slice(i, fin));
    i = fin;
  }
  return trozos;
}
