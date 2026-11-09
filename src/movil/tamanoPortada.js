// src/movil/tamanoPortada.js
// Las direcciones de Deezer llevan el tamaño en la ruta («…/500x500-000000-80-0-0.jpg») y la CDN sirve cualquier
// tamaño estándar. Las filas de lista dibujan la portada a 48 px: pedirla a 120×120 (3,9 KB en vez de 27 KB y 17 veces
// menos píxeles que decodificar) hace el scroll mucho más fluido. Otras direcciones se devuelven tal cual.
const DEEZER = /^(https:\/\/cdn-images\.dzcdn\.net\/images\/(?:cover|artist)\/[0-9a-f]{32}\/)(\d+)x\2(-000000-80-0-0\.jpg)$/;

export function conTamano(url, px) {
  if (typeof url !== 'string' || !px) return url;
  const m = url.match(DEEZER);
  if (!m || Number(m[2]) <= px) return url;
  return `${m[1]}${px}x${px}${m[3]}`;
}
