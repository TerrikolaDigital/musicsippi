/**
 * Qué vídeo de YouTube suena para cada canción en el PC, con la misma regla que el móvil
 * (src/data/elegir-version.js y src/data/revisar-versiones.js).
 *
 * Antes el PC guardaba el primer resultado de la búsqueda de vídeos y no lo revisaba nunca: lo que
 * se veía (título, carátula o la miniatura de ese vídeo) no siempre era lo que sonaba. Ahora:
 *  - lo nuevo se busca primero en YouTube Music como canción (pista de estudio), después entre sus
 *    vídeos y, si sigue sin haber versión fiel, en la búsqueda de vídeos de siempre;
 *  - lo ya guardado se revisa una vez, al ir a sonar, y se cambia si no era la canción.
 *
 * La caché (`cache-youtube.json`, trackId -> videoId) no cambia de forma: el móvil y varios scripts
 * dependen de ella. Las marcas de «ya revisado» van aparte, en `revision-videos.json`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { escribirAtomico } from './escribir-atomico.mjs';
import {
  hayVersionFiel,
  ordenarPorParecido,
  mejorVersionParaRevisar,
  mejorVersionSabiendoLaGuardada,
} from '../../src/data/elegir-version.js';
import { crearRevisorVersiones, REVISION_VERSIONES } from '../../src/data/revisar-versiones.js';

const ARCHIVO_CACHE = 'cache-youtube.json';
const ARCHIVO_REVISIONES = 'revision-videos.json';
// Más margen que el móvil (2,5 s): aquí la revisión puede pedir además los datos del vídeo guardado.
const TOPE_ESPERA_MS = 4000;

function leerJson(ruta) {
  try {
    return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : {};
  } catch {
    return {};
  }
}

/** trackId -> { videoId, revision }: el vídeo que se revisó y con qué versión de los criterios. */
export function leerRevisiones(dataDir) {
  return leerJson(join(dataDir, ARCHIVO_REVISIONES));
}

/** Para los lotes que resuelven por búsqueda de vídeos: el resultado más fiel, no el primero. */
export function elegirVideoDeBusqueda(candidatos, { titulo, artista }) {
  return ordenarPorParecido(candidatos, { titulo, artista, duracionS: null })[0] ?? null;
}

/** Búsquedas de YouTube Music: el mismo código que usa la app Android, con el `fetch` de Node. */
export function crearBusquedasMusic() {
  const modulo = () => import('../../src/data/audio-nativo.js');
  return {
    buscarCanciones: async (q) => (await modulo()).buscarCanciones(q, { max: 8 }),
    buscarVideosMusic: async (q) => (await modulo()).buscarVideos(q, { max: 5 }),
  };
}

export function crearVersionesPc({
  dataDir,
  buscarCanciones,
  buscarVideosMusic,
  buscarVideosYoutube,
  datosDeVideo,
  revisor = crearRevisorVersiones({ topeMs: TOPE_ESPERA_MS }),
}) {
  const rutaCache = join(dataDir, ARCHIVO_CACHE);
  const rutaRevisiones = join(dataDir, ARCHIVO_REVISIONES);

  const sumar = (lista, extra) => {
    const vistos = new Set(lista.map((c) => c.videoId));
    return [...lista, ...extra.filter((c) => c?.videoId && !vistos.has(c.videoId))];
  };

  /** Todo lo que puede ser la canción, sin ordenar. Solo falla si no hay de dónde sacar nada. */
  async function candidatos(q, ref) {
    let lista = await buscarCanciones(q).catch(() => []);
    if (ref && !hayVersionFiel(lista, ref)) lista = sumar(lista, await buscarVideosMusic(q).catch(() => []));
    if (ref ? !hayVersionFiel(lista, ref) : lista.length === 0) {
      try {
        lista = sumar(lista, await buscarVideosYoutube(q));
      } catch (e) {
        if (lista.length === 0) throw e;
      }
    }
    return lista;
  }

  /** Ids del más fiel al menos, sin los que ya fallaron en este equipo. */
  async function ordenados(q, ref, vetados = []) {
    return ordenarPorParecido(await candidatos(q, ref), ref)
      .map((c) => c.videoId)
      .filter((id) => !vetados.includes(id));
  }

  function marcarRevisado(trackId, videoId) {
    const revisiones = leerJson(rutaRevisiones); // se relee: otra resolución pudo escribir mientras tanto
    revisiones[trackId] = { videoId, revision: REVISION_VERSIONES };
    escribirAtomico(rutaRevisiones, revisiones);
  }

  function guardar({ trackId, videoId }) {
    const cache = leerJson(rutaCache);
    if (cache[trackId] !== videoId) {
      cache[trackId] = videoId;
      escribirAtomico(rutaCache, cache);
    }
    marcarRevisado(trackId, videoId);
  }

  /**
   * El vídeo que debe sonar para una canción que ya tenía uno guardado. La primera vez lo comprueba
   * (y lo cambia si no era la canción); después contesta al momento. Nunca hace fallar la canción.
   * `refDe` es una función para no leer la biblioteca ni la metadata cuando ya está revisado.
   */
  async function revisarGuardado({ trackId, videoId, q, refDe, vetados = [] }) {
    const marca = leerRevisiones(dataDir)[trackId];
    if (marca?.videoId === videoId && (marca.revision ?? 0) >= REVISION_VERSIONES) return videoId;
    const ref = refDe();
    return revisor.revisar({
      cacheado: { trackId, videoId },
      ref,
      intocable: false,
      buscar: async () => (await candidatos(q, ref)).filter((c) => !vetados.includes(c.videoId)),
      elegir: async (lista) => {
        const fiel = mejorVersionParaRevisar(videoId, lista, ref);
        if (fiel) return fiel;
        // Sin versión fiel el móvil no toca nada porque no sabe qué es lo guardado. Aquí se puede preguntar.
        const guardada = lista.find((c) => c.videoId === videoId) ?? (await datosDeVideo(videoId).catch(() => null));
        return guardada ? mejorVersionSabiendoLaGuardada(guardada, lista, ref) : null;
      },
      guardar: async (registro) => guardar(registro),
    });
  }

  return { candidatos, ordenados, revisarGuardado, marcarRevisado };
}
