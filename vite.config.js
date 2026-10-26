import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';
import { join } from 'node:path';
import { Innertube } from 'youtubei.js';
import { parseFile } from 'music-metadata';
import { resolverDataDir } from './scripts/lib/data-dir.mjs';
import { idTrack } from './scripts/lib/id-track.mjs';
import { armarRadio, pistaDeNodo } from './src/data/lib/radio.js';
import {
  limpiarTitulo,
  clasificar,
  indiceSugerenciasPorArtista,
  sugerenciaUnanime,
  clasificarPorDescripcionYoutube,
  propagarSugerenciasUnanimes,
  podarEjesVacios,
} from './scripts/lib/clasificar.mjs';
import { parsearCsvTuneMyMusic, aplicarFilasTuneMyMusic } from './scripts/lib/importar-tunemymusic.mjs';
import { resolverMetadataLocal, aplicarArchivosLocales } from './scripts/lib/importar-local.mjs';
import { vectorDe, masCercanos, cargarIndice, similitudCoseno } from './scripts/lib/indice-vectores.mjs';
import { cargarFuentes, guardarSiValido, verificarActualizacion } from './scripts/lib/fuentes.mjs';
import { descubrirModos, calcularMasaMinima } from './scripts/lib/descubrir-modos.mjs';
import { escribirAtomico } from './scripts/lib/escribir-atomico.mjs';
import { copiaSiNuevaRafaga } from './scripts/lib/copia-rafaga.mjs';
import { unirModos as unirModosEnDatos } from './scripts/lib/unir-modos.mjs';
import { loudnessRelativo } from './src/data/nivelar-volumen.js';
import { crearServicioArchivos, esHostPrivado, CABECERA_NONCE, CABECERA_MARCA, CABECERA_FIRMA } from './scripts/lib/archivos-locales.mjs';
import { aplicarModosConfirmados } from './scripts/lib/aplicar-modos.mjs';
import { armarGenerosPorTrack, armarEvidenciaPorTrack } from './scripts/lib/generos-por-track.mjs';
import { dispararEnriquecimiento } from './scripts/lib/enriquecimiento-automatico.mjs';
import { repararDuplicadosEnDisco } from './scripts/lib/reparar-duplicados.mjs';
import { corregirNombresModos } from './scripts/lib/corregir-nombres-modos.mjs';
import { esquemaDeEjes } from './src/organizador/migrar-moods.js';
import {
  embeber,
  UMBRAL_SCORE,
  ejesClasificables,
  embeberEjes,
  mejorCandidato,
} from './scripts/lib/clasificar-embeddings.mjs';

// Repo público, sin autenticación, que se mantiene actualizado con
// data/fuentes.json (vocabulario/umbrales/transversales) — ver Tarea 11 del
// plan de modos dinámicos. Si el repo todavía no existe, verificarActualizacion
// devuelve {aplicado:false, errores:[`HTTP ${status}`]} sin lanzar excepción.
const URL_FUENTES_REMOTO = 'https://raw.githubusercontent.com/TerrikolaDigital/musicsippi-fuentes/main/fuentes.json';

// Ver scripts/lib/data-dir.mjs: usa data/ del proyecto si ya existe (esta
// instalación), o una carpeta de datos de usuario del SO si no (instalador
// futuro / instalación limpia sin data/ en el paquete).
const dataDir = resolverDataDir(process.cwd());
// Archivos de audio locales PC <-> móvil (solo LAN privada y con la clave de emparejamiento).
const archivosLocales = crearServicioArchivos({ dataDir });

/**
 * ¿Esta ruta cae dentro de data/? La usa `server.watch.ignored` (ver el
 * comentario largo abajo, en defineConfig).
 *
 * Las dos rutas se normalizan a barras normales antes de comparar porque NO
 * llegan en el mismo formato: chokidar entrega
 * "D:/PROPIOS/Musicsippi/data/biblioteca.json" mientras que `join` arma
 * "D:\PROPIOS\Musicsippi\data". Comparadas tal cual, en Windows el startsWith
 * no matchea NUNCA y el filtro no filtra nada. Pasó exactamente eso: la
 * primera versión de este arreglo parecía correcta y no servía para nada, y
 * solo se vio al loguear los dos valores lado a lado.
 */
function esDelDataDir(ruta) {
  const barras = (s) => s.replace(/\\/g, '/');
  const base = barras(dataDir);
  const r = barras(ruta);
  return r === base || r.startsWith(`${base}/`);
}

const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * fetch() a la API pública de Deezer con reintentos cortos. Sin esto, un
 * fallo de red transitorio o un 429/5xx puntual (medido en vivo: pasa de vez
 * en cuando buscando álbumes/artistas) tira un 500 completo al usuario, que
 * tiene que darse cuenta y reintentar a mano — reportado como "a veces dice
 * que no es posible, al segundo intento carga sin problema". Un 4xx que no
 * es rate-limit (400, 404) no es transitorio: no vale la pena reintentarlo.
 */
// Deezer no devuelve null cuando un artista no tiene foto real — devuelve una
// URL cargable de una silueta genérica de relleno. El id en la URL NO es fijo
// (varía por artista, medido en vivo), así que no sirve para detectarla por
// substring — pero el ARCHIVO sí es siempre el mismo JPEG de 32022 bytes
// (comparado a mano, visualmente: el ícono gris de "sin foto"). Se verifica
// UNA sola vez, al cachear el artista — después queda guardado como null y
// nunca se vuelve a pedir.
const TAMANO_SILUETA_DEEZER = 32022;

async function fotoDeezerValida(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!r.ok) return url; // no se pudo verificar: se deja como está, no se descarta de más
    const buf = await r.arrayBuffer();
    return buf.byteLength === TAMANO_SILUETA_DEEZER ? null : url;
  } catch {
    return url;
  }
}

/**
 * Enriquecimiento EN VIVO de un track recién agregado — antes esto solo
 * pasaba por scripts/enriquecer-deezer.mjs, que corre a mano y por lotes: un
 * track agregado desde la app se quedaba sin portada/álbum hasta la próxima
 * vez que alguien corriera el script (bug real: "la portada no carga aunque
 * la canción ya esté en la biblioteca" — la causa era esta, nunca se había
 * disparado ningún enriquecimiento). Mismo criterio que el script (búsqueda
 * por artista+título, primer resultado), una sola consulta, sin bloquear el
 * alta del track si Deezer no responde o no encuentra nada.
 */
async function enriquecerTrackDeezerUno(artista, titulo) {
  try {
    const q = encodeURIComponent(`${artista} ${titulo}`);
    const j = await fetchDeezerJson(`https://api.deezer.com/search?q=${q}&limit=1`);
    const item = j.data?.[0];
    if (!item) return null;
    const fotoCruda = item.artist?.picture_big ?? item.artist?.picture_medium ?? null;
    return {
      coverUrl: item.album?.cover_big ?? item.album?.cover_medium ?? null,
      fotoArtista: await fotoDeezerValida(fotoCruda),
      album: item.album?.title ?? null,
      duracionMs: item.duration ? item.duration * 1000 : null,
    };
  } catch {
    return null;
  }
}

async function fetchDeezerJson(url, intentos = 3) {
  let ultimoError;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || (r.status !== 429 && r.status < 500)) return r.json();
      ultimoError = new Error(`HTTP ${r.status}`);
    } catch (e) {
      ultimoError = e;
    }
    if (i < intentos - 1) await esperar(300 * (i + 1));
  }
  throw ultimoError;
}

/**
 * Respaldo cuando GET /search/album no encuentra nada (medido en vivo:
 * pasa con compilaciones/discos de nombre genérico, o títulos que Deezer
 * cataloga distinto al que trajo el import). Mismo dato que ya usa
 * GET /artista para su discografía — resolver el artista y buscar el
 * álbum DENTRO de su lista real es más confiable que una búsqueda de texto
 * libre, porque no depende de cómo Deezer rankee el título como resultado
 * de búsqueda. Devuelve el id del álbum si matchea (exacto primero, si no
 * el primero que lo contenga como substring), o null.
 */
async function buscarAlbumIdViaArtista(artista, tituloBuscado) {
  const qArtista = encodeURIComponent(artista);
  const jArtista = await fetchDeezerJson(`https://api.deezer.com/search/artist?q=${qArtista}&limit=10`);
  const nombreNorm = artista.toLowerCase();
  const candidatos = (jArtista.data ?? []).filter((a) => a.name.toLowerCase() === nombreNorm);
  const mejorArtista = (candidatos.length > 0 ? candidatos : jArtista.data ?? []).sort(
    (a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0)
  )[0];
  if (!mejorArtista) return null;

  const jAlbumes = await fetchDeezerJson(`https://api.deezer.com/artist/${mejorArtista.id}/albums?limit=50`);
  const albumes = jAlbumes.data ?? [];
  const tituloNorm = tituloBuscado.toLowerCase();
  const exacto = albumes.find((a) => a.title.toLowerCase() === tituloNorm);
  if (exacto) return exacto.id;
  const contiene = albumes.find(
    (a) => a.title.toLowerCase().includes(tituloNorm) || tituloNorm.includes(a.title.toLowerCase())
  );
  return contiene?.id ?? null;
}

/**
 * Deezer no manda cantidad de tracks en /artist/{id}/albums (solo en el
 * detalle de CADA álbum) — para el lateral "Más álbumes de X" hace falta
 * un pedido extra por álbum. Se hace una sola vez (el resultado queda en
 * artistas-deezer.json para siempre, mismo criterio que el resto de esta
 * cache), en paralelo, y si un álbum puntual falla no tumba a los demás
 * (queda con nbTracks: null en vez de romper toda la lista).
 */
async function agregarNbTracks(albumesCrudos, albumesFiltrados) {
  const idPorTitulo = new Map(albumesCrudos.map((a) => [a.title.toLowerCase(), a.id]));
  await Promise.all(
    albumesFiltrados.map(async (alb) => {
      const id = idPorTitulo.get(alb.titulo.toLowerCase());
      if (!id) {
        alb.nbTracks = null;
        return;
      }
      try {
        const detalle = await fetchDeezerJson(`https://api.deezer.com/album/${id}`);
        alb.nbTracks = detalle.nb_tracks ?? null;
      } catch {
        alb.nbTracks = null;
      }
    })
  );
}

/**
 * InnerTube (la API interna que usan el propio sitio/apps de YouTube, sin
 * cuota diaria — es lo mismo que usan NewPipe/InnerTune) es el camino
 * PRINCIPAL de resolución desde acá: confirmado contra 40 tracks reales de
 * esta biblioteca, 40/40 encontrados y reproducibles (playability: OK),
 * ~535ms cada uno. La YouTube Data API oficial (con cuota de ~100
 * búsquedas/día) queda como respaldo si InnerTube llegara a fallar — no se
 * borra, por si YouTube cambia algo del lado no oficial.
 *
 * Una sola sesión para todo el server (crearla es lo lento — ~1s de
 * handshake — buscar con una ya creada es rápido), creada al vuelo en el
 * primer pedido y reutilizada después.
 */
let innertubePromise = null;
function obtenerInnertube() {
  if (!innertubePromise) innertubePromise = Innertube.create({ generate_session_locally: true });
  return innertubePromise;
}

// Cuántos candidatos se piden por búsqueda. Hace falta más de uno porque el
// primer resultado puede tener el embebido prohibido por el dueño del canal
// (error 150 de la IFrame API) — cosa habitual en videoclips oficiales, que es
// justo lo que más devuelve una búsqueda por "artista + título". Con un solo
// candidato, ese track no suena NUNCA y encima el id malo queda cacheado.
// Cinco alcanza: pasado ese punto los resultados ya no son la misma canción.
const MAX_CANDIDATOS = 5;

/**
 * Devuelve varios videoIds candidatos, del más relevante al menos.
 *
 * POR QUÉ NO SE FILTRA ACÁ POR "SE PUEDE EMBEBER": la restricción de embebido
 * puede depender de la región desde la que se pide, y quien tiene que poder
 * reproducirlo es el dispositivo del usuario, no este servidor. Filtrar en el
 * servidor daría un falso negativo (descartar algo que en el móvil sí anda) y
 * un falso positivo (aprobar algo que allá no). Por eso se mandan todos y el
 * cliente descarta el que le falle de verdad — ver /descartar-video.
 */
async function buscarCandidatosConInnertube(q) {
  const yt = await obtenerInnertube();
  const r = await yt.search(q, { type: 'video' });
  return (r.videos ?? []).map((v) => v.id).filter(Boolean).slice(0, MAX_CANDIDATOS);
}

async function buscarConInnertube(q) {
  const candidatos = await buscarCandidatosConInnertube(q);
  return candidatos[0] ?? null;
}

/**
 * Ids que el CLIENTE reportó como no reproducibles, por track.
 *
 * Vive en un archivo aparte y no dentro de cache-youtube.json a propósito: ese
 * caché se importa tal cual como semilla en el build local
 * (src/data/reproduccion-local.js) y su forma es trackId -> videoId. Meterle
 * listas de descartes cambiaría esa forma y rompería la semilla.
 */
function leerDescartados() {
  const p = join(dataDir, 'videos-descartados.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    // Archivo corrupto: es un índice reconstruible (el cliente vuelve a
    // reportar lo que falle), así que arrancar de cero es preferible a tumbar
    // la resolución entera.
    return {};
  }
}

// Object.hasOwn y no acceso directo, por el mismo motivo que en /resolver:
// un trackId "__proto__" devolvería un objeto heredado en vez de una lista.
function descartadosDe(mapa, trackId) {
  const v = Object.hasOwn(mapa, trackId) ? mapa[trackId] : null;
  return Array.isArray(v) ? v : [];
}

/**
 * Igual que buscarConInnertube, pero con la Data API oficial como red de
 * contención si InnerTube falla (mismo motivo que en /resolver: es una API
 * no oficial que puede romperse sin aviso). Nunca lanza — sin resultado en
 * ninguna de las dos, devuelve null para que el llamador lo trate como "no
 * encontrado" en vez de abortar todo un lote.
 */
