/**
 * Resolución masiva contra YouTube vía InnerTube (youtubei.js) — la lógica
 * central, sin CLI ni manejo de archivos alrededor, para que la use tanto
 * `resolver-youtube.mjs` (a mano) como `importar.mjs` (automático al final
 * de una importación). Ver el comentario largo en resolver-youtube.mjs sobre
 * por qué InnerTube y no la Data API oficial.
 */

import { Innertube } from 'youtubei.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverDataDir } from './data-dir.mjs';
import { obtenerCampo } from './contratos-externos.mjs';

const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

// Rutas reales confirmadas en vivo contra youtubei.js@18.0.0 (Tarea 6):
// `description_snippet` existe como clave pero siempre llegó `undefined` en
// las pruebas — el texto de descripción vive en `snippets[0].text.text`.
const CAMPOS_BUSQUEDA = {
  titulo: 'title.text',
  canal: 'author.name',
  descripcion: 'snippets.0.text.text',
};

/**
 * Resuelve `tracks` contra YouTube y escribe cada hallazgo en `cache`
 * (mutado in-place, trackId -> videoId). No cachea los "sin resultado" —
 * acá no hay cuota que cuidar, así que no cuesta nada reintentarlos en la
 * próxima corrida en vez de marcarlos como perdidos para siempre.
 *
 * Además persiste canal/título/fragmento de descripción del mismo resultado
 * de búsqueda en `data/resolucion-youtube.json` — es información que la
 * búsqueda ya trae gratis (no dispara ninguna llamada de red extra) y sirve
 * de pasada barata de enriquecimiento para la clasificación semántica.
 * `cache-youtube.json` (trackId -> videoId) no cambia de forma: otro módulo
 * depende de esa forma exacta.
 *
 * `onProgreso(i, total, stats)` es opcional, para que el llamador imprima lo
 * que quiera (o nada, si se usa silenciosamente desde importar.mjs).
 */
export async function resolverPendientes(tracks, cache, { onProgreso, esperaMs = 400 } = {}) {
  if (tracks.length === 0) return { encontrados: 0, sinResultado: 0, errores: 0 };

  const yt = await Innertube.create({ generate_session_locally: true });

  // scripts/lib/ -> subir dos niveles para llegar a la raíz del proyecto
  // (resolverRaizYDataDir asume que el llamador vive directo en scripts/, acá
  // no aplica — se reusa resolverDataDir directamente con la raíz correcta).
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dataDir = resolverDataDir(raiz);
  const resolucionPath = join(dataDir, 'resolucion-youtube.json');
  const resolucion = existsSync(resolucionPath) ? JSON.parse(readFileSync(resolucionPath, 'utf8')) : {};

  // Mismo patrón de relectura-antes-de-escribir que cache-youtube.json en los
  // llamadores: no pisar lo que otro proceso (servidor de dev, otra corrida)
  // haya podido escribir mientras tanto.
  function guardarResolucion() {
    const actual = existsSync(resolucionPath) ? JSON.parse(readFileSync(resolucionPath, 'utf8')) : {};
    Object.assign(actual, resolucion);
    writeFileSync(resolucionPath, JSON.stringify(actual, null, 2), 'utf8');
  }

  let encontrados = 0;
  let sinResultado = 0;
  let errores = 0;

  for (const [i, t] of tracks.entries()) {
    try {
      const r = await yt.search(t.youtubeQuery, { type: 'video' });
      const video = r.videos?.[0] ?? null;
      const videoId = video?.id ?? null;
      if (videoId) {
        cache[t.id] = videoId;
        resolucion[t.id] = {
          titulo: obtenerCampo(video, CAMPOS_BUSQUEDA.titulo) ?? '',
          canal: obtenerCampo(video, CAMPOS_BUSQUEDA.canal) ?? '',
          descripcion: obtenerCampo(video, CAMPOS_BUSQUEDA.descripcion) ?? '',
        };
        encontrados++;
      } else {
        sinResultado++;
      }
    } catch {
      errores++;
    }
    onProgreso?.(i + 1, tracks.length, { encontrados, sinResultado, errores });
    // Mismo cadencia de checkpoint que usan los llamadores para
    // cache-youtube.json (cada 20 o al terminar): que un corte a mitad de
    // camino (Ctrl+C, crash) pierda como máximo la última tanda parcial.
    if ((i + 1) % 20 === 0 || i + 1 === tracks.length) guardarResolucion();
    await esperar(esperaMs);
  }

  return { encontrados, sinResultado, errores };
}
