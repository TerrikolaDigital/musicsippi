// src/data/audio-nativo.js
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { loudnessRelativo } from './nivelar-volumen.js';
import { estaGuardada, obtenerEstadoSinConexion } from './sin-conexion-nativo.js';
import { urlSinConexion } from './sin-conexion.js';

const ReproductorNativo = registerPlugin('ReproductorNativo');
//
// Resuelve un videoId de YouTube a una URL de audio directa (googlevideo) que
// el reproductor nativo (Media3/ExoPlayer) pueda abrir sin el iframe. Corre
// dentro del WebView de Capacitor y también en Node (scripts/probar-audio-
// clientes.mjs), por eso NO importa youtubei.js de forma estática: en Node
// resuelve al build "node" y en el WebView al "browser" (exports de su
// package.json), y el chunk solo se baja cuando de verdad se necesita.
//
// Hecho comprobado (youtubei.js 18): getBasicInfo(id, { client: 'IOS' }) +
// chooseFormat + decipher dan una URL que sirve audio sin evaluador JS.
// YTMUSIC/MWEB lo necesitan; ANDROID/WEB/TV/WEB_EMBEDDED fallan.
//
// Las URLs de googlevideo caducan en horas y están firmadas para el cliente
// que las pidió: hay que reproducirlas con SU user-agent o llega 403 / una
// descarga lenta. Por eso se devuelve `headers` junto a la URL y se resuelve
// justo antes de reproducir; la caché es por videoId y corta, no por URL.

// Orden de preferencia. IOS es el único verificado hoy; los demás son el plan
// B si YouTube lo cierra (el script de prueba dice cuál funciona de verdad).
const CLIENTES = ['IOS', 'ANDROID_VR', 'VISIONOS'];

// user-agent con el que cada cliente firma sus URLs (mismos valores que
// youtubei.js 18 usa en utils/Constants.js).
const USER_AGENT_POR_CLIENTE = {
  IOS: 'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
  ANDROID_VR:
    'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
  VISIONOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
};

const TTL_CACHE_MS = 20 * 60 * 1000;

let clienteRecordado = null;
let promesaInnertube = null;
let promesaBusqueda = null; // solo búsqueda: sin descargar el script del reproductor
const cache = new Map(); // videoId -> { resultado, vence }

function mejorMiniatura(miniaturas) {
  const todas = Array.isArray(miniaturas) ? miniaturas.filter((m) => m?.url) : [];
  return todas.reduce((mejor, actual) => {
    if (!mejor) return actual;
    return (actual.width ?? 0) * (actual.height ?? 0) > (mejor.width ?? 0) * (mejor.height ?? 0)
      ? actual
      : mejor;
  }, null)?.url ?? null;
}

