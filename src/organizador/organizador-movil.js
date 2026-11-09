// Instancia real del organizador del móvil (IndexedDB, red nativa, Worker).
// Se carga con import() dinámico desde la interfaz: el escritorio nunca la usa.
import * as db from '../data/lib/db.js';
import fuentes from '../../data/fuentes.json';
import { crearHttp } from '../importar/http-nativo.js';
import { crearOrganizador } from './coordinador.js';
import { crearCanalWorker } from './canal-worker.js';
import {
  enriquecerDeezerPendientes,
  enriquecerMusicbrainzPendientes,
  enriquecerMusicbrainzDetallePendientes,
  enriquecerRitmoPendientes,
} from './enriquecer-movil.js';
import { completarImagenes, completarFotosArtistas, artistasSinFotoMetadata } from './completar-imagenes.js';
import { obtenerMetadata } from '../data/biblioteca-local.js';
import { alimentarEstadosPendientes } from './alimentar-estados.js';
import { completarVectoresBiblioteca, LOTE_VECTORES } from './vectores-biblioteca.js';
import { redMedida } from '../data/nativo-movil.js';
import { MODELO, DTYPE_MOVIL, ARCHIVO_MODELO } from './modelo.js';

const http = crearHttp();
const pedir = crearCanalWorker(() => new Worker(new URL('./organizador.worker.js', import.meta.url), { type: 'module' }));

async function modeloDisponible() {
  try {
    const cache = await caches.open('transformers-cache');
    return (await cache.keys()).some((r) => r.url.includes(MODELO) && r.url.endsWith(ARCHIVO_MODELO));
  } catch {
    return false;
  }
}

/** Lo que decide si toca organizar solo: modelo ya descargado y si la red es de pago/desconocida. */
export async function situacionRed() {
  return { modeloDisponible: await modeloDisponible(), redMedida: await redMedida() };
}

let fetchNativo = null;
// buscarCanciones importa Capacitor: se carga solo al usarla.
async function buscarCancionesYoutube(query) {
  const { buscarCanciones, crearFetchNativo } = await import('../data/audio-nativo.js');
  // Un HTTP de error debe lanzar (no quedar como «sin resultados»): así un corte no marca la canción como no encontrada.
  fetchNativo ??= (() => {
    const base = crearFetchNativo();
    return async (...args) => {
      const r = await base(...args);
      if (r.status >= 400) throw new Error(`YouTube Music HTTP ${r.status}`);
      return r;
    };
  })();
  return buscarCanciones(query, { fetch: fetchNativo, max: 5 });
}

export const organizador = crearOrganizador({
  almacen: db,
  fuentes,
  enriquecerDeezer: (opciones) => enriquecerDeezerPendientes({ almacen: db, http, ...opciones }),
  enriquecerMusicbrainz: (opciones) => enriquecerMusicbrainzPendientes({ almacen: db, http, ...opciones }),
  enriquecerMusicbrainzDetalle: (opciones) => enriquecerMusicbrainzDetallePendientes({ almacen: db, http, ...opciones }),
  completarImagenes: async (opciones) => {
    const resultado = await completarImagenes({ almacen: db, http, buscarCanciones: buscarCancionesYoutube, obtenerMetadata, ...opciones });
    const [tracks, metadata] = await Promise.all([db.obtenerTodos('biblioteca'), obtenerMetadata()]);
    const fotos = await completarFotosArtistas({ almacen: db, http, nombres: artistasSinFotoMetadata(tracks, metadata) });
    return { ...resultado, encontradas: resultado.encontradas + (fotos?.encontradas ?? 0) };
  },
  enriquecerRitmo: (opciones) => enriquecerRitmoPendientes({ almacen: db, http, ...opciones }),
  completarVectores: ({ onProgreso }) =>
    completarVectoresBiblioteca({
      almacen: db,
      fuentes,
      embeberItems: (items, onLote) =>
        pedir('vectores', { items, lote: LOTE_VECTORES, dtype: DTYPE_MOVIL }, (p) => {
          if (p.lote) onLote(p.lote);
          onProgreso?.(p.hechas ?? 0, p.total ?? 0);
        }),
    }),
  alimentarEstados: () => alimentarEstadosPendientes({ almacen: db }),
  calcular: (entrada, { onProgreso }) => pedir('calcular', { entrada, dtype: DTYPE_MOVIL }, onProgreso),
  modeloDisponible,
  redMedida,
});
