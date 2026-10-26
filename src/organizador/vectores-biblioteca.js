// src/organizador/vectores-biblioteca.js
// Vectores (embeddings) de TODA la biblioteca, no solo de lo que pasa por el organizador: hacen falta para que la
// señal «parecido» de los estados funcione. Se calculan una vez en segundo plano (en el Worker, por lotes, cada
// lote se guarda al terminar: si la app se cierra, la próxima pasada sigue donde quedó) y luego solo las nuevas
// o las que cambian de texto (hash distinto), igual que el organizador.
import { textoDeTrack, generosParaVector } from '../../scripts/lib/clasificar-embeddings-puro.mjs';
import { evidenciaDeBiblioteca } from './evidencia-movil.js';
import { hashTexto } from './vectores.js';

export const LOTE_VECTORES = 25;

/** Canciones sin vector (o con vector de otro texto): [{trackId, texto, hash}]. Mismo texto que el organizador (calculo.js). */
export function itemsFaltantes(tracks, evidencia, previos, ejes = []) {
  const porId = new Map(previos.map((v) => [v.trackId, v.hash]));
  const ejesPorId = new Map(ejes.map((e) => [e.id, e]));
  const items = [];
  for (const t of tracks) {
    const texto = textoDeTrack(t, { generos: generosParaVector(t, evidencia.get(t.id)?.generos ?? [], ejesPorId) });
    const hash = hashTexto(texto);
    if (porId.get(t.id) !== hash) items.push({ trackId: t.id, texto, hash });
  }
  return items;
}

/**
 * @param {object} p
 * @param {(items: object[], onLote: (registros: object[]) => void) => Promise<unknown>} p.embeberItems cálculo en el Worker;
 *   llama a `onLote` con cada lote ya calculado ([{trackId, hash, vector}])
 */
export async function completarVectoresBiblioteca({ almacen, fuentes, embeberItems }) {
  const [tracks, ejes, registros, previos] = await Promise.all([
    almacen.obtenerTodos('biblioteca'),
    almacen.obtenerTodos('ejes'),
    almacen.obtenerTodos('generos'),
    almacen.obtenerTodos('vectores'),
  ]);
  const items = itemsFaltantes(tracks, evidenciaDeBiblioteca(tracks, registros, ejes, fuentes), previos, ejes);
  if (items.length === 0) return { calculados: 0 };
  let guardando = Promise.resolve();
  let calculados = 0;
  await embeberItems(items, (lote) => {
    calculados += lote.length;
    guardando = guardando.then(() => almacen.guardarVarios('vectores', lote));
  });
  await guardando;
  return { calculados };
}