async function buscarVideoIdConFallback(q, apiKey) {
  try {
    return await buscarConInnertube(q);
  } catch (eInnertube) {
    if (!apiKey) return null;
    try {
      const api = new URL('https://www.googleapis.com/youtube/v3/search');
      api.searchParams.set('part', 'snippet');
      api.searchParams.set('q', q);
      api.searchParams.set('type', 'video');
      api.searchParams.set('videoEmbeddable', 'true');
      api.searchParams.set('maxResults', '1');
      api.searchParams.set('key', apiKey);
      const r = await fetch(api);
      if (!r.ok) return null;
      const json = await r.json();
      return json.items?.[0]?.id?.videoId ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * Cascada de clasificación completa para un track NUEVO (artista+título+video
 * ya conocido) — la misma que usa POST /api/agregar-track, factorizada acá
 * para que POST /api/agregar-album la reuse sin duplicar las 3 pasadas
 * (anclas -> artista-unánime -> descripción de YouTube).
 */
async function clasificarTrackNuevo(artista, titulo, videoId, ejesActuales, bibTracks) {
  let ejesTrack = clasificar({ artista, titulo }, ejesActuales);
  if (ejesTrack.some((a) => a.ejeId === 'sin-clasificar')) {
    const idsModosReales = new Set(
      ejesActuales.filter((e) => (e.tipo === 'gusto' || e.tipo === 'funcional') && !e.sistema).map((e) => e.id)
    );
    const indice = indiceSugerenciasPorArtista(bibTracks, idsModosReales);
    const ejeUnanime = sugerenciaUnanime(artista, indice);
    if (ejeUnanime) {
      ejesTrack = [{ ejeId: ejeUnanime, origen: 'auto', senal: 'artista-unanime', score: 0.9 }];
    }
  }
  if (ejesTrack.some((a) => a.ejeId === 'sin-clasificar') && videoId) {
    try {
      const yt = await obtenerInnertube();
      const info = await yt.getBasicInfo(videoId);
      const texto = `${info.basic_info.title ?? ''} ${info.basic_info.short_description ?? ''}`.toLowerCase();
      const ejeId = clasificarPorDescripcionYoutube(texto);
      if (ejeId) ejesTrack = [{ ejeId, origen: 'auto', senal: 'descripcion-youtube', score: 0.8 }];
    } catch {
      // Sin descripción no hay señal extra — sigue sin-clasificar.
    }
  }
  return { ejesTrack };
}

/**
 * Búsquedas en vuelo, por trackId.
 *
 * StrictMode monta cada efecto dos veces en desarrollo: la segunda respuesta se descarta
 * en el cliente, pero la petición ya salió. Las dos llegan acá antes de que ninguna haya
 * escrito el caché, las dos fallan el lookup y las dos gastan una búsqueda de 100
 * unidades. Sin esta cola compartida la cuota real es la mitad de la nominal: 50 tracks
 * nuevos por día en vez de 100.
 */
const enVuelo = new Map();

/**
 * Coordinación de "una sola sesión reproduciendo a la vez", vía Server-Sent
 * Events. Vive ACÁ (el servidor local) y no en localStorage/BroadcastChannel
 * a propósito: esos dos son por-navegador, y el pedido era "no debe sonar en
 * dos navegadores distintos a la vez en el mismo dispositivo" — Chrome y
 * Edge abiertos al mismo tiempo no comparten localStorage ni BroadcastChannel,
 * pero SÍ pegan los dos contra este mismo `localhost:5173`.
 *
 * Protocolo: cada pestaña genera un sesionId propio al cargar y se suscribe a
 * GET /api/canal-reproduccion (SSE, conexión abierta). Cada vez que esa
 * pestaña arranca a sonar, hace POST /api/reproduciendo con su sesionId; acá
 * se reenvía un evento "pausate" a TODAS las conexiones abiertas. Cada
 * pestaña que reciba un "pausate" con un sesionId que no es el suyo se
 * pausa. Gana quien avisó último — no hace falta que el servidor sepa quién
 * "es dueño": alcanza con que cualquier arranque nuevo eche a los demás.
 */
const clientesSSE = new Set();

function difundirSSE(evento, datos) {
  const linea = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const res of clientesSSE) {
    try {
      res.write(linea);
    } catch {
      clientesSSE.delete(res);
    }
  }
}

/**
 * Igual que clientesSSE/difundirSSE de arriba, pero para el progreso del
 * enriquecimiento automático (Tarea 6/7) — canal propio a propósito, no se
 * mezcla con la coordinación de reproducción. Se guarda el último estado
 * conocido (`ultimoEstadoEnriquecimiento`) para que un cliente que se
 * conecta a mitad de un ciclo reciba el estado actual apenas se conecta, en
 * vez de arrancar en blanco hasta el próximo cambio.
 */
const clientesEnriquecimientoSSE = new Set();
let ultimoEstadoEnriquecimiento = { activo: false, etapa: null, procesados: 0, total: 0 };

function difundirEnriquecimiento(estado) {
  ultimoEstadoEnriquecimiento = estado;
  const linea = `event: estado\ndata: ${JSON.stringify(estado)}\n\n`;
  for (const res of clientesEnriquecimientoSSE) {
    try {
      res.write(linea);
    } catch {
      clientesEnriquecimientoSSE.delete(res);
    }
  }
}

/**
 * ¿El Origin de un pedido que modifica datos es de confianza?
 *
 * localhost siempre. Además, cualquier IP privada (LAN de casa: 192.168.x.x,
 * 10.x.x.x, o 172.16.x.x a 172.31.x.x) o de Tailscale (CGNAT, el bloque
 * 100.64.x.x a 100.127.x.x) en el MISMO puerto que el servidor. El motivo de
 * aceptar rangos enteros en vez de una sola IP fija: la IP del celular en
 * la LAN o en Tailscale puede cambiar de una conexión a otra (DHCP,
 * reconexión a la VPN), así que no alcanza con hardcodear una. Una IP
 * pública real de internet nunca cae en ninguno de estos rangos — sigue
 * bloqueada.
 */
function origenPermitido(origin, puerto) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' || url.port !== String(puerto)) return false;
  if (url.hostname === 'localhost') return true;

  const partes = url.hostname.split('.').map(Number);
  if (partes.length !== 4 || partes.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = partes;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (Tailscale)
  return false;
}

/**
 * Rutas de API para el servidor de desarrollo.
 *
 * Existen por dos razones:
 *  - La API key de YouTube se queda en el servidor, fuera del bundle del navegador.
 *  - Las asignaciones manuales y los videoId resueltos se persisten a disco.
 */
function apiLocal(env) {
  return {
    name: 'api-local',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        res.setHeader('Content-Type', 'application/json');
        // Sin esto, el navegador puede cachear un GET de la API con headers
        // heurísticos (sin Cache-Control explícito) y servir una respuesta
        // vieja incluso en una recarga "limpia" — bug real reproducido en vivo
        // con /api/artistas-fotos: el archivo en disco ya estaba corregido,
        // pero el navegador seguía devolviendo el JSON viejo cacheado.
        res.setHeader('Cache-Control', 'no-store');

        // Protección CSRF: estas rutas modifican biblioteca.json/ejes.json/etc.
        // sin ningún otro control de acceso (app de un solo usuario, sin login).
        // Sin esto, cualquier página que abras en el navegador mientras el
        // servidor está corriendo podría mandar un POST silencioso acá (un
        // <form> con Content-Type: text/plain no dispara preflight de CORS,
        // así que el navegador lo deja salir igual) y borrar o modificar la
        // biblioteca sin que te enteres. El propio frontend siempre manda
        // fetch('/api/...') mismo-origen, así que Origin siempre va a matchear.
        //
        // Acepta, además de localhost, cualquier origin cuyo host sea una IP
        // privada (LAN, 192.168.*/10.*/172.16-31.*) o de Tailscale (rango
        // CGNAT 100.64.0.0/10, 100.64-127.*) — necesario para usar la app
        // desde el celular por WiFi de casa o por Tailscale, sin abrir la
        // puerta a internet pública: una IP de verdad ruteable en internet
        // nunca matchea ninguno de estos rangos.
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const origin = req.headers.origin;
          if (origin && !origenPermitido(origin, server.config.server.port || 5173)) {
            res.statusCode = 403;
            return res.end(JSON.stringify({ error: 'origen_no_permitido' }));
          }
        }

        try {
          // GET /api/sonoridad?videoId=X -> {loudnessDb}: sonoridad de la pista respecto a la
          // referencia de YouTube (≈ −14 LUFS), para «Nivelar volumen» (el iframe no la expone).
          // Sale de la respuesta del reproductor de InnerTube y se cachea en disco; sin dato, null
          // (y no se cachea, para reintentar).
          if (url.pathname === '/sonoridad' && req.method === 'GET') {
            const videoId = url.searchParams.get('videoId') ?? '';
            if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'videoId_invalido' }));
            }
            const cachePath = join(dataDir, 'sonoridad-youtube.json');
            const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
            if (typeof cache[videoId] === 'number') return res.end(JSON.stringify({ loudnessDb: cache[videoId] }));
            try {
              const yt = await obtenerInnertube();
              const info = await yt.getBasicInfo(videoId);
              const ac = info.page?.[0]?.player_config?.audio_config;
              const loudnessDb = loudnessRelativo({
                loudnessDb: ac?.loudness_db,
                perceptualLoudnessDb: ac?.perceptual_loudness_db,
              });
              if (loudnessDb !== null) {
                const actual = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
                actual[videoId] = loudnessDb;
                escribirAtomico(cachePath, actual);
              }
              return res.end(JSON.stringify({ loudnessDb }));
            } catch {
              return res.end(JSON.stringify({ loudnessDb: null }));
            }
          }

          // GET /api/resolver?q=...&trackId=...  -> busca el video en YouTube y cachea
          if (url.pathname === '/resolver') {
            const q = url.searchParams.get('q');
            const trackId = url.searchParams.get('trackId');
            const apiKey = env.YOUTUBE_API_KEY;

            const cachePath = join(dataDir, 'cache-youtube.json');
            const cache = existsSync(cachePath)
              ? JSON.parse(readFileSync(cachePath, 'utf8'))
              : {};

            if (typeof trackId !== 'string' || !trackId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'trackId_requerido' }));
            }
            // Object.hasOwn y no `cache[trackId]`: con trackId="__proto__" o
            // "constructor" el acceso directo devuelve un objeto heredado, que la
            // guarda toma como cacheado y se devuelve en lugar de un videoId.
            const descartados = descartadosDe(leerDescartados(), trackId);
            // Un id cacheado que ya falló en el dispositivo no sirve: si se
            // devolviera igual, el track quedaría roto PARA SIEMPRE (el caché
            // es permanente y nunca se revisaba). Ese era el fallo: el primer
            // error 150 envenenaba el track de por vida.
            if (Object.hasOwn(cache, trackId) && !descartados.includes(cache[trackId])) {
              return res.end(JSON.stringify({ videoId: cache[trackId], cacheado: true }));
            }

            // Si ya hay una búsqueda igual en curso, se comparte en vez de duplicarla.
            let tarea = enVuelo.get(trackId);
            if (!tarea) {
              tarea = (async () => {
                let candidatos = [];
                let viaApiOficial = false;
                try {
                  candidatos = await buscarCandidatosConInnertube(q);
                } catch (eInnertube) {
                  // InnerTube es no oficial: si YouTube cambia algo del lado
                  // interno puede romperse sin aviso. La Data API oficial (si
                  // hay clave) es la red de contención — sin esto, un cambio
                  // ahí tumbaría toda la resolución en vez de solo perder la
                  // ventaja de no gastar cuota.
                  if (!apiKey) {
                    // Sin clave no hay red de contención: no tiene sentido devolver
                    // el error crudo de InnerTube (confunde una falla de config con
                    // una falla técnica real). El cliente ya sabe mostrar este caso
                    // aparte (ver estadoResolucion 'sin_api_key' en App.jsx).
                    const e = new Error('sin_api_key');
                    e.code = 'sin_api_key';
                    throw e;
                  }
                  viaApiOficial = true;
                  const api = new URL('https://www.googleapis.com/youtube/v3/search');
                  api.searchParams.set('part', 'snippet');
                  api.searchParams.set('q', q);
                  api.searchParams.set('type', 'video');
                  api.searchParams.set('videoEmbeddable', 'true');
                  api.searchParams.set('maxResults', String(MAX_CANDIDATOS));
                  api.searchParams.set('key', apiKey);
                  const r = await fetch(api);
                  if (!r.ok) {
                    // 403 de la Data API oficial es casi siempre cuota diaria
                    // agotada (~100 búsquedas/día) — mensaje legible en vez del
                    // JSON crudo de error de Google.
                    const detalle = r.status === 403 ? 'cuota excedida' : await r.text();
                    const e = new Error('youtube_error');
                    e.status = r.status;
                    e.detalle = detalle;
                    throw e;
                  }
                  const json = await r.json();
                  candidatos = (json.items ?? [])
                    .map((it) => it.id?.videoId)
                    .filter(Boolean)
                    .slice(0, MAX_CANDIDATOS);
                }
                // Se releen los descartes acá y no se reusa la lista de arriba:
                // entre que empezó esta búsqueda y ahora, el cliente pudo haber
                // reportado uno más (varias pestañas, o el propio reintento).
                const vetados = descartadosDe(leerDescartados(), trackId);
                candidatos = candidatos.filter((id) => !vetados.includes(id));
                const videoId = candidatos[0] ?? null;
                if (videoId) {
                  // Relee el caché justo antes de escribir: otra resolución pudo haber
                  // agregado entradas mientras esta búsqueda estaba en vuelo, y escribir
                  // el objeto leído al principio las borraría.
                  const actual = existsSync(cachePath)
                    ? JSON.parse(readFileSync(cachePath, 'utf8'))
                    : {};
                  actual[trackId] = videoId;
                  writeFileSync(cachePath, JSON.stringify(actual, null, 2), 'utf8');
                }
                return { videoId, candidatos, viaApiOficial };
              })().finally(() => enVuelo.delete(trackId));
              enVuelo.set(trackId, tarea);
            }

            try {
              const { videoId, candidatos } = await tarea;
              // `candidatos` viaja al cliente para que, si el elegido le falla
              // (error 150), pueda probar el siguiente SIN otra búsqueda — que
              // en modo local cuesta 100 unidades de cuota cada una.
              return res.end(JSON.stringify({ videoId, candidatos, cacheado: false }));
            } catch (e) {
              if (e.code === 'sin_api_key') {
                res.statusCode = 503;
                return res.end(JSON.stringify({ error: 'sin_api_key' }));
              }
              res.statusCode = e.status ?? 500;
              return res.end(
                JSON.stringify({ error: 'youtube_error', detalle: e.detalle ?? String(e) })
              );
            }
          }

          // POST /api/descartar-video  {trackId, videoId}
          // El cliente avisa que ese video no se pudo reproducir de verdad en
          // SU dispositivo (embebido prohibido, video borrado, id inválido).
          // Se anota para no volver a elegirlo y se saca del caché, que si no
          // lo devolvería igual en la próxima resolución.
          if (url.pathname === '/descartar-video' && req.method === 'POST') {
            const { trackId, videoId } = await leerCuerpo(req);
            if (typeof trackId !== 'string' || !trackId || typeof videoId !== 'string' || !videoId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'trackId_y_videoId_requeridos' }));
            }

            const descartados = leerDescartados();
            const previos = descartadosDe(descartados, trackId);
            if (!previos.includes(videoId)) {
              // Object.defineProperty y no asignación directa: con
              // trackId="__proto__" una asignación normal contaminaría el
              // prototipo en vez de crear la entrada.
              Object.defineProperty(descartados, trackId, {
                value: [...previos, videoId],
                writable: true, enumerable: true, configurable: true,
              });
              writeFileSync(
                join(dataDir, 'videos-descartados.json'),
                JSON.stringify(descartados, null, 2),
                'utf8'
              );
            }

            const cachePath = join(dataDir, 'cache-youtube.json');
            if (existsSync(cachePath)) {
              const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
              if (Object.hasOwn(cache, trackId) && cache[trackId] === videoId) {
                delete cache[trackId];
                writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
              }
            }
            return res.end(JSON.stringify({ ok: true }));
          }

          // GET /api/buscar-externo?q=... -> busca en YouTube algo que NO está en la
          // biblioteca (Fase 9). Devuelve varios candidatos, no uno solo: acá el
          // usuario elige, a diferencia de /resolver que ya sabe qué track busca.
          // GET /api/radio?videoId=...&artista=... -> "radio desde esta canción":
          // mix automático de YouTube Music con las reglas de src/data/lib/radio.js.
          if (url.pathname === '/radio') {
            const videoId = url.searchParams.get('videoId')?.trim();
            if (!videoId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'falta_videoId' }));
            }
            try {
              const yt = await obtenerInnertube();
              const panel = await yt.music.getUpNext(videoId, true);
              const pistas = (panel.contents ?? [])
                .filter((n) => n.video_id)
                .map(pistaDeNodo);
              return res.end(JSON.stringify({ pistas: armarRadio(pistas, { videoId, artista: url.searchParams.get('artista') }) }));
            } catch (e) {
              res.statusCode = 502;
              return res.end(JSON.stringify({ error: 'youtube_error', detalle: String(e?.message ?? e) }));
            }
          }

          if (url.pathname === '/buscar-externo') {
            const q = url.searchParams.get('q')?.trim();
            if (!q || q.length < 2) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'query_muy_corta' }));
            }
            try {
              const yt = await obtenerInnertube();
              const r = await yt.search(q, { type: 'video' });
              const resultados = (r.videos ?? []).slice(0, 12).map((v) => {
                const tituloCrudo = (v.title?.text ?? String(v.title ?? '')).trim();
                const canal = (v.author?.name ?? '').trim();
                // Canal "Fulano - Topic" = subida oficial de audio de YouTube Music:
                // el canal ES el artista real, no un uploader cualquiera.
                const canalLimpio = canal.replace(/\s*-\s*Topic$/i, '').trim();
                // Muchas subidas oficiales ya traen el título como "Artista - Canción"
                // (el mismo patrón que separa importar.mjs) — si está, es más confiable
                // que el nombre del canal.
                const partes = tituloCrudo.split(/ - (.+)/s);
                const [artistaSugerido, tituloSugerido] =
                  partes.length > 1 ? [partes[0].trim(), partes[1].trim()] : [canalLimpio, tituloCrudo];
                return {
                  videoId: v.id,
                  tituloSugerido: tituloSugerido || tituloCrudo,
                  artistaSugerido: artistaSugerido || canalLimpio || 'Desconocido',
                  duracionTexto: v.duration?.text ?? null,
                  canal,
                  thumbnail: v.best_thumbnail?.url ?? v.thumbnails?.[0]?.url ?? null,
                };
              });
              return res.end(JSON.stringify({ resultados }));
            } catch (e) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: 'busqueda_externa_fallo', mensaje: e.message }));
            }
          }

          // POST /api/agregar-track -> suma un track elegido en la búsqueda externa a
          // la biblioteca: clasificado con el mismo criterio que la importación masiva
          // (clasificar(), importado de scripts/lib/clasificar.mjs) y con el video YA
          // cacheado — vino de una búsqueda real, no hace falta resolverlo de nuevo.
          if (url.pathname === '/agregar-track' && req.method === 'POST') {
            const { titulo, artista, videoId } = await leerCuerpo(req);
            if (typeof titulo !== 'string' || !titulo.trim() || typeof artista !== 'string' || !artista.trim()) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'titulo_y_artista_requeridos' }));
            }
            if (typeof videoId !== 'string' || !videoId.trim()) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'videoId_requerido' }));
            }

            const tituloLimpio = limpiarTitulo(titulo.trim());
            const artistaLimpio = artista.trim();
            const id = idTrack(artistaLimpio, tituloLimpio);

            const bibPath = join(dataDir, 'biblioteca.json');
            const bib = JSON.parse(readFileSync(bibPath, 'utf8'));
            const existente = bib.tracks.find((t) => t.id === id);
            if (existente) {
              // Mismo artista+título normalizados que algo que ya está — no duplicar
              // (el mismo criterio que usa fusionarDuplicadosCruzados en el importador).
              return res.end(JSON.stringify({ ok: true, yaExistia: true, track: existente }));
            }

            const ejesActuales = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8')).ejes;
            let ejesTrack = clasificar({ artista: artistaLimpio, titulo: tituloLimpio }, ejesActuales);
            // Mismo criterio automático que importar.mjs: si el artista tiene
            // TODAS sus demás apariciones en un único modo, no hace falta que
            // el usuario lo clasifique a mano — se infiere solo.
            if (ejesTrack.some((a) => a.ejeId === 'sin-clasificar')) {
              const idsModosReales = new Set(
                ejesActuales
                  .filter((e) => (e.tipo === 'gusto' || e.tipo === 'funcional') && !e.sistema)
                  .map((e) => e.id)
              );
              const indice = indiceSugerenciasPorArtista(bib.tracks, idsModosReales);
              const ejeUnanime = sugerenciaUnanime(artistaLimpio, indice);
              if (ejeUnanime) {
                ejesTrack = [{ ejeId: ejeUnanime, origen: 'auto', senal: 'artista-unanime', score: 0.9 }];
              }
            }
            // Tercera pasada, misma que la masiva de importar.mjs: si sigue sin
            // modo, mirar la descripción del video (ya se conoce el videoId,
            // vino de la búsqueda) por si el canal-sello dice el género en
            // texto (ver el vocabulario chico y por qué en clasificar.mjs).
            if (ejesTrack.some((a) => a.ejeId === 'sin-clasificar')) {
              try {
                const yt = await obtenerInnertube();
                const info = await yt.getBasicInfo(videoId.trim());
                const texto = `${info.basic_info.title ?? ''} ${info.basic_info.short_description ?? ''}`.toLowerCase();
                const ejeId = clasificarPorDescripcionYoutube(texto);
                if (ejeId) {
                  ejesTrack = [{ ejeId, origen: 'auto', senal: 'descripcion-youtube', score: 0.8 }];
                }
              } catch {
                // Sin descripción no hay señal extra — el track queda
                // sin-clasificar como antes, no es un error que deba fallar el alta.
              }
            }
            const nuevo = {
              id,
              artista: artistaLimpio,
              titulo: tituloLimpio,
              fuentes: ['manual'],
              youtubeQuery: `${artistaLimpio} ${tituloLimpio}`,
              youtubeVideoId: null,
              ejes: ejesTrack,
            };
            bib.tracks.push(nuevo);
            bib.totalTracks = bib.tracks.length;
            escribirAtomico(bibPath, bib);

            // El video ya se conoce (se eligió en la búsqueda) — cachearlo de una
            // evita gastar una resolución redundante la primera vez que suene.
            const cachePath = join(dataDir, 'cache-youtube.json');
            const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
            cache[id] = videoId.trim();
            escribirAtomico(cachePath, cache);

            // Portada/álbum en el momento del alta — ver enriquecerTrackDeezerUno
            // más arriba. Mismo archivo/esquema que usa el script por lotes
            // (metadata-deezer.json, clave por id de track) para que no se
            // pise ni se vuelva a pedir de más si el script corre después.
            const dzMetaPath = join(dataDir, 'metadata-deezer.json');
            const dzMeta = existsSync(dzMetaPath)
              ? JSON.parse(readFileSync(dzMetaPath, 'utf8'))
              : { version: 1, tracks: {} };
            const datosDeezer = await enriquecerTrackDeezerUno(artistaLimpio, tituloLimpio);
            dzMeta.tracks[id] = datosDeezer ?? { coverUrl: null, fotoArtista: null };
            escribirAtomico(dzMetaPath, dzMeta);

            return res.end(JSON.stringify({ ok: true, yaExistia: false, track: nuevo }));
          }

          // GET /api/album?artista=X&titulo=Y -> tracklist COMPLETO del álbum al que
          // pertenece ese track, vía la API pública de Deezer (sin clave — la misma
          // que ya usa scripts/enriquecer-deezer.mjs para carátula/foto de artista,
          // medida en vivo con ~96% de acierto). Trae temas que el usuario nunca
          // agregó a su biblioteca, no solo los que ya tiene — para eso sirve esto:
          // "quiero escuchar/agregar el álbum entero, no solo lo que ya guardé".
          //
          // Cachea por id de álbum de Deezer en disco (un álbum se busca una vez).
          if (url.pathname === '/album' && req.method === 'GET') {
            const artista = url.searchParams.get('artista')?.trim();
            const titulo = url.searchParams.get('titulo')?.trim();
            const albumConocido = url.searchParams.get('albumConocido')?.trim();
            if (!artista || !titulo) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'artista_y_titulo_requeridos' }));
            }

            const cachePath = join(dataDir, 'albumes-deezer.json');
            const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { porTrack: {}, albumes: {} };
            const claveTrack = `${artista.toLowerCase()}|||${titulo.toLowerCase()}`;

            try {
              let albumId = cache.porTrack[claveTrack];
              if (!albumId && albumConocido) {
                // Buscar el ÁLBUM directo por nombre (medido en vivo: exacto para
                // "Dua Lipa Radical Optimism") es mucho más confiable que buscar
                // por track — Deezer cataloga la misma canción bajo el single, el
                // remix, la versión en vivo Y el álbum real como resultados
                // separados, y el de mayor "rank" en una búsqueda de track casi
                // siempre es el single, no el álbum que MusicBrainz/Spotify ya
                // nos dijeron que es el correcto.
                // limpiarTitulo() saca decoraciones como "[Explicit]" que vienen
                // del import (Spotify/MusicBrainz) pero Deezer no cataloga como
                // parte del título real — sin esto, "18 Months [Explicit]" nunca
                // matcheaba aunque "18 Months" (mismo álbum, sin la etiqueta) sí.
                const qAlbum = encodeURIComponent(`${artista} ${limpiarTitulo(albumConocido)}`);
                const jAlbum = await fetchDeezerJson(`https://api.deezer.com/search/album?q=${qAlbum}&limit=1`);
                albumId = jAlbum.data?.[0]?.id ?? null;
              }
              if (!albumId && albumConocido) {
                // La búsqueda de texto libre de Deezer falla seguido con
                // compilaciones/nombres genéricos aunque el álbum SÍ esté
                // catalogado — medido en vivo, entrando por la ficha del
                // artista (misma data que GET /artista) se encuentra bastante
                // más seguido que por /search/album.
                albumId = await buscarAlbumIdViaArtista(artista, limpiarTitulo(albumConocido));
              }
              if (!albumId) {
                // Sin álbum conocido (o ninguna de las dos búsquedas
                // anteriores encontró nada): mejor esfuerzo con la búsqueda
                // de track de siempre.
                const q = encodeURIComponent(`${artista} ${limpiarTitulo(titulo)}`);
                const j = await fetchDeezerJson(`https://api.deezer.com/search?q=${q}&limit=1`);
                albumId = j.data?.[0]?.album?.id ?? null;
              }
              if (albumId) cache.porTrack[claveTrack] = albumId;
              if (!albumId) {
                return res.end(JSON.stringify({ ok: true, encontrado: false }));
              }

              if (!cache.albumes[albumId]) {
                const detalle = await fetchDeezerJson(`https://api.deezer.com/album/${albumId}`);
                if (detalle.error) {
                  return res.end(JSON.stringify({ ok: true, encontrado: false }));
                }
                cache.albumes[albumId] = {
                  titulo: detalle.title,
                  artista: detalle.artist?.name ?? artista,
                  coverUrl: detalle.cover_big ?? detalle.cover_medium ?? null,
                  anio: detalle.release_date ? Number(detalle.release_date.slice(0, 4)) : null,
                  tracks: (detalle.tracks?.data ?? []).map((t, i) => ({
                    numero: t.track_position ?? i + 1,
                    titulo: t.title,
                    artista: t.artist?.name ?? detalle.artist?.name ?? artista,
                    duracionMs: (t.duration ?? 0) * 1000,
                  })),
                };
              }
              escribirAtomico(cachePath, cache);

              const bib = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
              const porId = new Map(bib.tracks.map((t) => [t.id, t]));
              const album = cache.albumes[albumId];
              const tracks = album.tracks.map((t) => {
                const tituloLimpio = limpiarTitulo(t.titulo);
                const id = idTrack(t.artista, tituloLimpio);
                const existente = porId.get(id);
                return { ...t, trackId: id, yaEnBiblioteca: !!existente, ejes: existente?.ejes ?? [] };
              });

              return res.end(JSON.stringify({ ok: true, encontrado: true, albumId, ...album, tracks }));
            } catch (e) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: 'album_fallo', mensaje: e.message }));
            }
          }

          // POST /api/agregar-album -> agrega TODOS los tracks de un álbum (el
          // tracklist que ya devolvió GET /api/album) que todavía no están en la
          // biblioteca, resolviendo cada uno contra YouTube y clasificándolo con la
          // misma cascada que /api/agregar-track. Si viene `ejeId`, además suma esa
          // pertenencia (modo o colección) a TODOS los tracks del álbum, nuevos y
          // ya existentes — "me gusta todo el álbum, agregalo a mi lista X".
          if (url.pathname === '/agregar-album' && req.method === 'POST') {
            const { tracks, ejeId, albumTitulo, anio } = await leerCuerpo(req);
            if (!Array.isArray(tracks) || tracks.length === 0) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'tracks_requeridos' }));
            }

            const bibPath = join(dataDir, 'biblioteca.json');
            const bib = JSON.parse(readFileSync(bibPath, 'utf8'));
            const ejesActuales = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8')).ejes;
            const porId = new Map(bib.tracks.map((t) => [t.id, t]));

            // GET /api/album ya trajo álbum/año/duración de Deezer para cada track
            // de este álbum — guardarlo acá (en vez de perderlo) es lo que permite
            // que ListaTracks/Reproductor muestren esos datos para los tracks que
            // se agregan por esta vía, no solo "—". Se guarda para TODOS los
            // tracks del álbum, existan ya o no: /api/metadata usa esto como
            // último fallback, así que nunca pisa un dato mejor de MusicBrainz o
            // Spotify que ya tuviera ese track.
            const dzMetaPath = join(dataDir, 'metadata-deezer.json');
            const dzMeta = existsSync(dzMetaPath) ? JSON.parse(readFileSync(dzMetaPath, 'utf8')) : { tracks: {} };

            let ejeDestino = null;
            if (typeof ejeId === 'string' && ejeId) {
              ejeDestino = ejesActuales.find((e) => e.id === ejeId);
              if (!ejeDestino) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: 'eje_inexistente', ejeId }));
              }
            }
            const esModo = ejeDestino && (ejeDestino.tipo === 'gusto' || ejeDestino.tipo === 'funcional');
            const esColeccion = ejeDestino && (ejeDestino.tipo === 'playlist' || ejeDestino.id === 'favoritos');

            const cachePath = join(dataDir, 'cache-youtube.json');
            const cacheYt = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

            let agregados = 0;
            let noEncontrados = 0;
            let conPertenencia = 0;

            for (const fila of tracks) {
              if (typeof fila?.artista !== 'string' || typeof fila?.titulo !== 'string') continue;
              const tituloLimpio = limpiarTitulo(fila.titulo);
              const id = idTrack(fila.artista, tituloLimpio);
              let track = porId.get(id);

              if (typeof fila.duracionMs === 'number' && fila.duracionMs > 0) {
                dzMeta.tracks[id] = {
                  ...dzMeta.tracks[id],
                  duracionMs: fila.duracionMs,
                  ...(typeof albumTitulo === 'string' && albumTitulo ? { album: albumTitulo } : {}),
                  ...(typeof anio === 'number' ? { anio } : {}),
                };
              }

              if (!track) {
                // Un track que no se puede resolver (o cualquier fallo inesperado
                // en su clasificación) no debe tumbar el resto del álbum — se
                // cuenta como no encontrado y se sigue con el siguiente.
                try {
                  const videoId = await buscarVideoIdConFallback(
                    `${fila.artista} ${tituloLimpio}`,
                    env.YOUTUBE_API_KEY
                  );
                  if (!videoId) {
                    noEncontrados++;
                    continue;
                  }
                  cacheYt[id] = videoId;
                  const { ejesTrack } = await clasificarTrackNuevo(
                    fila.artista,
                    tituloLimpio,
                    videoId,
                    ejesActuales,
                    bib.tracks
                  );
                  track = {
                    id,
                    artista: fila.artista,
                    titulo: tituloLimpio,
                    fuentes: ['album'],
                    youtubeQuery: `${fila.artista} ${tituloLimpio}`,
                    youtubeVideoId: null,
                    ejes: ejesTrack,
                  };
                  porId.set(id, track);
                  bib.tracks.push(track);
                  agregados++;
                } catch {
                  noEncontrados++;
                  continue;
                }
              }

              if (esModo) {
                track.ejes = track.ejes.filter((a) => a.ejeId !== 'sin-clasificar');
                if (!track.ejes.some((a) => a.ejeId === ejeId)) {
                  track.ejes.push({ ejeId, origen: 'manual', senal: 'usuario', score: 1 });
                  conPertenencia++;
                }
              } else if (esColeccion) {
                if (!track.ejes.some((a) => a.ejeId === ejeId)) {
                  track.ejes.push({ ejeId, origen: 'manual', senal: 'usuario', score: 1 });
                  conPertenencia++;
                }
              }
            }

            bib.totalTracks = bib.tracks.length;
            escribirAtomico(bibPath, bib);
            escribirAtomico(cachePath, cacheYt);
            escribirAtomico(dzMetaPath, dzMeta);

            return res.end(
              JSON.stringify({ ok: true, agregados, noEncontrados, conPertenencia, tracks: bib.tracks, ejes: ejesActuales })
            );
          }

          // POST /api/quitar-track -> saca un track de la biblioteca por
          // completo (no de un modo/lista puntual, como /api/coleccion) —
          // simétrico a agregar un track suelto desde álbum/artista: "－" al
          // lado del "＋", para poder deshacer un track que no querías.
          if (url.pathname === '/quitar-track' && req.method === 'POST') {
            const { trackId } = await leerCuerpo(req);
            if (typeof trackId !== 'string' || !trackId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'trackId_requerido' }));
            }
            const path = join(dataDir, 'biblioteca.json');
            const bib = JSON.parse(readFileSync(path, 'utf8'));
            const idx = bib.tracks.findIndex((t) => t.id === trackId);
            if (idx === -1) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'track_no_encontrado' }));
            }
            // Quitar un artista/álbum llega como una petición por canción: una
            // sola copia por ráfaga (10 min), máx. 10 copias.
            copiaSiNuevaRafaga(dataDir);
            bib.tracks.splice(idx, 1);
            bib.totalTracks = bib.tracks.length;
            escribirAtomico(path, bib);

            // Mismo criterio que /api/coleccion: si sacar este track deja
            // alguna lista en 0, se poda sola — nunca al crearla, solo al
            // perder su último track.
            const ejesPath = join(dataDir, 'ejes.json');
            const ejesActuales = JSON.parse(readFileSync(ejesPath, 'utf8'));
            const podado = podarEjesVacios(ejesActuales.ejes, bib.tracks);
            let ejesEliminados = [];
            if (podado.podados.length > 0) {
              escribirAtomico(ejesPath, { ejes: podado.ejes });
              ejesEliminados = podado.podados;
            }

            return res.end(JSON.stringify({ ok: true, tracks: bib.tracks, ejesEliminados }));
          }

          // GET /api/artista?nombre=X -> perfil de artista vía Deezer: foto,
          // álbumes (para navegar a cada uno con GET /api/album) y canciones
          // populares (mismo patrón que /api/album: cruza contra biblioteca.json
          // para marcar yaEnBiblioteca/trackId). Igual que en /album, cachea
          // por id de artista de Deezer en disco.
          if (url.pathname === '/artista' && req.method === 'GET') {
            const nombre = url.searchParams.get('nombre')?.trim();
            if (!nombre) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'nombre_requerido' }));
            }

            const cachePath = join(dataDir, 'artistas-deezer.json');
            const cache = existsSync(cachePath)
              ? JSON.parse(readFileSync(cachePath, 'utf8'))
              : { porNombre: {}, artistas: {} };
            const claveNombre = nombre.toLowerCase();

            try {
              let artistaId = cache.porNombre[claveNombre];
              if (!artistaId) {
                // El primer resultado de /search/artist NO es siempre el más
                // popular — medido en vivo: buscar "Madonna" devuelve 3
                // artistas homónimos antes que la Madonna real (4.9M fans vs
                // 180), así que se elige por nb_fan en vez de tomar data[0].
                // OJO: el desempate por nb_fan solo vale ENTRE homónimos reales
                // (mismo nombre exacto). Antes, si ningún resultado coincidía
                // con el nombre exacto (nombres caseros/de nicho que Deezer no
                // tiene — "Lowfie", "Chilled Pig"), caía a TODOS los resultados
                // de la búsqueda difusa ordenados por fans: un artista global
                // enorme sin ninguna relación real (ej. Blondie) le ganaba a
                // cualquier resultado difuso genuino solo por tener más fans.
                // Confirmado en vivo: "Lowfie" abría la ficha de Blondie.
                // Sin match exacto, mejor decir "no encontrado" (ver `!artistaId`
                // más abajo) que mostrar el artista equivocado con confianza.
                const q = encodeURIComponent(nombre);
                const j = await fetchDeezerJson(`https://api.deezer.com/search/artist?q=${q}&limit=10`);
                const candidatos = (j.data ?? []).filter(
                  (a) => a.name.toLowerCase() === claveNombre
                );
                const mejor = candidatos.sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0];
                artistaId = mejor?.id ?? null;
              }
              if (!artistaId) {
                return res.end(JSON.stringify({ ok: true, encontrado: false }));
              }

              if (!cache.artistas[artistaId]) {
                const [detalle, albumesJson, topJson, relacionadosJson] = await Promise.all([
                  fetchDeezerJson(`https://api.deezer.com/artist/${artistaId}`),
                  fetchDeezerJson(`https://api.deezer.com/artist/${artistaId}/albums?limit=50`),
                  // El límite real de Deezer para "top" ronda 50-100 tracks
                  // segun el artista; 30 se quedaba corto sin necesidad.
                  fetchDeezerJson(`https://api.deezer.com/artist/${artistaId}/top?limit=50`),
                  // Artistas similares (para el lateral "Parecidos") — mismo
                  // endpoint que usa el propio Deezer para "fans also like".
                  fetchDeezerJson(`https://api.deezer.com/artist/${artistaId}/related?limit=20`),
                ]);
                if (detalle.error) {
                  return res.end(JSON.stringify({ ok: true, encontrado: false }));
                }
                // Deezer repite el mismo álbum con ids distintos (ediciones,
                // reempaquetados) — se queda con la primera aparición de cada
                // título, ya ordenado por fecha por la API. record_type filtra
                // singles/remixes/compilaciones que Deezer lista como si
                // fueran álbumes propios (medido en vivo con Billie Eilish:
                // de ~32 entradas solo 4-5 son álbumes/EPs reales, el resto
                // son singles y remixes sueltos).
                const albumesVistos = new Set();
                const albumes = [];
                for (const a of albumesJson.data ?? []) {
                  if (a.record_type !== 'album' && a.record_type !== 'ep') continue;
                  const clave = a.title.toLowerCase();
                  if (albumesVistos.has(clave)) continue;
                  albumesVistos.add(clave);
                  albumes.push({
                    titulo: a.title,
                    coverUrl: a.cover_big ?? a.cover_medium ?? null,
                    anio: a.release_date ? Number(a.release_date.slice(0, 4)) : null,
                  });
                }
                await agregarNbTracks(albumesJson.data ?? [], albumes);
                const [fotoArtistaVerificada, similaresVerificados] = await Promise.all([
                  fotoDeezerValida(detalle.picture_xl ?? detalle.picture_big ?? null),
                  Promise.all(
                    (relacionadosJson.data ?? []).map(async (a) => ({
                      nombre: a.name,
                      fotoUrl: await fotoDeezerValida(a.picture_big ?? a.picture_medium ?? null),
                      nbFans: a.nb_fan ?? 0,
                    }))
                  ),
                ]);
                cache.artistas[artistaId] = {
                  nombre: detalle.name,
                  fotoUrl: fotoArtistaVerificada,
                  albumes,
                  canciones: (topJson.data ?? []).map((t) => ({
                    titulo: t.title,
                    artista: t.artist?.name ?? detalle.name,
                    duracionMs: (t.duration ?? 0) * 1000,
                    albumTitulo: t.album?.title ?? null,
                    coverUrl: t.album?.cover_big ?? t.album?.cover_medium ?? null,
                  })),
                  similares: similaresVerificados,
                };
                cache.porNombre[claveNombre] = artistaId;
              } else {
                // Entrada cacheada de antes de que existieran "similares" o
                // "nbTracks" por álbum (la mayoría de la biblioteca,
                // precargada en una corrida previa) — no hace falta repetir
                // detalle/top, solo completar lo que falte.
                const entrada = cache.artistas[artistaId];
                const faltaSimilares = !entrada.similares;
                const faltaNbTracks = entrada.albumes.some((a) => a.nbTracks == null);
                if (faltaSimilares || faltaNbTracks) {
                  const [relacionadosJson, albumesJson] = await Promise.all([
                    faltaSimilares
                      ? fetchDeezerJson(`https://api.deezer.com/artist/${artistaId}/related?limit=20`)
                      : null,
                    faltaNbTracks
                      ? fetchDeezerJson(`https://api.deezer.com/artist/${artistaId}/albums?limit=50`)
                      : null,
                  ]);
                  if (relacionadosJson) {
                    entrada.similares = await Promise.all(
                      (relacionadosJson.data ?? []).map(async (a) => ({
                        nombre: a.name,
                        fotoUrl: await fotoDeezerValida(a.picture_big ?? a.picture_medium ?? null),
                        nbFans: a.nb_fan ?? 0,
                      }))
                    );
                  }
                  if (albumesJson) {
                    await agregarNbTracks(albumesJson.data ?? [], entrada.albumes);
                  }
                }
              }
              escribirAtomico(cachePath, cache);

              const bib = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
              const porId = new Map(bib.tracks.map((t) => [t.id, t]));
              const artista = cache.artistas[artistaId];
              const canciones = artista.canciones.map((c) => {
                const tituloLimpio = limpiarTitulo(c.titulo);
                const id = idTrack(c.artista, tituloLimpio);
                const existente = porId.get(id);
                return { ...c, trackId: id, yaEnBiblioteca: !!existente, ejes: existente?.ejes ?? [] };
              });

              // "Canciones populares" ya trae álbum/año/duración de Deezer, pero
              // hasta ahora esa info se perdía si el track sonaba antes de
              // agregarse a la biblioteca (quedaba "sin resolver" en la ficha y
              // así seguía aunque después se agregara). Se persiste acá, mismo
              // patrón y misma prioridad que /api/agregar-album (nunca pisa un
              // dato mejor de MusicBrainz/Spotify) — solo lo que falte, para no
              // reescribir el archivo en cada visita a la página del artista.
              const dzMetaPath = join(dataDir, 'metadata-deezer.json');
              const dzMeta = existsSync(dzMetaPath)
                ? JSON.parse(readFileSync(dzMetaPath, 'utf8'))
                : { tracks: {} };
              const anioPorAlbum = new Map(
                artista.albumes.map((a) => [a.titulo.toLowerCase(), a.anio])
              );
              let dzMetaCambio = false;
              for (const c of canciones) {
                const existente = dzMeta.tracks[c.trackId];
                // Antes se saltaba entero si ya existía la entrada — pero una
                // versión vieja de este mismo código la creaba sin coverUrl,
                // así que quedaba "completa" para siempre sin portada. Ahora
                // solo se salta si YA tiene coverUrl.
                if (existente?.coverUrl) continue;
                dzMeta.tracks[c.trackId] = {
                  duracionMs: existente?.duracionMs ?? (c.duracionMs || null),
                  album: existente?.album ?? c.albumTitulo ?? null,
                  anio: existente?.anio ?? (c.albumTitulo ? anioPorAlbum.get(c.albumTitulo.toLowerCase()) ?? null : null),
                  coverUrl: c.coverUrl ?? null,
                };
                dzMetaCambio = true;
              }
              if (dzMetaCambio) escribirAtomico(dzMetaPath, dzMeta);

              return res.end(JSON.stringify({ ok: true, encontrado: true, artistaId, ...artista, canciones }));
            } catch (e) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: 'artista_fallo', mensaje: e.message }));
            }
          }

          // GET /api/artistas-fotos -> mapa nombre(minúscula) -> fotoUrl de
          // artistas-deezer.json + fotos-artistas.json, para las tarjetas con
          // avatar (Home, buscador). fotoDeArtista() en el cliente usaba solo
          // metadata-deezer.json (la foto que vino pegada a la búsqueda de un
          // TRACK puntual, no del artista), que a veces queda null/mal aunque
          // la página del artista (que sí busca por artista, con desempate
          // por nb_fan) tenga la correcta — este endpoint expone esa fuente
          // más confiable.
          if (url.pathname === '/artistas-fotos' && req.method === 'GET') {
            const cachePath = join(dataDir, 'artistas-deezer.json');
            const cache = existsSync(cachePath)
              ? JSON.parse(readFileSync(cachePath, 'utf8'))
              : { porNombre: {}, artistas: {} };
            // Ya viene verificada (fotoDeezerValida corre UNA vez al cachear el
            // artista, ver más abajo) — repetirla acá por cada artista en cada
            // carga de página sería cientos de pedidos HTTP al CDN de imágenes
            // por request, solo para confirmar algo que ya se confirmó antes.
            const fotos = {};
            // Precarga en background (enriquecer-fotos-artistas-core.mjs) —
            // se completa sola con el tiempo, sin necesidad de visitar la
            // página de cada artista. Va primero: si el mismo artista además
            // ya tiene perfil completo (visitado a mano), ese dato es más
            // reciente y lo pisa abajo.
            const cachePrecargaPath = join(dataDir, 'fotos-artistas.json');
            if (existsSync(cachePrecargaPath)) {
              const precarga = JSON.parse(readFileSync(cachePrecargaPath, 'utf8'));
              for (const [nombre, foto] of Object.entries(precarga.fotos ?? {})) {
                if (foto) fotos[nombre] = foto;
              }
            }
            for (const [nombre, id] of Object.entries(cache.porNombre)) {
              const foto = cache.artistas[id]?.fotoUrl;
              if (foto) fotos[nombre] = foto;
            }
            return res.end(JSON.stringify({ fotos }));
          }

          // POST /api/recomendaciones -> "Explorar" del submenú: artistas
          // parecidos a los tuyos que TODAVÍA no tenés. Recibe la lista de tus
          // artistas (el cliente ya sabe separar créditos múltiples — "Zedd ·
          // Troye Sivan" — vía separarArtistas, no vale la pena duplicar esa
          // lógica acá), junta los "similares" (related de Deezer) de los que
          // YA están cacheados en artistas-deezer.json (sin fetch en vivo: si
          // tu artista todavía no se visitó, no aporta recomendación esta vez,
          // se completa solo a medida que visitás más páginas de artista) y
          // devuelve los que no están en tu biblioteca, ordenados por fans.
          if (url.pathname === '/recomendaciones' && req.method === 'POST') {
            const { artistas: misArtistas } = await leerCuerpo(req);
            if (!Array.isArray(misArtistas)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'artistas_requerido' }));
            }
            const misArtistasSet = new Set(misArtistas.map((n) => String(n).toLowerCase()));
            const cachePath = join(dataDir, 'artistas-deezer.json');
            const cache = existsSync(cachePath)
              ? JSON.parse(readFileSync(cachePath, 'utf8'))
              : { porNombre: {}, artistas: {} };

            const porNombreRecomendado = new Map();
            for (const nombre of misArtistasSet) {
              const id = cache.porNombre[nombre];
              const similares = id ? cache.artistas[id]?.similares : null;
              if (!similares) continue;
              for (const s of similares) {
                const clave = s.nombre.toLowerCase();
                if (misArtistasSet.has(clave)) continue; // ya lo tenés
                const existente = porNombreRecomendado.get(clave);
                if (!existente || s.nbFans > existente.nbFans) porNombreRecomendado.set(clave, s);
              }
            }

            const artistasRecomendados = [...porNombreRecomendado.values()]
              .sort((a, b) => b.nbFans - a.nbFans)
              .slice(0, 24);
            return res.end(JSON.stringify({ artistas: artistasRecomendados }));
          }

          // GET /api/tendencias?genero=ID -> "Explorar": lo que suena/se
          // vende ahora en Deezer, global o por género. Medido antes de
          // construir: /editorial/{genero}/releases (nuevos lanzamientos)
          // devuelve 0 resultados siempre en la API pública sin auth de
          // partner — Deezer la deprecó para uso público, así que esa pieza
          // específica del pedido ("nuevos lanzamientos") no se puede armar
          // con datos reales y queda afuera. /chart/{genero} sí funciona
          // (probado con genero=0 y con genero=132) y da tracks/álbumes/
          // artistas reales — es la base de esta ruta.
          if (url.pathname === '/tendencias') {
            const genero = url.searchParams.get('genero') || '0';
            try {
              const r = await fetch(`https://api.deezer.com/chart/${encodeURIComponent(genero)}?limit=15`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const json = await r.json();
              const tracks = (json.tracks?.data ?? []).map((t) => ({
                id: t.id,
                titulo: t.title,
                artista: t.artist?.name ?? '',
                cover: t.album?.cover_medium ?? null,
              }));
              const albums = (json.albums?.data ?? []).map((a) => ({
                id: a.id,
                titulo: a.title,
                artista: a.artist?.name ?? '',
                cover: a.cover_medium ?? null,
              }));
              const artists = (json.artists?.data ?? []).map((a) => ({
                id: a.id,
                nombre: a.name,
                foto: a.picture_medium ?? null,
              }));
              return res.end(JSON.stringify({ tracks, albums, artists }));
            } catch (e) {
              res.statusCode = 502;
              return res.end(JSON.stringify({ error: 'deezer_no_disponible', mensaje: e.message }));
            }
          }

          // POST /api/ejes  -> guarda ejes.json editado desde la UI
          if (url.pathname === '/ejes' && req.method === 'POST') {
            const cuerpo = await leerCuerpo(req);
            const problema = validarEjes(cuerpo);
            if (problema) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'ejes_invalidos', mensaje: problema }));
            }
            escribirAtomico(join(dataDir, 'ejes.json'), cuerpo);
            return res.end(JSON.stringify({ ok: true }));
          }

          // POST /api/sugerencia-clasificacion -> ranking por embeddings SIN
          // umbral (Tarea 17, Hueco 2): a diferencia de clasificarPorEmbeddings
          // (que exige UMBRAL_SCORE/MARGEN_MINIMO para clasificar solo), acá se
          // quiere el mejor candidato SIEMPRE, aunque el score sea bajo, para
          // mostrarlo como sugerencia que la persona aprueba/cambia/descarta a
          // mano desde ClasificacionAsistida (src/App.jsx). Si no se manda
          // `trackIds`, se calcula para todos los tracks hoy en
          // 'sin-clasificar'. Reusa el vector ya persistido de cada track (el
          // índice poblado por descubrirModos -> asegurarVectores) — no
          // reembebe tracks acá.
          if (url.pathname === '/sugerencia-clasificacion' && req.method === 'POST') {
            const cuerpo = await leerCuerpo(req).catch(() => ({}));
            const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
            const ejesActuales = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8')).ejes;

            const trackIds =
              Array.isArray(cuerpo?.trackIds) && cuerpo.trackIds.length > 0
                ? cuerpo.trackIds
                : biblioteca.tracks
                    .filter((t) => t.ejes.some((a) => a.ejeId === 'sin-clasificar'))
                    .map((t) => t.id);

            const ejesValidos = ejesClasificables(ejesActuales);
            if (ejesValidos.length === 0 || trackIds.length === 0) {
              return res.end(JSON.stringify({ sugerencias: [] }));
            }
            const embEjes = await embeberEjes(ejesValidos);
            const indice = cargarIndice(dataDir);

            const sugerencias = trackIds.map((trackId) => {
              const vector = vectorDe(dataDir, trackId, indice);
              const candidato = vector ? mejorCandidato(vector, embEjes) : null;
              const nombre = candidato ? ejesActuales.find((e) => e.id === candidato.ejeId)?.nombre ?? null : null;
              return {
                trackId,
                ejeId: candidato?.ejeId ?? null,
                nombre,
                confianza: candidato?.confianza ?? 0,
              };
            });
            return res.end(JSON.stringify({ sugerencias }));
          }

          // POST /api/asignar -> guarda una asignacion manual (origen: manual)
          if (url.pathname === '/asignar' && req.method === 'POST') {
            const { trackId, ejeId } = await leerCuerpo(req);

            // Validar el eje ANTES de tocar el track. Si se quita sin-clasificar y
            // despues resulta que el ejeId no sirve, el track queda sin ningun eje:
            // desaparece de la bandeja de entrada y de todos los modos a la vez.
            if (typeof ejeId !== 'string' || !ejeId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'eje_requerido' }));
            }
            const ejesActuales = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8'));
            const ejeDestino = ejesActuales.ejes.find((e) => e.id === ejeId);
            if (!ejeDestino) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'eje_inexistente', ejeId }));
            }
            // /api/asignar es para MODO (gusto/funcional) — las playlists van por
            // /api/coleccion, que no toca sin-clasificar porque son independientes
            // (un track puede estar en una playlist Y seguir sin modo). Sin esto,
            // asignar por error una playlist como "modo" sacaba al track de
            // sin-clasificar sin darle un modo real.
            if (ejeDestino.tipo !== 'gusto' && ejeDestino.tipo !== 'funcional') {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'eje_no_es_modo', ejeId }));
            }

            const path = join(dataDir, 'biblioteca.json');
            const bib = JSON.parse(readFileSync(path, 'utf8'));
            const track = bib.tracks.find((t) => t.id === trackId);
            if (!track) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'track_no_encontrado' }));
            }
            track.ejes = track.ejes.filter((a) => a.ejeId !== 'sin-clasificar');
            if (!track.ejes.some((a) => a.ejeId === ejeId)) {
              track.ejes.push({ ejeId, origen: 'manual', senal: 'usuario', score: 1 });
            }
            // Cascada del aprendizaje incremental (Tarea 17, Hueco 3): esto ya
            // corría después de importar un CSV (aplicarFilasTuneMyMusic más
            // abajo) pero nunca desde una asignación manual en vivo — una
            // aprobación en ClasificacionAsistida (o cualquier otro lugar que
            // pegue acá) proponía el artista como ancla en el spec, pero el
            // resto de sus tracks se quedaba en sin-clasificar hasta el
            // próximo import. Muta bib.tracks in-place, por eso corre ANTES de
            // escribirAtomico.
            const propagadas = propagarSugerenciasUnanimes(bib.tracks, ejesActuales.ejes);
            escribirAtomico(path, bib);
            return res.end(JSON.stringify({ ok: true, ejes: track.ejes, propagadas }));
          }

          // POST /api/unir-modos { origenId, destinoId } -> pasa todas las canciones del
          // modo origen al destino (sin duplicados), borra el origen y actualiza historial
          // y últimos modos. Lo anota el móvil en su journal al unir dos modos. Antes
          // hace copia de seguridad (biblioteca, ejes, historial, últimos modos).
          if (url.pathname === '/unir-modos' && req.method === 'POST') {
            const { origenId, destinoId } = await leerCuerpo(req);
            if (typeof origenId !== 'string' || typeof destinoId !== 'string' || !origenId || !destinoId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'origenId_y_destinoId_requeridos' }));
            }
            const rutaBib = join(dataDir, 'biblioteca.json');
            const rutaEjes = join(dataDir, 'ejes.json');
            const rutaHist = join(dataDir, 'historial.json');
            const rutaUlt = join(dataDir, 'ultimos-modos.json');
            const bib = JSON.parse(readFileSync(rutaBib, 'utf8'));
            const ejesData = JSON.parse(readFileSync(rutaEjes, 'utf8'));
            const hist = existsSync(rutaHist) ? JSON.parse(readFileSync(rutaHist, 'utf8')) : null;
            const ult = existsSync(rutaUlt) ? JSON.parse(readFileSync(rutaUlt, 'utf8')) : null;
            const histArr = Array.isArray(hist) ? hist : [];
            const ultArr = Array.isArray(ult) ? ult : [];
            // El móvil puede reenviarlo tras haberse aplicado ya (el PC no lo borra del journal hasta recibir 200).
            if (!ejesData.ejes.some((e) => e.id === origenId)) {
              return res.end(JSON.stringify({ ok: true, yaAplicado: true }));
            }
            const r = unirModosEnDatos(ejesData, bib, origenId, destinoId, histArr, ultArr);
            if (!r.ok) {
              res.statusCode = r.error === 'modo_no_existe' ? 404 : 400;
              return res.end(JSON.stringify({ error: r.error }));
            }
            copiaSiNuevaRafaga(dataDir, {
              archivos: ['biblioteca.json', 'ejes.json', 'historial.json', 'ultimos-modos.json'],
              prefijo: 'backup-unir-modos',
              ventanaMs: 0,
            });
            escribirAtomico(rutaBib, bib);
            escribirAtomico(rutaEjes, ejesData);
            if (Array.isArray(hist)) escribirAtomico(rutaHist, histArr);
            if (Array.isArray(ult)) escribirAtomico(rutaUlt, ultArr);
            return res.end(JSON.stringify({ ok: true, movidas: r.movidas, yaEnDestino: r.yaEnDestino }));
          }

          // POST /api/quitar-modo -> saca UN modo puntual de un track (lo que
          // /api/asignar no puede hacer: solo agrega). Antes de esto no había forma
          // de corregir una clasificación manual mal hecha desde la UI normal —
          // solo se podía reasignar (sumaba otro modo más, nunca sacaba el viejo).
          // Si el track se queda sin ningún modo real, vuelve a 'sin-clasificar'
          // para no desaparecer silenciosamente de "Para clasificar".
          if (url.pathname === '/quitar-modo' && req.method === 'POST') {
            const { trackId, ejeId } = await leerCuerpo(req);
            if (typeof trackId !== 'string' || !trackId || typeof ejeId !== 'string' || !ejeId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'trackId_y_ejeId_requeridos' }));
            }
            const ejesActuales = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8'));
            const ejeDestino = ejesActuales.ejes.find((e) => e.id === ejeId);
            if (!ejeDestino || (ejeDestino.tipo !== 'gusto' && ejeDestino.tipo !== 'funcional')) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'eje_no_es_modo', ejeId }));
            }

            const path = join(dataDir, 'biblioteca.json');
            const bib = JSON.parse(readFileSync(path, 'utf8'));
            const track = bib.tracks.find((t) => t.id === trackId);
            if (!track) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'track_no_encontrado' }));
            }
            track.ejes = track.ejes.filter((a) => a.ejeId !== ejeId);
            const idsModos = new Set(
              ejesActuales.ejes
                .filter((e) => (e.tipo === 'gusto' || e.tipo === 'funcional') && !e.sistema)
                .map((e) => e.id)
            );
            const sinModoReal = !track.ejes.some((a) => idsModos.has(a.ejeId));
            if (sinModoReal && !track.ejes.some((a) => a.ejeId === 'sin-clasificar')) {
              track.ejes.push({ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 });
            }
            escribirAtomico(path, bib);
            return res.end(JSON.stringify({ ok: true, ejes: track.ejes }));
          }

          // POST /api/asignar-lote -> varias asignaciones de una sola vez ("aplicar
          // las N sugerencias sin ambigüedad" en Para clasificar). Una sola
          // lectura/escritura de biblioteca.json para todo el lote — 111 POST
          // /api/asignar secuenciales no solo son lentos, cada uno relee y reescribe
          // el archivo completo, y en paralelo se pisan entre sí (mismo problema que
          // ya se vio con cache-youtube.json).
          if (url.pathname === '/asignar-lote' && req.method === 'POST') {
            const { asignaciones } = await leerCuerpo(req);
            if (!Array.isArray(asignaciones) || asignaciones.length === 0) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'asignaciones_requeridas' }));
            }
            const ejesActuales = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8'));
            const idsEjesValidos = new Set(ejesActuales.ejes.map((e) => e.id));

            const path = join(dataDir, 'biblioteca.json');
            const bib = JSON.parse(readFileSync(path, 'utf8'));
            const porId = new Map(bib.tracks.map((t) => [t.id, t]));

            let aplicadas = 0;
            const resultado = {};
            for (const par of asignaciones) {
              const trackId = par?.trackId;
              const ejeId = par?.ejeId;
              if (typeof trackId !== 'string' || typeof ejeId !== 'string' || !idsEjesValidos.has(ejeId)) continue;
              const track = porId.get(trackId);
              if (!track) continue;
              track.ejes = track.ejes.filter((a) => a.ejeId !== 'sin-clasificar');
              if (!track.ejes.some((a) => a.ejeId === ejeId)) {
                track.ejes.push({ ejeId, origen: 'manual', senal: 'usuario', score: 1 });
              }
              resultado[trackId] = track.ejes;
              aplicadas++;
            }
            escribirAtomico(path, bib);
            return res.end(JSON.stringify({ ok: true, aplicadas, resultado }));
          }

          // POST /api/descubrir-modos -> corre el descubrimiento automatico de modos
          // (Tarea 14) sobre TODA la biblioteca actual, o sobre un subconjunto si
          // viene `trackIds` en el body (Tarea 18: detección incremental — solo los
          // tracks nuevos sin modo, para no re-proponer modos ya existentes). No
          // escribe ejes.json ni biblioteca.json: la persona revisa el resultado en
          // pantalla (Tarea 16) y recien ahi POST /api/confirmar-modos aplica lo que
          // confirmo. Sí persiste el indice de vectores (via descubrirModos ->
          // asegurarVectores), que es cache re-derivable, no dato del usuario.
          if (url.pathname === '/descubrir-modos' && req.method === 'POST') {
            const cuerpo = await leerCuerpo(req).catch(() => ({}));
            const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
            const fuentes = cargarFuentes(dataDir);
            if (!fuentes) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'fuentes_invalidas_o_ausentes' }));
            }
            // `armarGenerosPorTrack` sigue calculándose sobre la biblioteca
            // completa (es barato, solo un Map) aunque después se filtre qué se le
            // pasa a descubrirModos como `tracks` — el Map resultante cubre de
            // sobra los ids filtrados.
            const generosPorTrack = armarGenerosPorTrack(dataDir, biblioteca.tracks, fuentes);
            const trackIdsFiltro = Array.isArray(cuerpo?.trackIds) && cuerpo.trackIds.length > 0
              ? new Set(cuerpo.trackIds)
              : null;
            const tracksParaClusterizar = trackIdsFiltro
              ? biblioteca.tracks.filter((t) => trackIdsFiltro.has(t.id))
              : biblioteca.tracks;
            const resultado = await descubrirModos(
              tracksParaClusterizar,
              generosPorTrack,
              fuentes,
              dataDir,
              biblioteca.tracks.length, // totalTracksReal: la masa mínima siempre se mide contra la biblioteca completa, nunca contra el subconjunto filtrado (ver Tarea 18/Hueco 1 en descubrir-modos.mjs).
            );
            // gruposSinMasa trae `tracksCubiertos` como Set (armado en
            // descubrir-modos.mjs para uso interno) — JSON.stringify serializa un
            // Set como "{}", así que sin este mapeo el residuo por debajo del
            // umbral de masa llega al cliente sin sus trackIds.
            const gruposSinMasa = resultado.gruposSinMasa.map((g) => ({
              terminos: g.terminos,
              masaEnTerminos: g.masaEnTerminos,
              trackIds: [...(g.tracksCubiertos ?? [])],
            }));
            // transversalesDisponibles (Tarea 16) SIEMPRE se calcula sobre TODA la
            // biblioteca, nunca sobre el subconjunto filtrado: un transversal
            // (Entrenar/Dormir/etc.) es un concepto global, no algo específico de
            // un lote de tracks nuevos — si se activa, tiene que poder matchear
            // contra toda la música. A esta altura asegurarVectores (dentro de
            // descubrirModos) ya dejó el índice de vectores de TODA la biblioteca
            // listo para reusar (se embeben todos los tracks pasados a
            // descubrirModos, y acá siempre se le pasa como mínimo eso).
            const transversalesDisponibles = await calcularTransversalesDisponibles(
              dataDir,
              biblioteca.tracks,
              fuentes.transversales,
            );
            const masaMinima = calcularMasaMinima(biblioteca.tracks.length, fuentes.umbrales);
            return res.end(JSON.stringify({ ...resultado, gruposSinMasa, transversalesDisponibles, masaMinima }));
          }

          // GET /api/aviso-modos-nuevos -> lee el aviso que dejó `npm run importar`
          // (Tarea 18) si detectó demasiada música sin modo tras una corrida fuera
          // del navegador. `null` si no hay nada pendiente.
          if (url.pathname === '/aviso-modos-nuevos' && req.method === 'GET') {
            const ruta = join(dataDir, 'aviso-modos-nuevos.json');
            return res.end(existsSync(ruta) ? readFileSync(ruta, 'utf8') : JSON.stringify(null));
          }
          // POST /api/aviso-modos-nuevos -> limpia el aviso (se llama tanto al
          // aceptar la revisión propuesta por el banner como al descartarla: en
          // ningún caso hay que insistir con el mismo aviso en la próxima carga).
          if (url.pathname === '/aviso-modos-nuevos' && req.method === 'POST') {
            const ruta = join(dataDir, 'aviso-modos-nuevos.json');
            if (existsSync(ruta)) rmSync(ruta);
            return res.end(JSON.stringify({ ok: true }));
          }

          // POST /api/confirmar-modos -> aplica el resultado, ya editado por la
          // persona (renombrado/fusionado/descartado en la pantalla de revisión),
          // del descubrimiento de /api/descubrir-modos: crea un eje nuevo por cada
          // modo confirmado (origen: 'descubierto') y por cada transversal activado
          // (origen: 'transversal'), y reclasifica los tracks correspondientes.
          if (url.pathname === '/confirmar-modos' && req.method === 'POST') {
            const cuerpo = await leerCuerpo(req);
            if (!Array.isArray(cuerpo?.modosConfirmados)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'modosConfirmados_requerido' }));
            }
            const transversalesActivados = Array.isArray(cuerpo.transversalesActivados)
              ? cuerpo.transversalesActivados
              : [];

            const ejesPath = join(dataDir, 'ejes.json');
            const bibliotecaPath = join(dataDir, 'biblioteca.json');
            const ejesActuales = JSON.parse(readFileSync(ejesPath, 'utf8'));
            const biblioteca = JSON.parse(readFileSync(bibliotecaPath, 'utf8'));

            const { nuevosEjes } = aplicarModosConfirmados(
              ejesActuales,
              biblioteca,
              cuerpo.modosConfirmados,
              transversalesActivados
            );

            escribirAtomico(ejesPath, ejesActuales);
            escribirAtomico(bibliotecaPath, biblioteca);
            return res.end(JSON.stringify({ ok: true, ejes: nuevosEjes }));
          }

          // POST /api/coleccion -> alterna la pertenencia de un track a una
          // "coleccion" (favoritos o cualquier playlist), independiente de la
          // clasificacion. A diferencia de /api/asignar, NO toca 'sin-clasificar':
          // un track puede estar sin clasificar Y en una playlist a la vez, o
          // clasificado en pop-dance Y en tres playlists distintas a la vez.
          // Generaliza lo que antes era /api/favorito (hardcodeado a un solo
          // ejeId) para que sirva para cualquier playlist que el usuario cree.
          if (url.pathname === '/coleccion' && req.method === 'POST') {
            const { trackId, ejeId, activo } = await leerCuerpo(req);
            if (typeof trackId !== 'string' || !trackId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'trackId_requerido' }));
            }
            if (typeof ejeId !== 'string' || !ejeId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'eje_requerido' }));
            }
            const ejesActuales = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8'));
            const ejeColeccion = ejesActuales.ejes.find((e) => e.id === ejeId);
            if (!ejeColeccion || (ejeColeccion.tipo !== 'playlist' && ejeId !== 'favoritos')) {
              // Solo "favoritos" y ejes tipo 'playlist' son colecciones de
              // pertenencia libre. Meter un modo normal (pop-dance, etc.) por
              // esta via se saltearia la logica de clasificacion automatica.
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'eje_no_es_coleccion', ejeId }));
            }

            const path = join(dataDir, 'biblioteca.json');
            const bib = JSON.parse(readFileSync(path, 'utf8'));
            const track = bib.tracks.find((t) => t.id === trackId);
            if (!track) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'track_no_encontrado' }));
            }
            track.ejes = track.ejes.filter((a) => a.ejeId !== ejeId);
            if (activo) {
              track.ejes.push({ ejeId, origen: 'manual', senal: 'usuario', score: 1 });
            }
            escribirAtomico(path, bib);

            // Sacar un track de una lista puede dejarla en 0 — una lista vacía no
            // aporta nada y solo ensucia el Home, así que se borra sola (nunca al
            // crearla: podarEjesVacios no toca nada hasta que ALGÚN track sale de
            // ella). 'favoritos' es sistema, podarEjesVacios ya la exime.
            let ejesEliminados = [];
            if (!activo) {
              const resultado = podarEjesVacios(ejesActuales.ejes, bib.tracks);
              if (resultado.podados.length > 0) {
                escribirAtomico(join(dataDir, 'ejes.json'), { ejes: resultado.ejes });
                ejesEliminados = resultado.podados;
              }
            }

            return res.end(JSON.stringify({ ok: true, ejes: track.ejes, ejesEliminados }));
          }

          // GET/POST /api/onboarding-visto -> flag simple de "ya vio el
          // onboarding". Antes vivía en localStorage y por eso volvía a
          // aparecer en cada apertura de la app empaquetada (puerto interno
          // al azar en cada arranque = origen distinto = storage vacío). Sin
          // riesgo de conflicto multi-dispositivo: es un booleano que solo
          // puede pasar de false a true, no hay nada que "pisar".
          if (url.pathname === '/onboarding-visto' && req.method === 'GET') {
            const path = join(dataDir, 'onboarding-visto.json');
            const visto = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : false;
            return res.end(JSON.stringify({ visto }));
          }
          if (url.pathname === '/onboarding-visto' && req.method === 'POST') {
            escribirAtomico(join(dataDir, 'onboarding-visto.json'), true);
            return res.end(JSON.stringify({ ok: true }));
          }

          // GET /api/es-demo -> true solo en el build de demo (instalador
          // aparte, para gente que no conoce la app): data/es-demo.json lo
          // escribe scripts/demo-generar-seed.mjs al sembrar las canciones de
          // muestra, y NO existe en un checkout/instalador real. Se usa para
          // agregar un paso de onboarding avisando que esas canciones son de
          // ejemplo y se pueden borrar — nunca se muestra en la app real.
          if (url.pathname === '/es-demo' && req.method === 'GET') {
            return res.end(JSON.stringify({ esDemo: existsSync(join(dataDir, 'es-demo.json')) }));
          }

          // GET /api/favoritos -> lista completa de álbumes/artistas con "me gusta".
          // El cliente guarda esto en memoria y resuelve la pertenencia ahí (mismo
          // criterio que `tracks`/`ejes`), en vez de pedirle al servidor "¿este
          // artista puntual tiene like?" en cada fila.
          if (url.pathname === '/favoritos' && req.method === 'GET') {
            const favPath = join(dataDir, 'favoritos.json');
            const favoritos = existsSync(favPath)
              ? JSON.parse(readFileSync(favPath, 'utf8'))
              : { artistas: [], albumes: [] };
            return res.end(JSON.stringify(favoritos));
          }

          // POST /api/favorito -> "me gusta" para álbum o artista (pedido explícito:
          // el corazón de canciones ya existía vía /api/coleccion, pero ni álbum ni
          // artista son una entidad guardada — se calculan al vuelo desde los
          // tracks — así que hace falta un archivo propio para poder marcarlos.
          // `tipo`: 'artista' (clave = nombre en minúscula) o 'album' (clave =
          // "artista||titulo" en minúscula, porque el mismo título de álbum puede
          // repetirse entre artistas distintos).
          if (url.pathname === '/favorito' && req.method === 'POST') {
            const { tipo, nombre, artista, titulo, activo } = await leerCuerpo(req);
            if (tipo !== 'artista' && tipo !== 'album') {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'tipo_invalido' }));
            }
            const clave =
              tipo === 'artista'
                ? String(nombre ?? '').trim().toLowerCase()
                : `${String(artista ?? '').trim().toLowerCase()}||${String(titulo ?? '').trim().toLowerCase()}`;
            if (!clave || clave === '||') {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'clave_invalida' }));
            }

            const favPath = join(dataDir, 'favoritos.json');
            const favoritos = existsSync(favPath)
              ? JSON.parse(readFileSync(favPath, 'utf8'))
              : { artistas: [], albumes: [] };
            const lista = tipo === 'artista' ? favoritos.artistas : favoritos.albumes;
            const idx = lista.indexOf(clave);
            if (activo && idx === -1) lista.push(clave);
            if (!activo && idx !== -1) lista.splice(idx, 1);
            escribirAtomico(favPath, favoritos);

            return res.end(JSON.stringify({ ok: true }));
          }

          // GET /api/historial -> reproducciones recientes ("Recientes"/"Más
          // sonados"), compartido entre dispositivos. Reemplaza el historial
          // que antes vivía solo en localStorage del navegador — por eso
          // aparecía distinto (o vacío) entre el celular, la PC y la app de
          // escritorio empaquetada: cada una es un perfil de navegador
          // separado, sin storage en común. El servidor es el único lugar
          // que los tres comparten.
          if (url.pathname === '/historial' && req.method === 'GET') {
            const histPath = join(dataDir, 'historial.json');
            const historial = existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf8')) : [];
            return res.end(JSON.stringify(historial));
          }

          // POST /api/historial -> UNA reproducción a agregar (append), nunca
          // el array completo. Si el cliente mandara y pisara el array entero,
          // dos dispositivos escribiendo casi al mismo tiempo se pisarían las
          // entradas del otro — con append eso no puede pasar, cada POST solo
          // agrega la suya. `ts` se pone acá (no se confía en el reloj del
          // cliente) para que el orden entre dispositivos sea consistente.
          if (url.pathname === '/historial' && req.method === 'POST') {
            const { trackId, ejeId, ejeNombre, titulo, artista, duracionS } = await leerCuerpo(req);
            if (!trackId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'trackId_requerido' }));
            }
            const histPath = join(dataDir, 'historial.json');
            const historial = existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf8')) : [];
            const nuevo = [
              { trackId, ejeId: ejeId ?? null, ejeNombre: ejeNombre ?? null, titulo, artista, ...(Number.isFinite(duracionS) ? { duracionS } : {}), ts: Date.now() },
              ...historial,
            ].slice(0, 1000);
            escribirAtomico(histPath, nuevo);
            return res.end(JSON.stringify({ ok: true }));
          }

          // POST /api/historial/migrar -> sube el historial local viejo (de
          // localStorage, de antes de que esto sincronizara) UNA sola vez.
          // Guarda solo si el servidor todavía no tiene nada — así dos
          // dispositivos migrando su historial local no se pisan entre sí ni
          // pisan reproducciones que ya llegaron por /api/historial normal.
          if (url.pathname === '/historial/migrar' && req.method === 'POST') {
            const { entradas } = await leerCuerpo(req);
            const histPath = join(dataDir, 'historial.json');
            const actual = existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf8')) : [];
            if (actual.length > 0 || !Array.isArray(entradas) || entradas.length === 0) {
              return res.end(JSON.stringify({ ok: true, migrado: false }));
            }
            escribirAtomico(histPath, entradas.slice(0, 1000));
            return res.end(JSON.stringify({ ok: true, migrado: true }));
          }

          // GET /api/ultimos-modos -> ids de los últimos modos entrados, para
          // "Seguí escuchando" del Home. Mismo motivo que /api/historial:
          // antes vivía en localStorage y por eso no era el mismo entre
          // dispositivos.
          if (url.pathname === '/ultimos-modos' && req.method === 'GET') {
            const path = join(dataDir, 'ultimos-modos.json');
            const ids = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
            return res.end(JSON.stringify(ids));
          }

          // POST /api/ultimos-modos -> registra que se entró a un modo (mueve
          // al frente si ya estaba, corta a 6). Mismo criterio de "un evento
          // por vez" que /api/historial, no el array completo.
          if (url.pathname === '/ultimos-modos' && req.method === 'POST') {
            const { ejeId } = await leerCuerpo(req);
            if (!ejeId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'ejeId_requerido' }));
            }
            const path = join(dataDir, 'ultimos-modos.json');
            const actuales = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
            const nuevos = [ejeId, ...actuales.filter((id) => id !== ejeId)].slice(0, 6);
            escribirAtomico(path, nuevos);
            return res.end(JSON.stringify({ ok: true }));
          }

          // POST /api/ultimos-modos/migrar -> mismo criterio que
          // /api/historial/migrar: solo pisa si el servidor todavía no tiene nada.
          if (url.pathname === '/ultimos-modos/migrar' && req.method === 'POST') {
            const { ids } = await leerCuerpo(req);
            const path = join(dataDir, 'ultimos-modos.json');
            const actuales = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
            if (actuales.length > 0 || !Array.isArray(ids) || ids.length === 0) {
              return res.end(JSON.stringify({ ok: true, migrado: false }));
            }
            escribirAtomico(path, ids.slice(0, 6));
            return res.end(JSON.stringify({ ok: true, migrado: true }));
          }

          // POST /api/importar-tunemymusic -> pantalla "Cargar tu biblioteca". Recibe
          // el CONTENIDO del CSV (el navegador ya lo leyó del disco del usuario con
          // FileReader, acá no se toca el filesystem del cliente). No corre acá
          // mismo la resolución de YouTube ni las pasadas de descripción/género —
          // eso puede tardar minutos con una biblioteca grande y dejaría al usuario
          // esperando en una pantalla de carga; los tracks nuevos se resuelven
          // solos la primera vez que suenan, igual que los agregados desde el
          // buscador externo. El enriquecimiento de Deezer/MusicBrainz sí arranca
          // (en background, sin bloquear esta respuesta — ver dispararEnriquecimiento
          // más abajo y spec 2026-09-08-enriquecimiento-automatico-design.md).
          if (url.pathname === '/importar-tunemymusic' && req.method === 'POST') {
            const { contenido } = await leerCuerpo(req);
            if (typeof contenido !== 'string' || !contenido.trim()) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'contenido_requerido' }));
            }

            const { filas, filasDescartadas, error } = parsearCsvTuneMyMusic(contenido);
            if (error) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'csv_invalido', mensaje: error }));
            }

            const bibPath = join(dataDir, 'biblioteca.json');
            const biblioteca = JSON.parse(readFileSync(bibPath, 'utf8'));
            const ejesPath = join(dataDir, 'ejes.json');
            const ejesActuales = JSON.parse(readFileSync(ejesPath, 'utf8')).ejes;
            const metaSpotifyPath = join(dataDir, 'metadata-spotify.json');
            const metaSpotify = existsSync(metaSpotifyPath)
              ? JSON.parse(readFileSync(metaSpotifyPath, 'utf8'))
              : { version: 1, tracks: {} };
            // Para el desempate de fusionarDuplicadosCruzados (dentro de
            // aplicarFilasTuneMyMusic) — mismo criterio que el importador de
            // terminal: preferir el track que ya tiene una resolución de
            // YouTube cacheada en vez de gastar cuota buscando otra.
            const cacheYoutubePath = join(dataDir, 'cache-youtube.json');
            const cacheYoutube = existsSync(cacheYoutubePath)
              ? JSON.parse(readFileSync(cacheYoutubePath, 'utf8'))
              : {};

            const stats = aplicarFilasTuneMyMusic(filas, {
              biblioteca,
              ejes: ejesActuales,
              metaSpotify,
              cacheYoutube,
            });

            if (stats.listasNuevas.length > 0) {
              const problema = validarEjes({ ejes: stats.ejesFinal });
              if (problema) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: 'ejes_invalidos_tras_importar', mensaje: problema }));
              }
            }

            const propagadas = propagarSugerenciasUnanimes(biblioteca.tracks, stats.ejesFinal);

            // Listas/modos que quedaron sin ningún track tras esta importación
            // (nunca las recién creadas: esas siempre tienen al menos 1 fila que
            // las trajo) se borran solas — no ensucian el Home.
            const podado = podarEjesVacios(stats.ejesFinal, biblioteca.tracks);

            biblioteca.totalTracks = biblioteca.tracks.length;
            escribirAtomico(bibPath, biblioteca);
            if (stats.albumesNuevos > 0) escribirAtomico(metaSpotifyPath, metaSpotify);
            if (stats.listasNuevas.length > 0 || podado.podados.length > 0) {
              escribirAtomico(ejesPath, { ejes: podado.ejes });
            }

            // Enriquecimiento automático en background (spec
            // 2026-09-08-enriquecimiento-automatico-design.md): arranca solo
            // tras cualquier import que sume tracks nuevos, sin bloquear esta
            // respuesta. No se espera (sin `await`) a propósito.
            dispararEnriquecimiento(dataDir, { contacto: env.MUSICBRAINZ_CONTACT, tokenGenius: env.GENIUS_ACCESS_TOKEN, onCambioEstado: difundirEnriquecimiento });

            return res.end(
              JSON.stringify({
                ok: true,
                filasLeidas: filas.length + filasDescartadas.length,
                filasDescartadas: filasDescartadas.length,
                tracksNuevos: stats.tracksNuevos,
                favoritosMarcados: stats.favoritosMarcados,
                pertenenciasMarcadas: stats.pertenenciasMarcadas,
                albumesNuevos: stats.albumesNuevos,
                listasNuevas: stats.listasNuevas.map((e) => e.nombre),
                listasEliminadas: podado.podados,
                propagadas,
                tracks: biblioteca.tracks,
                ejes: podado.ejes,
              })
            );
          }

          // POST /api/importar-local -> pantalla "Cargar música local". Recibe
          // las RUTAS absolutas de mp3 que el navegador ya juntó con un
          // <input type="file" webkitdirectory> (resueltas vía
          // window.musicsippi.getPathForFile, ver electron/preload.cjs —
          // File.path ya no existe en Electron 32+) — nunca el contenido
          // binario, el servidor ya tiene acceso directo a ese disco. No
          // corre acá mismo la resolución
          // de YouTube, mismo criterio que /importar-tunemymusic — pero sí
          // dispara el enriquecimiento de Deezer/MusicBrainz en background
          // (ver dispararEnriquecimiento más abajo).
          if (url.pathname === '/importar-local' && req.method === 'POST') {
            const { rutas } = await leerCuerpo(req);
            if (!Array.isArray(rutas) || rutas.length === 0) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'rutas_requeridas' }));
            }
            if (rutas.length > LIMITE_RUTAS_IMPORTAR_LOCAL) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'demasiadas_rutas', limite: LIMITE_RUTAS_IMPORTAR_LOCAL }));
            }

            const entradas = [];
            let noLeidos = 0;
            for (const ruta of rutas) {
              if (typeof ruta !== 'string' || !ruta.toLowerCase().endsWith('.mp3')) {
                noLeidos++;
                continue;
              }
              try {
                const metadata = await parseFile(ruta, { duration: false });
                entradas.push({ ...resolverMetadataLocal(ruta, metadata.common), ruta });
              } catch (err) {
                console.error('[importar-local] no se pudo leer', ruta, err.message);
                noLeidos++;
              }
            }

            const bibPath = join(dataDir, 'biblioteca.json');
            const biblioteca = JSON.parse(readFileSync(bibPath, 'utf8'));
            const ejesActuales = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8')).ejes;

            const stats = aplicarArchivosLocales(entradas, { biblioteca, ejes: ejesActuales });
            // El PC recuerda dónde está cada archivo (solo en su índice, nunca en la biblioteca) para ofrecerlo al móvil.
            for (const e of entradas) {
              try { archivosLocales.registrarArchivoPC(idTrack(e.artista, e.titulo), e.ruta); } catch { /* el archivo desapareció: se omite */ }
            }
            archivosLocales.completarHashes().catch(() => {});
            const propagadas = propagarSugerenciasUnanimes(biblioteca.tracks, ejesActuales);

            biblioteca.totalTracks = biblioteca.tracks.length;
            escribirAtomico(bibPath, biblioteca);

            // Mismo disparo que POST /api/importar-tunemymusic (ver
            // scripts/lib/enriquecimiento-automatico.mjs) — cualquier import
            // que sume tracks nuevos dispara el enriquecimiento en background.
            dispararEnriquecimiento(dataDir, { contacto: env.MUSICBRAINZ_CONTACT, tokenGenius: env.GENIUS_ACCESS_TOKEN, onCambioEstado: difundirEnriquecimiento });

            return res.end(
              JSON.stringify({
                ok: true,
                total: rutas.length,
                agregados: stats.tracksNuevos,
                fusionados: stats.tracksFusionados,
                sinClasificar: stats.sinClasificar,
                noLeidos,
                propagadas,
                tracks: biblioteca.tracks,
              })
            );
          }

          // GET /api/canal-reproduccion -> conexión SSE persistente. Cada pestaña se
          // suscribe una vez al montar; ver el comentario junto a `clientesSSE` arriba.
          if (url.pathname === '/canal-reproduccion') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.write(': conectado\n\n');
            clientesSSE.add(res);
            req.on('close', () => clientesSSE.delete(res));
            return; // sin res.end(): la conexión queda abierta a propósito
          }

          // GET /api/canal-enriquecimiento -> conexión SSE persistente con el
          // progreso del enriquecimiento automático en background. Ver el
          // comentario junto a `clientesEnriquecimientoSSE` arriba.
          if (url.pathname === '/canal-enriquecimiento') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.write(': conectado\n\n');
            res.write(`event: estado\ndata: ${JSON.stringify(ultimoEstadoEnriquecimiento)}\n\n`);
            clientesEnriquecimientoSSE.add(res);
            req.on('close', () => clientesEnriquecimientoSSE.delete(res));
            return;
          }

          // POST /api/reproduciendo -> avisa que ESTA pestaña arrancó a sonar; el
          // servidor le reenvía "pausate" a todas las demás conexiones SSE abiertas.
          if (url.pathname === '/reproduciendo' && req.method === 'POST') {
            const { sesionId } = await leerCuerpo(req);
            if (typeof sesionId !== 'string' || !sesionId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'sesionId_requerido' }));
            }
            difundirSSE('pausate', { sesionId });
            return res.end(JSON.stringify({ ok: true }));
          }

          // GET /api/biblioteca-fresca -> tracks + ejes tal como están AHORA en
          // disco. `tracks`/`ejes` en App.jsx arrancan de un import estático
          // (../data/biblioteca.json, ../data/ejes.json) leído UNA sola vez al
          // cargar el módulo — el enriquecimiento automático en background
          // reescribe esos archivos en disco todo el tiempo (Deezer,
          // MusicBrainz, re-descubrimiento de modos) pero una ventana ya
          // abierta nunca se entera: no había forma de conectar "el ciclo
          // terminó" (la señal de /api/canal-enriquecimiento) con "volver a
          // leer los datos".
          // Verificado con datos reales: tras un ciclo completo, el archivo en
          // disco bajaba de 1755 a 1324 canciones sin clasificar pero la
          // ventana abierta seguía mostrando 1755 hasta reiniciar. Este
          // endpoint es lo que el cliente pide cuando `activo` pasa de true a
          // false, para no necesitar ese reinicio manual.
          // GET /api/direcciones-red -> ["192.168.0.10:51234", ...]: lo que hay que
          // escribir en la app Android para "Sincronizar con el PC" (la app de
          // escritorio escucha en un puerto libre cualquiera).
          if (url.pathname === '/direcciones-red' && req.method === 'GET') {
            const puerto = req.socket.localPort;
            const direcciones = Object.values(networkInterfaces())
              .flat()
              .filter((i) => i && i.family === 'IPv4' && !i.internal)
              .map((i) => `${i.address}:${puerto}`);
            return res.end(JSON.stringify({ direcciones }));
          }

          // GET /api/qr-movil?d=IP:puerto -> SVG con el enlace musicsippi://sincronizar?d=...
          // Se escanea con la cámara del móvil: abre la app Android y sincroniza sola.
          if (url.pathname === '/qr-movil' && req.method === 'GET') {
            const d = url.searchParams.get('d') ?? '';
            if (!/^[\d.]+:\d+$/.test(d)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'direccion_invalida' }));
            }
            // La clave de emparejamiento solo viaja en el QR que ve quien está delante del PC (petición local).
            const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
            const k = local ? `&k=${archivosLocales.claveEmparejamiento()}` : '';
            const svg = await QRCode.toString(`musicsippi://sincronizar?d=${d}${k}`, { type: 'svg', margin: 2, width: 240 });
            res.setHeader('Content-Type', 'image/svg+xml');
            return res.end(svg);
          }

          // /api/archivos-locales/* -> audio local entre PC y móvil. Solo LAN privada y host privado
          // (anti DNS-rebinding). La clave de emparejamiento NO viaja: cada petición lleva una firma HMAC
          // con un nonce de un solo uso (GET nonce) y el saludo (hola) da prueba mutua. Ver archivos-locales.mjs.
          if (url.pathname.startsWith('/archivos-locales/')) {
            req.setTimeout(60000);
            const accion = url.pathname.slice('/archivos-locales/'.length);
            const host = req.socket.remoteAddress;
            const hostCabecera = String(req.headers.host ?? '').replace(/:\d+$/, '');
            const responder = (r) => { res.statusCode = r.status; return res.end(JSON.stringify(r.cuerpo)); };
            if (!esHostPrivado(host) || !esHostPrivado(hostCabecera)) return responder({ status: 403, cuerpo: { error: 'red_no_permitida' } });
            const crudo = req.method === 'GET' ? Buffer.alloc(0) : await leerCuerpo(req, { crudo: true });
            const auth = {
              metodo: req.method,
              ruta: `archivos-locales/${accion}${url.search}`,
              cuerpo: crudo,
              nonce: req.headers[CABECERA_NONCE],
              ts: req.headers[CABECERA_MARCA],
              firma: req.headers[CABECERA_FIRMA],
            };
            const json = () => (crudo.length ? JSON.parse(crudo.toString('utf8')) : {});
            if (accion === 'hola' && req.method === 'GET') {
              const direccionPC = `${req.socket.localAddress.replace(/^::ffff:/i, '')}:${req.socket.localPort}`;
              return responder(archivosLocales.hola({ reto: url.searchParams.get('r'), host, direccionPC }));
            }
            if (accion === 'nonce' && req.method === 'GET') return responder({ status: 200, cuerpo: { nonce: archivosLocales.emitirNonce(host) } });
            if (accion === 'manifiesto' && req.method === 'GET') return responder(archivosLocales.manifiesto({ auth, host }));
            if (accion === 'iniciar' && req.method === 'POST') return responder(archivosLocales.iniciar({ auth, host, cuerpo: json() }));
            if (accion === 'bloque' && req.method === 'PUT') {
              const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(req.headers['content-range'] ?? ''));
              const { token, base64 } = json();
              const rango = m ? { inicio: Number(m[1]), fin: Number(m[2]) + 1 } : null;
              return responder(archivosLocales.recibirBloque({ auth, host, token, rango, datos: Buffer.from(String(base64 ?? ''), 'base64') }));
            }
            if (accion === 'bloque' && req.method === 'GET') {
              const m = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range ?? ''));
              const r = archivosLocales.leerBloque({ auth, host, token: url.searchParams.get('token'), inicio: m ? Number(m[1]) : NaN, fin: m ? Number(m[2]) + 1 : NaN });
              if (r.ok) res.setHeader('Content-Range', `bytes ${r.cuerpo.inicio}-${r.cuerpo.fin - 1}/${r.cuerpo.total}`);
              return responder(r);
            }
            if (accion === 'finalizar' && req.method === 'POST') return responder(await archivosLocales.finalizar({ auth, host, token: json().token }));
            return responder({ status: 404, cuerpo: { error: 'no_encontrado' } });
          }

          // GET /api/exportar-movil -> todo lo que la app Android fusiona al
          // sincronizar (ver fusionarDatosDelPC en src/data/biblioteca-local.js).
          if (url.pathname === '/esquema-moods' && req.method === 'GET') {
            // Versión de esquema de moods (0 = taxonomía antigua, 1 = moods): el móvil no sincroniza si difiere de la suya.
            const p = join(dataDir, 'ejes.json');
            const datos = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { ejes: [] };
            return res.end(JSON.stringify({ esquema: esquemaDeEjes(datos.ejes, datos.esquemaMoods) }));
          }

          if (url.pathname === '/exportar-movil' && req.method === 'GET') {
            const leer = (nombre, porDefecto) => {
              const p = join(dataDir, nombre);
              return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : porDefecto;
            };
            const biblioteca = leer('biblioteca.json', { tracks: [] });
            const ejesExportados = leer('ejes.json', { ejes: [] });
            return res.end(
              JSON.stringify({
                version: 1,
                generado: biblioteca.generado ?? null,
                tracks: biblioteca.tracks,
                ejes: ejesExportados.ejes,
                esquemaMoods: esquemaDeEjes(ejesExportados.ejes, ejesExportados.esquemaMoods),
                favoritos: leer('favoritos.json', null),
                cacheYoutube: leer('cache-youtube.json', {}),
                overrides: leer('overrides.json', {}),
                metadata: combinarMetadata(dataDir),
                evidencia: evidenciaParaMovil(dataDir, biblioteca.tracks),
              })
            );
          }

          if (url.pathname === '/biblioteca-fresca' && req.method === 'GET') {
            const bibPath = join(dataDir, 'biblioteca.json');
            const ejesPath = join(dataDir, 'ejes.json');
            const biblioteca = JSON.parse(readFileSync(bibPath, 'utf8'));
            const ejesData = JSON.parse(readFileSync(ejesPath, 'utf8'));
            return res.end(JSON.stringify({ tracks: biblioteca.tracks, ejes: ejesData.ejes }));
          }

          // GET /api/overrides -> correcciones manuales de titulo/artista/album/anio
          //
          // Capa separada de biblioteca.json (el import original) y de
          // metadata-musicbrainz.json (el enriquecimiento automatico): guardar la
          // correccion ACA en vez de pisar esos archivos evita que una reimportacion
          // o un reintento del enriquecimiento borre lo que el usuario corrigio a mano.
          if (url.pathname === '/overrides' && req.method === 'GET') {
            const path = join(dataDir, 'overrides.json');
            if (!existsSync(path)) {
              return res.end(JSON.stringify({}));
            }
            return res.end(readFileSync(path, 'utf8'));
          }

          // POST /api/override -> guarda/borra una correccion manual para un track
          if (url.pathname === '/override' && req.method === 'POST') {
            const { trackId, cambios } = await leerCuerpo(req);
            if (typeof trackId !== 'string' || !trackId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'trackId_requerido' }));
            }
            if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'cambios_invalidos' }));
            }
            const path = join(dataDir, 'biblioteca.json');
            const bib = JSON.parse(readFileSync(path, 'utf8'));
            if (!bib.tracks.some((t) => t.id === trackId)) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'track_no_encontrado' }));
            }

            const CAMPOS_VALIDOS = ['titulo', 'artista', 'album', 'anio'];
            const overridesPath = join(dataDir, 'overrides.json');
            const actual = existsSync(overridesPath)
              ? JSON.parse(readFileSync(overridesPath, 'utf8'))
              : {};
            // Object.hasOwn en vez de acceso directo: mismo motivo que en /resolver
            // (trackId="__proto__" no debe pisar el prototipo del objeto en memoria).
            const entrada = { ...(Object.hasOwn(actual, trackId) ? actual[trackId] : {}) };
            for (const campo of CAMPOS_VALIDOS) {
              if (!Object.hasOwn(cambios, campo)) continue;
              const valor = cambios[campo];
              // Un campo vacio significa "sacar la correccion", no "corregir a
              // vacio" — no tiene sentido guardar un titulo en blanco.
              if (valor === null || valor === '' || valor === undefined) {
                delete entrada[campo];
              } else if (campo === 'anio') {
                const n = Number(valor);
                if (!Number.isInteger(n) || n < 1900 || n > 2100) {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ error: 'anio_invalido' }));
                }
                entrada.anio = n;
              } else {
                entrada[campo] = String(valor).trim();
              }
            }
            if (Object.keys(entrada).length === 0) {
              delete actual[trackId];
            } else {
              actual[trackId] = entrada;
            }
            escribirAtomico(overridesPath, actual);
            return res.end(JSON.stringify({ overrides: actual }));
          }

          // GET /api/backup -> exporta lo que es DATO DEL USUARIO (no cache
          // re-derivable de una API externa): biblioteca (tracks + a qué
          // modo/lista pertenece cada uno), ejes (la estructura de modos/
          // listas en sí), favoritos (me gusta de artista/álbum), overrides
          // (correcciones manuales de título/artista/año) y descartados
          // (decisiones de "esto no" en clasificación). Deja afuera
          // metadata-*.json/artistas-deezer.json/cache-youtube.json a
          // propósito: son cache de portadas/fotos/videoIds, se puede volver
          // a pedir a las APIs — no es información que el usuario haya creado
          // y que se pierda si no se guarda. Decisión de diseño: local
          // primero (JSON descargable), nube queda para más adelante.
          if (url.pathname === '/backup') {
            const leer = (nombre, porDefecto) => {
              const p = join(dataDir, nombre);
              return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : porDefecto;
            };
            const biblioteca = leer('biblioteca.json', { tracks: [] });
            const ejesData = leer('ejes.json', { ejes: [] });
            const tracks = biblioteca.tracks ?? [];
            const ejesArr = ejesData.ejes ?? [];
            const nombreDeEje = new Map(ejesArr.map((e) => [e.id, e.nombre]));

            const formato = url.searchParams.get('formato') ?? 'json';

            // CSV con las mismas columnas que espera parsearCsvTuneMyMusic
            // (scripts/lib/importar-tunemymusic.mjs) — no es un formato
            // nuevo inventado, es el que la app ya sabe re-importar. Una
            // fila por (track, lista) — un track en 3 listas son 3 filas,
            // mismo criterio que el CSV real de TuneMyMusic.
            if (formato === 'csv') {
              const escaparCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
              const filas = ['Track name,Artist name,Album,Playlist name,Type'];
              for (const t of tracks) {
                const listas = (t.ejes ?? [])
                  .map((a) => nombreDeEje.get(a.ejeId))
                  .filter(Boolean);
                const destinos = listas.length > 0 ? listas : [''];
                for (const nombreLista of destinos) {
                  filas.push(
                    [escaparCsv(t.titulo), escaparCsv(t.artista), '', escaparCsv(nombreLista), ''].join(',')
                  );
                }
              }
              res.setHeader('Content-Type', 'text/csv; charset=utf-8');
              res.setHeader('Content-Disposition', 'attachment; filename="musicsippi-backup.csv"');
              return res.end('﻿' + filas.join('\r\n'));
            }

            // Texto plano legible — pensado para leer o compartir, no para
            // reimportar (para eso está el CSV). Agrupado por lista/modo,
            // mismo agrupamiento que "Mis listas" del Home.
            if (formato === 'texto') {
              const lineas = [
                `Musicsippi — backup (${new Date().toLocaleDateString('es-AR')})`,
                `${tracks.length} canciones en total`,
                '',
              ];
              for (const eje of ejesArr) {
                if (!eje.activo || eje.sistema) continue;
                const idsDelEje = tracks.filter((t) => (t.ejes ?? []).some((a) => a.ejeId === eje.id));
                if (idsDelEje.length === 0) continue;
                lineas.push(`== ${eje.nombre} (${idsDelEje.length}) ==`);
                for (const t of idsDelEje) {
                  lineas.push(`${t.artista} - ${t.titulo}`);
                }
                lineas.push('');
              }
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.setHeader('Content-Disposition', 'attachment; filename="musicsippi-backup.txt"');
              return res.end(lineas.join('\r\n'));
            }

            const backup = {
              version: 1,
              exportadoEn: new Date().toISOString(),
              biblioteca,
              ejes: ejesData,
              favoritos: leer('favoritos.json', { artistas: [], albumes: [] }),
              overrides: leer('overrides.json', {}),
              descartados: leer('descartados.json', {}),
            };
            res.setHeader('Content-Disposition', 'attachment; filename="musicsippi-backup.json"');
            return res.end(JSON.stringify(backup, null, 2));
          }

          // POST /api/restaurar -> el otro lado de /api/backup: pisa
          // biblioteca/ejes/favoritos/overrides/descartados con lo que venga
          // en un JSON de backup. Antes de sobrescribir cada archivo, guarda
          // una copia de lo que había en "<nombre>.pre-restaurar.json" (se
          // pisa en cada restauración, no acumula) — un backup equivocado no
          // debe ser irreversible. No actualiza el estado ya cargado en el
          // navegador (biblioteca/ejes se importan estáticos, ver el
          // comentario grande en electron/main.cjs); el cliente recarga la
          // página después de un restore exitoso.
          if (url.pathname === '/restaurar' && req.method === 'POST') {
            const backup = await leerCuerpo(req);
            if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'formato_invalido' }));
            }
            const { biblioteca: bibNueva, ejes: ejesNuevos, favoritos: favNuevos, overrides: ovNuevos, descartados: descNuevos } = backup;
            if (!bibNueva || !Array.isArray(bibNueva.tracks)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'falta_biblioteca_tracks' }));
            }
            if (!ejesNuevos || !Array.isArray(ejesNuevos.ejes)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'falta_ejes' }));
            }
            const archivos = {
              'biblioteca.json': bibNueva,
              'ejes.json': ejesNuevos,
              'favoritos.json': favNuevos ?? { artistas: [], albumes: [] },
              'overrides.json': ovNuevos ?? {},
              'descartados.json': descNuevos ?? {},
            };
            for (const [nombre, contenido] of Object.entries(archivos)) {
              const p = join(dataDir, nombre);
              if (existsSync(p)) {
                const previo = join(dataDir, nombre.replace(/\.json$/, '.pre-restaurar.json'));
                writeFileSync(previo, readFileSync(p, 'utf8'), 'utf8');
              }
              escribirAtomico(p, contenido);
            }
            return res.end(JSON.stringify({ ok: true, tracks: bibNueva.tracks.length }));
          }

          // POST /api/reiniciar -> "reinicio total" (Tarea 19): borra
          // biblioteca, modos, historial, favoritos, overrides y vectores, y
          // deja la app en el mismo estado que una instalación fresca. La
          // confirmación real es acá, no en el cliente: sin
          // confirmacion === 'BORRAR' literal en el body, se rechaza con 400.
          //
          // ejes.json NO se recrea como {ejes: []}: validarEjes() (más abajo
          // en este archivo) exige un eje de sistema "sin-clasificar", y sin
          // él cualquier guardado posterior de ejes (p. ej. desde Administrar)
          // queda bloqueado para siempre con "No se puede eliminar el eje de
          // sistema...", sin forma de arreglarlo desde la UI salvo editando el
          // JSON a mano. Se recrean los 2 ejes de sistema reales
          // (sin-clasificar y favoritos, este último para que el corazón del
          // reproductor tenga dónde guardar) con la misma forma que trae
          // data/ejes.json de una instalación real, y se valida el resultado
          // con validarEjes() antes de escribirlo.
          if (url.pathname === '/reiniciar' && req.method === 'POST') {
            const cuerpo = await leerCuerpo(req);
            if (!cuerpo || cuerpo.confirmacion !== 'BORRAR') {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'confirmacion_invalida' }));
            }

            // Datos de usuario reales, no cache de red: se borran siempre.
            // descartados.json (discards del importador CLI) y
            // videos-descartados.json (ids que el cliente reportó como no
            // reproducibles) entran acá y no en el cache de abajo: /api/backup
            // y /api/restaurar ya los tratan como parte del estado de
            // biblioteca (ver más arriba en este mismo endpoint y en
            // /api/backup), no como algo caro de red que valga la pena
            // conservar.
            const archivosCore = [
              'biblioteca.json',
              'ejes.json',
              'historial.json',
              'favoritos.json',
              'vectores.bin',
              'vectores-indice.json',
              'overrides.json',
              'descartados.json',
              'videos-descartados.json',
              'ultimos-modos.json',
              'onboarding-visto.json',
              // Ya nada la escribe (el banner que la usaba dejó de ser
              // descartable — ver docs/superpowers/specs/2026-09-11-...), pero
              // una instalación de antes de ese cambio puede tenerla en disco
              // todavía. Se deja acá para que "Reiniciar todo" siga limpiando
              // esas instalaciones existentes; borrarla de esta lista dejaría
              // un archivo huérfano que un reinicio total ya no toca.
              'aviso-importar-descartado.json',
            ];
            for (const nombre of archivosCore) {
              const ruta = join(dataDir, nombre);
              if (existsSync(ruta)) rmSync(ruta);
            }

            // Cache de red: cuesta cuota/scraping real (YouTube, MusicBrainz,
            // Deezer, Spotify). Se conserva salvo pedido explícito de borrar
            // también lo descargado.
            if (cuerpo.borrarDescargado) {
              const archivosCache = [
                'cache-youtube.json',
                'resolucion-youtube.json',
                'descripciones-youtube.json',
                'metadata-musicbrainz.json',
                'metadata-spotify.json',
                'metadata-deezer.json',
                'albumes-deezer.json',
                'artistas-deezer.json',
              ];
              for (const nombre of archivosCache) {
                const ruta = join(dataDir, nombre);
                if (existsSync(ruta)) rmSync(ruta);
              }
            }

            // escribirAtomico y no writeFileSync: biblioteca.json/ejes.json se
            // importan estáticos en App.jsx (ver comentario grande en
            // electron/main.cjs), así que un archivo a medio escribir acá no
            // rompe un endpoint puntual, rompe el arranque de la app entera.
            escribirAtomico(join(dataDir, 'biblioteca.json'), {
              version: 1,
              generado: new Date().toISOString(),
              totalTracks: 0,
              tracks: [],
            });

            const ejesFrescos = {
              ejes: [
                {
                  id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', orden: 999,
                  activo: true, sistema: true, padre: null,
                  descripcion:
                    'Bandeja de entrada. No se puede eliminar. Los tracks que caen aqui esperan asignacion manual, y cada asignacion manual refuerza las anclas del eje elegido.',
                  anclas: { artistas: [], titulos: [] }, tagsLastfm: [],
                },
                {
                  id: 'favoritos', nombre: 'Favoritas', tipo: 'gusto', orden: 0,
                  activo: true, sistema: true, padre: null,
                  descripcion:
                    'Tracks marcados con me gusta desde el reproductor (boton de corazon en la barra). No se clasifica automaticamente y no aparece como opcion en Para clasificar: es un tag independiente del modo, no un modo mas.',
                  anclas: { artistas: [], titulos: [] }, tagsLastfm: [],
                },
              ],
            };
            const problema = validarEjes(ejesFrescos);
            if (problema) {
              // No debería pasar nunca (los 2 ejes de arriba son fijos), pero
              // si pasara, mejor un 500 explícito que dejar ejes.json corrupto
              // o vacío.
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: `ejes_invalidos: ${problema}` }));
            }
            escribirAtomico(join(dataDir, 'ejes.json'), ejesFrescos);

            return res.end(JSON.stringify({ ok: true }));
          }

          // GET /api/metadata -> album/anio/generos/portada, combinando MusicBrainz
          // (toda la biblioteca, sin álbum ni portada) con el scraping de Spotify
          // embed (solo lo que está en alguna playlist del usuario, pero con año
          // más confiable y portada). Campo por campo, no archivo por archivo: un
          // track puede tener el álbum de MusicBrainz Y la portada de Spotify.
          //
          // Se sirve por fetch, NO por import estatico en App.jsx a proposito: el
          // script de enriquecimiento reescribe este archivo cada 20 tracks durante
          // ~1 hora. Un import estatico dispara el watcher de Vite en cada escritura
          // y fuerza un full-reload del modulo que lo importa — en este caso, toda
          // la app, cortando la musica cada pocos minutos mientras corre de fondo.
          // Leerlo fresco en cada pedido evita ese problema por completo.
          // Combina 3 fuentes, campo por campo (un track puede tener el álbum de
          // MusicBrainz, la portada de Spotify Y la foto de artista de Deezer):
          //  - MusicBrainz: toda la biblioteca, sin álbum ni portada.
          //  - Spotify embed: solo lo que está en alguna playlist del usuario,
          //    pero con año más confiable y portada.
          //  - Deezer: sin auth, ~96.5% de acierto medido en vivo (2160/2238) —
          //    la ÚNICA fuente que trae foto de artista, y respaldo de portada
          //    para lo que Spotify no cubre.
          if (url.pathname === '/metadata') {
            return res.end(JSON.stringify(combinarMetadata(dataDir)));
          }

          // GET /api/cercanos?trackId=...&n=...  -> tracks mas cercanos por similitud de embedding
          if (url.pathname === '/cercanos' && req.method === 'GET') {
            const trackId = url.searchParams.get('trackId');
            const n = Number(url.searchParams.get('n') ?? 20);
            if (!trackId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'falta_trackId' }));
            }
            const vector = vectorDe(dataDir, trackId);
            if (!vector) {
              return res.end(JSON.stringify({ cercanos: [] }));
            }
            const cercanos = masCercanos(dataDir, vector, n, (id) => id !== trackId);
            return res.end(JSON.stringify({ cercanos }));
          }

          // POST /api/fuentes/actualizar -> chequea el repo remoto de fuentes.json
          // y lo aplica si es valido y mas nuevo. Ver scripts/lib/fuentes.mjs:
          // nunca ejecuta nada de adentro del archivo remoto, es dato puro.
          if (url.pathname === '/fuentes/actualizar' && req.method === 'POST') {
            const resultado = await verificarActualizacion(dataDir, URL_FUENTES_REMOTO);
            return res.end(JSON.stringify(resultado));
          }

          // GET /api/fuentes/actual -> fuentes.json vigente (o null si todavia no existe)
          if (url.pathname === '/fuentes/actual' && req.method === 'GET') {
            return res.end(JSON.stringify({ fuentes: cargarFuentes(dataDir) }));
          }

          // POST /api/fuentes/cargar-manual -> carga manual desde Configuracion
          if (url.pathname === '/fuentes/cargar-manual' && req.method === 'POST') {
            const cuerpo = await leerCuerpo(req);
            const resultado = guardarSiValido(dataDir, cuerpo);
            return res.end(JSON.stringify(resultado));
          }

          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'ruta_desconocida' }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'excepcion', mensaje: String(e) }));
        }
      });

      // Reparación de ejes duplicados que generó la propia app antes de que
      // existieran los arreglos de raíz (ver reparar-duplicados.mjs). Corre
      // ANTES del enriquecimiento a propósito: el ciclo escribe ejes.json y
      // biblioteca.json, así que conviene dejarlos sanos primero. Es
      // idempotente y no escribe nada si no hay nada roto, así que no hace
      // falta ninguna marca de "ya migré".
      try {
        const reparacion = repararDuplicadosEnDisco(dataDir);
        if (reparacion) {
          const fusionados = reparacion.modosFusionados.map((m) => m.nombre).join(', ');
          const absorbidas = reparacion.listasAbsorbidas.map((l) => l.nombre).join(', ');
          console.log(
            `[reparar-duplicados] ${reparacion.tracksTocados} tracks reapuntados` +
              (fusionados ? ` — modos fusionados: ${fusionados}` : '') +
              (absorbidas ? ` — listas absorbidas por Favoritas: ${absorbidas}` : '')
          );
        }
      } catch (e) {
        // Que no arranque el servidor por una reparación cosmética sería peor
        // que el duplicado que viene a arreglar.
        console.error('[reparar-duplicados] no se pudo reparar:', e);
      }

      // Mismo criterio que arriba: nombrarModo (descubrir-modos.mjs) ahora
      // pone mayúscula en cada palabra de un modo sin curar, no solo en la
      // primera de toda la frase ("Festival Progressive House" en vez de
      // "Festival progressive house") — pero un modo YA CREADO con el
      // nombre viejo no se corrige solo, porque el re-descubrimiento normal
      // no revisa nombres de modos existentes. Idempotente, sin marca de
      // "ya corrí esto" por el mismo motivo que reparar-duplicados.
      try {
        const fuentesActuales = cargarFuentes(dataDir);
        if (fuentesActuales) {
          const ejesPath = join(dataDir, 'ejes.json');
          const ejesData = JSON.parse(readFileSync(ejesPath, 'utf8'));
          const { corregidos } = corregirNombresModos(ejesData, fuentesActuales.vocabulario?.nombresHumanos);
          if (corregidos > 0) {
            escribirAtomico(ejesPath, ejesData);
            console.log(`[corregir-nombres-modos] ${corregidos} nombres de modo re-capitalizados`);
          }
        }
      } catch (e) {
        console.error('[corregir-nombres-modos] no se pudo corregir:', e);
      }

      // Enriquecimiento automático (spec
      // 2026-09-08-enriquecimiento-automatico-design.md): si la app se cerró
      // a mitad de un ciclo (corte de luz, se cerró la ventana), retoma solo
      // 15s después de que el servidor esté listo — tiempo de sobra para que
      // termine de arrancar sin competirle a la primera carga de la UI. El
      // propio dispararEnriquecimiento no hace nada si no queda nada
      // pendiente (cada core module chequea sus pendientes primero).
      //
      // `configureServer` vuelve a correr cada vez que Vite reinicia el dev
      // server en caliente (guardar este archivo, o cualquier módulo que
      // importe estáticamente — incluido scripts/lib/enriquecimiento-automatico.mjs
      // — reinicia el proceso de config y le da una instancia NUEVA a ese
      // módulo, con jobActivo en false otra vez). Sin limpiar el timer, uno
      // viejo de una instancia anterior puede disparar más tarde contra un
      // módulo huérfano que no sabe del nuevo ciclo ya en curso — dos
      // corridas reales, sin dedupe entre sí, pisándose al escribir
      // biblioteca.json/ejes.json. `once('close', ...)` cancela el timer
      // cuando ESTE server se cierra (reinicio o apagado real).
      const idTimerResume = setTimeout(() => {
        dispararEnriquecimiento(dataDir, { contacto: env.MUSICBRAINZ_CONTACT, tokenGenius: env.GENIUS_ACCESS_TOKEN, onCambioEstado: difundirEnriquecimiento });
      }, 15000);
      server.httpServer?.once('close', () => clearTimeout(idTimerResume));
    },
  };
}

