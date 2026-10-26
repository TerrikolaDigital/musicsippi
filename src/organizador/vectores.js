// Caché de embeddings por canción en IndexedDB (store `vectores`): sustituye a
// vectores-indice.json + vectores.bin del PC. `hash` es el del texto embebido:
// si cambia (nuevos géneros), el vector se recalcula.
export function hashTexto(texto) {
  let h1 = 0x811c9dc5;
  let h2 = 0x5bd1e995;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export async function cargarVectores(almacen, trackIds) {
  const buscados = new Set(trackIds);
  return (await almacen.obtenerTodos('vectores')).filter((v) => buscados.has(v.trackId));
}

export function guardarVectores(almacen, registros) {
  return almacen.guardarVarios('vectores', registros);
}