/** Error con `codigo`: 'no_disponible' (el video no se puede reproducir) o 'resolucion' (fallo técnico/red). */
export class ErrorAudio extends Error {
  constructor(codigo, mensaje, detalle) {
    super(mensaje);
    this.name = 'ErrorAudio';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

/**
 * fetch por HTTP nativo de Capacitor: evita CORS (youtubei.js llama a
 * youtube.com desde un origen https://localhost) y permite cabeceras que el
 * navegador prohíbe. Solo se usa dentro del WebView nativo.
 */
export function crearFetchNativo() {
  return async function fetchNativo(entrada, init) {
    const req = new Request(entrada, init);
    const headers = {};
    req.headers.forEach((valor, clave) => {
      headers[clave] = valor;
    });
    const metodo = req.method.toUpperCase();
    let data;
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      data = await req.clone().text();
      // El plugin nativo espera objeto cuando el content-type es JSON.
      if ((headers['content-type'] ?? '').includes('json')) {
        try {
          data = JSON.parse(data);
        } catch {
          // se manda como texto
        }
      }
    }
    const r = await CapacitorHttp.request({
      url: req.url,
      method: metodo,
      headers,
      data,
      responseType: 'text',
      connectTimeout: 15000,
      readTimeout: 20000,
    });
    const sinCuerpo = [101, 204, 205, 304].includes(r.status);
    const cuerpo = sinCuerpo ? null : typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    return new Response(cuerpo, { status: r.status, headers: r.headers });
  };
}

// Cliente solo para buscar metadatos (modo iframe): no descarga el script del
// reproductor de YouTube, que solo hace falta para resolver URLs de audio.
async function obtenerInnertubeBusqueda(fetchPropio) {
  promesaBusqueda ??= (async () => {
    const { Innertube } = await import('youtubei.js');
    return Innertube.create({
      ...(fetchPropio ? { fetch: fetchPropio } : {}),
      generate_session_locally: true,
      retrieve_player: false,
    });
  })().catch((e) => {
    promesaBusqueda = null;
    throw e;
  });
  return promesaBusqueda;
}

async function obtenerInnertube(fetchPropio) {
  if (!promesaInnertube) {
    promesaInnertube = (async () => {
      const { Innertube } = await import('youtubei.js');
      return Innertube.create({
        ...(fetchPropio ? { fetch: fetchPropio } : {}),
        // Sin ping de configuración a youtube.com: una petición menos al arrancar.
        generate_session_locally: true,
        retrieve_player: true,
      });
    })().catch((e) => {
      promesaInnertube = null; // permitir reintento
      throw e;
    });
  }
  return promesaInnertube;
}

/**
 * Busca en YouTube Music como canción (pistas de audio de los canales
 * "Topic": versión de estudio, sin intros de videoclip). Sustituye a la Data
 * API en la app Android: no necesita clave ni tiene cuota diaria.
 * No usa el getter `.songs` (depende del idioma del shelf): recorre todos los
 * ítems y se queda con los de tipo canción.
 * @returns {Promise<Array<{ videoId: string, titulo: string, artistas: string[], duracion: number, album: string|null, thumbnail: string|null }>>}
 */
/**
 * Artistas de un ítem de búsqueda. Según el cliente, YouTube Music los da en `artists`, en
 * `authors`/`author` o solo en el subtítulo («Artista • Álbum • 3:20»); sin esto la fila de
 * Buscar salía sin artista.
 */
export function artistasDeItem(it) {
  const nombres = (lista) => (lista ?? []).map((a) => a?.name).filter(Boolean);
  const directos = nombres(it?.artists);
  if (directos.length) return directos;
  const autores = nombres(it?.authors);
  if (autores.length) return autores;
  if (it?.author?.name) return [it.author.name];
  const sub = String(it?.subtitle?.text ?? it?.flex_columns?.[1]?.title?.text ?? '');
  const primero = sub.split(' • ').map((s) => s.trim()).filter((s) => s && !/^(canción|song|vídeo|video)$/i.test(s))[0];
  return primero ? [primero] : [];
}

export async function buscarCanciones(query, { fetch: fetchPropio, max = 8 } = {}) {
  const yt = await obtenerInnertubeBusqueda(fetchPropio);
  const r = await yt.music.search(query, { type: 'song' });
  const items = [];
  for (const shelf of r.contents ?? []) {
    for (const it of shelf.contents ?? []) {
      if (it.item_type !== 'song' || !it.id) continue;
      items.push({
        videoId: it.id,
        titulo: it.title ?? '',
        artistas: artistasDeItem(it),
        duracion: Number(it.duration?.seconds ?? 0),
        album: it.album?.name ?? null,
        thumbnail: mejorMiniatura(it.thumbnails),
      });
    }
  }
  return items.slice(0, max);
}

/** Radio desde esta canción: mix automático de YouTube Music + reglas de lib/radio.js. */
export async function radioDesde(videoId, artista, { fetch: fetchPropio } = {}) {
  const yt = await obtenerInnertubeBusqueda(fetchPropio);
  const { armarRadio, pistaDeNodo } = await import('./lib/radio.js');
  const panel = await yt.music.getUpNext(videoId, true);
  const pistas = (panel.contents ?? []).filter((n) => n.video_id).map(pistaDeNodo);
  return armarRadio(pistas, { videoId, artista });
}

function esPlayabilityFatal(estado) {
  return estado && estado !== 'OK';
}

/**
 * @param {string} videoId
 * @param {{ forzar?: boolean, fetch?: typeof fetch, clientes?: string[] }} [opciones]
 *   `fetch`: implementación a pasar a Innertube.create (solo cuenta la primera
 *   vez; en el WebView se pasa crearFetchNativo()). `forzar` salta la caché
 *   (usar tras un 403/410 por URL caducada).
 * @returns {Promise<{ url: string, headers: Record<string,string>, mime: string, duracion: number, cliente: string, loudnessDb: number|null }>}
 */
export async function resolverAudio(videoId, opciones = {}) {
  if (!videoId) throw new ErrorAudio('no_disponible', 'videoId vacío');
  const { forzar = false, fetch: fetchPropio, clientes = CLIENTES } = opciones;

  // Guardada para escuchar sin conexión: se reproduce de la caché nativa, sin resolver URL.
  // Con `forzar` (error irrecuperable de esa copia) se salta y se resuelve por red.
  if (!forzar && Capacitor.isNativePlatform() && estaGuardada(videoId)) {
    const dB = obtenerEstadoSinConexion().sonoridad[videoId];
    return { url: urlSinConexion(videoId), headers: {}, mime: 'audio/mp4', duracion: 0, cliente: 'sin-conexion', loudnessDb: Number.isFinite(dB) ? dB : null };
  }

  const enCache = cache.get(videoId);
  if (!forzar && enCache && enCache.vence > Date.now()) return enCache.resultado;

  // En la app: resolución nativa con InnerTubeX (como BitChord), que elige un
  // cliente cuya URL suena entera y la comprueba pasado el primer MB.
  if (Capacitor.isNativePlatform()) {
    try {
      const r = await ReproductorNativo.resolver({ videoId });
      const resultado = {
        url: r.url,
        headers: r.headers ?? {},
        mime: String(r.mime ?? 'audio/mp4').split(';')[0],
        duracion: 0,
        cliente: r.cliente,
        loudnessDb: Number.isFinite(r.loudnessDb) ? r.loudnessDb : null,
      };
      cache.set(videoId, { resultado, vence: Date.now() + TTL_CACHE_MS });
      return resultado;
    } catch (e) {
      throw new ErrorAudio('resolucion', `InnerTubeX no resolvió ${videoId}: ${e?.message ?? e}`, e);
    }
  }

  let yt;
  try {
    yt = await obtenerInnertube(fetchPropio);
  } catch (e) {
    throw new ErrorAudio('resolucion', `no se pudo iniciar youtubei.js: ${e?.message ?? e}`, e);
  }

  // El cliente que funcionó la última vez va primero.
  const orden = clienteRecordado
    ? [clienteRecordado, ...clientes.filter((c) => c !== clienteRecordado)]
    : [...clientes];

  const fallos = [];
  let todosPlayability = true;
  for (const cliente of orden) {
    try {
      const info = await yt.getBasicInfo(videoId, { client: cliente });
      const estado = info.playability_status?.status;
      if (esPlayabilityFatal(estado)) {
        fallos.push(`${cliente}: ${estado} ${info.playability_status?.reason ?? ''}`.trim());
        continue;
      }
      todosPlayability = false;
      const formato = info.chooseFormat({ type: 'audio', quality: 'best' });
      const url = await formato.decipher(yt.session.player);
      if (!url) throw new Error('decipher devolvió una URL vacía');
      clienteRecordado = cliente;
      const resultado = {
        url,
        headers: { 'User-Agent': USER_AGENT_POR_CLIENTE[cliente] ?? USER_AGENT_POR_CLIENTE.IOS },
        mime: String(formato.mime_type ?? 'audio/mp4').split(';')[0],
        duracion: Number(info.basic_info?.duration ?? 0),
        cliente,
        // Sonoridad respecto a la referencia de YouTube (para «Nivelar volumen»).
        loudnessDb: loudnessRelativo({
          loudnessDb: info.page?.[0]?.player_config?.audio_config?.loudness_db ?? formato.loudness_db,
          perceptualLoudnessDb: info.page?.[0]?.player_config?.audio_config?.perceptual_loudness_db,
        }),
      };
      cache.set(videoId, { resultado, vence: Date.now() + TTL_CACHE_MS });
      return resultado;
    } catch (e) {
      todosPlayability = false;
      fallos.push(`${cliente}: ${e?.message ?? e}`);
      if (cliente === clienteRecordado) clienteRecordado = null;
    }
  }
  const codigo = todosPlayability ? 'no_disponible' : 'resolucion';
  throw new ErrorAudio(codigo, `ningún cliente pudo resolver ${videoId} (${fallos.join(' | ')})`, fallos);
}

/** Descarta lo cacheado de un video (tras 403/410 en la reproducción). */
export function olvidarAudio(videoId) {
  cache.delete(videoId);
}