// Tope de tamaño de body — el más grande legítimo es el CSV de
// importar-tunemymusic (texto). 50MB cubre una biblioteca enorme con
// margen; sin este tope, un archivo elegido por error (o con contenido
// malformado) se acumula entero en memoria antes de que nada lo rechace.
const TAMANO_MAX_BODY = 50 * 1024 * 1024;

// Guardrail simple para /api/importar-local: no se espera llegar cerca de
// esto en uso real (sería una biblioteca de mp3 gigantesca), es solo
// protección contra un request malformado o corrupto.
const LIMITE_RUTAS_IMPORTAR_LOCAL = 20000;

function leerCuerpo(req, { crudo = false } = {}) {
  return new Promise((resolve, reject) => {
    // Acumular Buffers y decodificar al final. Concatenar como string decodifica
    // cada chunk por separado, y un carácter multibyte partido entre dos chunks
    // (los nombres de eje llevan acentos) queda corrupto de forma permanente.
    const trozos = [];
    let total = 0;
    let excedido = false;
    req.on('data', (c) => {
      if (excedido) return;
      total += c.length;
      if (total > TAMANO_MAX_BODY) {
        excedido = true;
        const e = new Error('body_demasiado_grande');
        e.code = 'body_demasiado_grande';
        reject(e);
        req.destroy();
        return;
      }
      trozos.push(c);
    });
    req.on('end', () => {
      if (excedido) return;
      try {
        if (crudo) return resolve(Buffer.concat(trozos));
        resolve(JSON.parse(Buffer.concat(trozos).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Texto para embeber un transversal ({id, nombre, afines}, de
 * fuentes.transversales) — variante de textoDeEje (clasificar-embeddings.mjs)
 * para una forma de objeto distinta: los transversales no tienen `anclas` ni
 * `tagsLastfm` como un eje real de ejes.json, solo `afines` (términos de
 * género libres, ver spec 4.3 "Cómo se llenan los transversales"). Mismo
 * formato de salida (nombre + géneros) para que el resultado sea comparable
 * con los embeddings de tracks (textoDeTrack) bajo el mismo UMBRAL_SCORE.
 */
function textoDeTransversal(transversal) {
  const partes = [`${transversal.nombre}.`];
  if (transversal.afines?.length) partes.push(`Géneros: ${transversal.afines.join(', ')}.`);
  return partes.join(' ');
}

/**
 * Para cada transversal declarado en fuentes.transversales, calcula qué
 * tracks de la biblioteca tendría SI se activara — sin escribir nada. Corre
 * la propagación por embeddings de la descripción del transversal
 * (textoDeTransversal) contra el índice de vectores ya persistido (poblado
 * por descubrirModos -> asegurarVectores, que corre antes en el mismo
 * request), con el mismo UMBRAL_SCORE que usa clasificarPorEmbeddings.
 *
 * A diferencia de clasificarPorEmbeddings (que elige un único eje ganador
 * entre ejes que compiten, con MARGEN_MINIMO), acá cada transversal se
 * evalúa de forma independiente: un track puede superar el umbral de varios
 * transversales a la vez, por diseño (spec: "un track puede pertenecer a
 * varios modos"; los transversales cruzan a los descubiertos). Usado por
 * POST /api/descubrir-modos.
 */
async function calcularTransversalesDisponibles(dataDir, tracks, transversales) {
  if (!transversales?.length) return [];
  const indice = cargarIndice(dataDir);
  const embTransversales = [];
  for (const transversal of transversales) {
    const emb = await embeber(textoDeTransversal(transversal));
    embTransversales.push({ id: transversal.id, nombre: transversal.nombre, emb });
  }
  const trackIdsPorTransversal = new Map(embTransversales.map((t) => [t.id, []]));
  for (const track of tracks) {
    const vector = vectorDe(dataDir, track.id, indice);
    if (!vector) continue;
    for (const t of embTransversales) {
      if (similitudCoseno(vector, t.emb) >= UMBRAL_SCORE) {
        trackIdsPorTransversal.get(t.id).push(track.id);
      }
    }
  }
  return embTransversales.map((t) => ({ id: t.id, nombre: t.nombre, trackIds: trackIdsPorTransversal.get(t.id) }));
}

/**
 * Valida la forma de ejes.json antes de persistirlo. Devuelve un mensaje de error
 * o null si está bien.
 *
 * Sin esto, cualquier body válido como JSON llega a disco: `{}`, `[]` o `null` dejan
 * la app en pantalla blanca, recuperable solo editando el archivo a mano.
 */
function validarEjes(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return 'El cuerpo debe ser un objeto.';
  }
  if (!Array.isArray(cuerpo.ejes)) return 'Falta el array "ejes".';
  if (cuerpo.ejes.length === 0) return 'No puede quedar ningún eje.';

  const vistos = new Set();
  for (const e of cuerpo.ejes) {
    if (!e || typeof e !== 'object') return 'Hay un eje que no es un objeto.';
    if (typeof e.id !== 'string' || !e.id.trim()) return 'Hay un eje sin id válido.';
    if (vistos.has(e.id)) return `Id duplicado: "${e.id}".`;
    vistos.add(e.id);

    const anclas = e.anclas;
    if (!anclas || !Array.isArray(anclas.artistas) || !Array.isArray(anclas.titulos)) {
      return `El eje "${e.id}" no tiene anclas.artistas / anclas.titulos.`;
    }
    // Un ancla vacía es catastrófica y silenciosa: "lo que sea".includes("") es
    // true, así que ese eje se tragaría los 2179 tracks en la próxima importación.
    if ([...anclas.artistas, ...anclas.titulos].some((a) => typeof a !== 'string' || !a.trim())) {
      return `El eje "${e.id}" tiene un ancla vacía.`;
    }
  }

  const sistema = cuerpo.ejes.find((e) => e.id === 'sin-clasificar');
  if (!sistema) return 'No se puede eliminar el eje de sistema "sin-clasificar".';
  if (sistema.sistema !== true) return 'El eje "sin-clasificar" debe tener sistema: true.';

  // Un padre inexistente deja al hijo inalcanzable: no se muestra como tarjeta
  // (tiene padre) ni como sub-eje (el padre no está).
  for (const e of cuerpo.ejes) {
    if (e.padre && !vistos.has(e.padre)) {
      return `El eje "${e.id}" apunta a un padre inexistente ("${e.padre}").`;
    }
  }
  return null;
}

/**
 * De qué commit salió lo que se está ejecutando, para mostrarlo en "Acerca de".
 *
 * Tres orígenes, en este orden:
 *  1. git, si estamos parados dentro del repo — o sea, en desarrollo.
 *  2. version-build.json — lo escribe scripts/sellar-version.mjs al empaquetar.
 *     Es el ÚNICO que sirve en la app instalada: ahí este archivo se ejecuta
 *     dentro de la carpeta de instalación, donde no hay repositorio ni git,
 *     así que el paso 1 falla y cae acá solo.
 *  3. desconocido, si no hay ninguno de los dos. Nunca tira: un sello ausente
 *     no puede ser motivo de que la app no arranque.
 *
 * git va PRIMERO a propósito, aunque el archivo sea más barato de leer:
 * version-build.json queda en el disco después de cada empaquetado (está
 * gitignorado, nadie lo borra), así que si tuviera prioridad, al volver a
 * desarrollo mostraría para siempre el commit del último paquete en vez del
 * que uno tiene abierto — un sello que miente es peor que no tenerlo. El
 * costo es un par de spawns de git al arrancar; en la app instalada fallan de
 * inmediato (no hay repo) y ahí igual manda el archivo.
 */
function sellarVersion() {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trimEnd();
  try {
    return {
      commit: git(['rev-parse', '--short', 'HEAD']),
      sucio: git(['status', '--porcelain']).length > 0,
      fecha: null,
      dev: true,
    };
  } catch {}
  try {
    return { ...JSON.parse(readFileSync(join(process.cwd(), 'version-build.json'), 'utf8')), dev: false };
  } catch {}
  return { commit: 'desconocido', sucio: false, fecha: null, dev: false };
}


// album/anio/portada/foto por track, combinando MusicBrainz, Spotify y Deezer
// (ver GET /api/metadata). También lo usa el build móvil, que lo lleva dentro.
function combinarMetadata(dataDir) {
  const mbPath = join(dataDir, 'metadata-musicbrainz.json');
  const spPath = join(dataDir, 'metadata-spotify.json');
  const dzPath = join(dataDir, 'metadata-deezer.json');
  const mb = existsSync(mbPath)
    ? JSON.parse(readFileSync(mbPath, 'utf8'))
    : { tracks: {}, artistas: {} };
  const sp = existsSync(spPath) ? JSON.parse(readFileSync(spPath, 'utf8')) : { tracks: {} };
  const dz = existsSync(dzPath) ? JSON.parse(readFileSync(dzPath, 'utf8')) : { tracks: {} };

  const idsTodos = new Set([
    ...Object.keys(mb.tracks ?? {}),
    ...Object.keys(sp.tracks ?? {}),
    ...Object.keys(dz.tracks ?? {}),
  ]);
  const tracks = {};
  for (const id of idsTodos) {
    const mbDatos = mb.tracks?.[id];
    const spDatos = sp.tracks?.[id];
    const dzDatos = dz.tracks?.[id];
    tracks[id] = {
      // Spotify ANTES que MusicBrainz para álbum y año, a propósito.
      // MusicBrainz devuelve el *lanzamiento* donde apareció la
      // grabación, que para muchos tracks es un recopilatorio o una
      // sesión de radio, no el disco de estudio: "Rehab" figura en
      // "100x Zomer 2010" (recopilatorio holandés), "Las de la
      // intuición" en "Los Número Uno 40", y dos temas de Adele en
      // bootlegs fechados ("2011-04-08: Paradiso FM, Amsterdam").
      // Esos nombres no existen en el catálogo de Deezer, así que
      // /api/album no encontraba nada y el álbum no abría — medido
      // contra la API real: 5 de 6 títulos de MusicBrainz sin
      // resultado, 6 de 6 de Spotify con resultado. De 628 tracks
      // con álbum en ambas fuentes, 497 difieren (79%).
      //
      // El orden anterior (MusicBrainz primero) venía de suponer que
      // MusicBrainz no traía álbum y que siempre caería a Spotify —
      // falso: lo trae para 663 tracks, y son justamente los malos.
      // Para el año vale lo mismo, y el comentario de acá arriba ya
      // decía que Spotify es "más confiable" en eso.
      album: spDatos?.album ?? mbDatos?.album ?? dzDatos?.album ?? null,
      anio: spDatos?.anio ?? mbDatos?.anio ?? dzDatos?.anio ?? null,
      duracionMs: mbDatos?.duracionMs ?? spDatos?.duracionMs ?? dzDatos?.duracionMs ?? null,
      artistaMbid: mbDatos?.artistaMbid ?? null,
      coverUrl: spDatos?.coverUrl ?? dzDatos?.coverUrl ?? null,
      fotoArtista: dzDatos?.fotoArtista ?? null,
    };
  }
  return { tracks, artistas: mb.artistas ?? {} };
}

// Géneros por canción tal como los usa el descubrimiento de modos del PC
// (armarEvidenciaPorTrack). El organizador del móvil los reutiliza: sin esto
// tendría que volver a preguntar a MusicBrainz (1 petición/s) por canciones
// que el PC ya resolvió. Van todas, también las de `generos: []`, para que el
// móvil sepa que el PC ya las consultó.
// Es solo un extra: si algo falla aquí (JSON corrupto...) no debe tumbar la
// sincronización ni el build móvil, así que se devuelve {} con un aviso.
function evidenciaParaMovil(dataDir, tracks) {
  try {
    const fuentes = cargarFuentes(dataDir);
    if (!fuentes) {
      console.warn('[movil] fuentes.json falta o no es válido: la evidencia de géneros no viaja al móvil');
      return {};
    }
    return Object.fromEntries(armarEvidenciaPorTrack(dataDir, tracks, fuentes));
  } catch (e) {
    console.warn(`[movil] no se pudo armar la evidencia de géneros (${e?.message ?? e}): no viaja al móvil`);
    return {};
  }
}

// Build móvil (Android): la app lleva DENTRO la biblioteca real del usuario,
// no la de ejemplo versionada en data/. Los imports estáticos de
// data/{biblioteca,ejes,cache-youtube}.json se redirigen a la carpeta de datos
// del escritorio (MUSICSIPPI_DATA_DIR, o %APPDATA%/Musicsippi/data). Si no
// existe, se queda la de ejemplo.
function datosDelUsuarioEnBuildMovil(mode) {
  const dir = process.env.MUSICSIPPI_DATA_DIR || (process.env.APPDATA ? join(process.env.APPDATA, 'Musicsippi', 'data') : null);
  const activo = mode === 'movil' && dir && existsSync(join(dir, 'biblioteca.json'));
  if (activo) console.log(`[movil] datos del usuario desde ${dir}`);
  return {
    name: 'datos-usuario-movil',
    enforce: 'pre',
    resolveId(fuente) {
      // Portadas/álbum/año (lo mismo que sirve /api/metadata en escritorio).
      if (fuente === 'virtual:metadata-movil') return '\0metadata-movil';
      if (fuente === 'virtual:evidencia-movil') return '\0evidencia-movil';
      if (!activo) return null;
      const m = /(?:^|[\\/])data[\\/](biblioteca|ejes|cache-youtube|favoritos)\.json$/.exec(fuente);
      if (!m) return null;
      const destino = join(dir, `${m[1]}.json`);
      return existsSync(destino) ? destino : null;
    },
    load(id) {
      if (id === '\0metadata-movil') {
        const datos = activo ? combinarMetadata(dir) : { tracks: {}, artistas: {} };
        return `export default ${JSON.stringify(datos)};`;
      }
      if (id === '\0evidencia-movil') {
        const tracks = activo ? JSON.parse(readFileSync(join(dir, 'biblioteca.json'), 'utf8')).tracks : [];
        return `export default ${JSON.stringify(activo ? evidenciaParaMovil(dir, tracks) : {})};`;
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  // El tercer argumento vacio carga TODAS las variables, no solo las VITE_*.
  // YOUTUBE_API_KEY no lleva ese prefijo a proposito: solo la usa el servidor,
  // asi nunca puede filtrarse al bundle del navegador.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [datosDelUsuarioEnBuildMovil(mode), react(), apiLocal(env)],
    define: {
      __SELLO_VERSION__: JSON.stringify(sellarVersion()),
    },
    // Workers como módulos ES: el del organizador hace import() dinámicos
    // (transformers y el runtime WASM); el formato por defecto (iife) no admite
    // code-splitting y el build falla.
    worker: { format: 'es' },
    // host:true = escucha en todas las interfaces de red, no solo
    // localhost — necesario para abrir la app desde el celular por WiFi de
    // casa o por Tailscale. El filtro real de quién puede modificar datos
    // sigue siendo origenPermitido() arriba, no esto.
    //
    // strictPort:true = falla en vez de saltar a otro puerto en silencio.
    // Sin esto, si algo más ocupa el 5173 (la app de escritorio empaquetada,
    // por ejemplo — arranca su propio server en un puerto libre cualquiera),
    // `npm run dev` termina en 5174 sin avisar. Como localStorage (historial,
    // favoritos, sesión) está atado al puerto además del host, ese corrimiento
    // silencioso deja a la PWA instalada en el celular apuntando a un origen
    // con memoria vacía.
    server: {
      port: 5173,
      strictPort: true,
      host: true,
      // data/ son DATOS, no código: que Vite deje de vigilarlos.
      //
      // src/App.jsx importa `../data/ejes.json` y `../data/biblioteca.json`
      // de forma estática (es el estado inicial de React), así que esos dos
      // archivos entran al grafo de módulos y Vite los vigila. Cada escritura
      // del backend (marcar me gusta, agregar a una lista, corregir datos, o
      // el enriquecimiento en background) invalidaba ese módulo y disparaba
      // un hot-update de App.jsx: React remontaba el árbol entero, el player
      // de YouTube se destruía y se volvía a crear, y LA CANCIÓN QUE SONABA
      // VOLVÍA A EMPEZAR. Verificado en el navegador: al marcar un corazón
      // aparecía "[vite] hot updated: /src/App.jsx", el iframe se
      // reemplazaba por otro y el tiempo saltaba de 1:04 a 0:12.
      //
      // Nada se pierde: la UI ya se actualiza con la respuesta de cada
      // endpoint, y GET /api/biblioteca-fresca cubre los cambios que vienen
      // de afuera (ver el efecto que corre al terminar el enriquecimiento).
      //
      // Es una función y no un glob a propósito: `**/data/**` también taparía
      // src/data/, que sí es código.
      watch: { ignored: esDelDataDir },
    },
  };
});
