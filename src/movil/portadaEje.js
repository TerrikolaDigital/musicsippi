// src/movil/portadaEje.js
// Portada elegida a mano para un modo (`eje.portada`: URL de carátula o data URL JPEG).
const MAX = 1024;

/** Copia de `covers` (ejeId -> urls) con la portada propia de cada eje en primer lugar. */
export function conPortadasPropias(covers, ejes) {
  const propios = ejes.filter((e) => e.portada);
  if (propios.length === 0) return covers;
  const m = new Map(covers);
  for (const e of propios) m.set(e.id, [e.portada, ...(covers.get(e.id) ?? []).filter((u) => u !== e.portada)]);
  return m;
}

/** Tamaño reducido para que el lado mayor no pase de `max`. */
export function tamanoMaximo(w, h, max = MAX) {
  const f = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * f), h: Math.round(h * f) };
}

/** Imagen del móvil -> data URL JPEG de ≤ 1024 px (solo navegador). */
export async function imagenADataUrl(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se pudo leer la imagen.'));
      i.src = url;
    });
    const { w, h } = tamanoMaximo(img.naturalWidth, img.naturalHeight);
    const lienzo = document.createElement('canvas');
    lienzo.width = w;
    lienzo.height = h;
    lienzo.getContext('2d').drawImage(img, 0, 0, w, h);
    return lienzo.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
