// Lo que necesita el cálculo, leído de IndexedDB: las canciones sin modo, con o sin la
// marca «Sin clasificar» (la misma cuenta que enseña la app; antes solo entraban las marcadas
// y el resto se quedaba sin colocar para siempre) (como reDescubrirYAutoConfirmar del PC), su evidencia de género,
// los modos actuales y los vectores ya calculados. La masa mínima se mide
// contra toda la biblioteca (totalTracks).
import { evidenciaDeBiblioteca } from './evidencia-movil.js';
import { cargarVectores } from './vectores.js';
import { idsDeEstado, necesitaGenero } from './sin-modo.js';

export async function prepararEntrada(almacen, fuentes) {
  const [tracks, ejes, registros] = await Promise.all([
    almacen.obtenerTodos('biblioteca'),
    almacen.obtenerTodos('ejes'),
    almacen.obtenerTodos('generos'),
  ]);
  // R7: también las que solo tienen un estado (sin género) entran en la cola.
  const estados = idsDeEstado(ejes);
  const sinClasificar = tracks.filter((t) => necesitaGenero(t, estados));
  const evidencia = evidenciaDeBiblioteca(sinClasificar, registros, ejes, fuentes);
  return {
    tracks: sinClasificar,
    evidencia: [...evidencia],
    ejes,
    fuentes,
    totalTracks: tracks.length,
    vectoresPrevios: await cargarVectores(almacen, sinClasificar.map((t) => t.id)),
  };
}
