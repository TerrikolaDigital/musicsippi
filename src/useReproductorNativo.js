import { useEffect, useRef, useState, useCallback } from 'react';
import { registerPlugin } from '@capacitor/core';
import { resolverAudio, crearFetchNativo, olvidarAudio } from './data/audio-nativo.js';
import { gananciaNivelada, leerNivelar, EVENTO as EVENTO_NIVELAR } from './data/nivelar-volumen.js';
import { leerFundido, leerSinFundidoAlbumes, EVENTO_FUNDIDO } from './data/fundido.js';
import { esIdLocal, resolverFuenteReproduccion, trackIdDeIdLocal } from './data/reproduccion-locales.js';
import { comandoCaducado, planAdopcion, crearCoalescedor, pendientesParaNativo, destinoMetadata } from './data/sincronizar-nativo.js';
import { ordenarPendientesNativos } from './movil/saltos.js';
import { crearDiagnostico, crearVigilanteArranque, esFalloDelReproductor } from './data/arranque-nativo.js';

/**
 * Reproductor para la app Android (Capacitor). Misma interfaz que useYouTube
 * (src/useYouTube.js) para que App.jsx no se entere de la diferencia: en vez
 * del iframe de YouTube —que Android congela al bloquear la pantalla— el
 * audio lo reproduce un servicio foreground nativo (Media3/ExoPlayer, ver
 * android/app/src/main/java/com/terrikola/musicsippi/reproductor/).
 *
 * Flujo de una pista: resolverAudio(videoId) -> {url, headers} (youtubei.js
 * por HTTP nativo) -> ReproductorNativo.cargar(). Si el servidor responde
 * 403/410 (URL caducada) el servicio avisa con un error recuperable y aquí se
 * vuelve a resolver y se reanuda en la misma posición.
 */

const ReproductorNativo = registerPlugin('ReproductorNativo');

const CLAVE_VOLUMEN = 'volumenReproductor';
const VOLUMEN_POR_DEFECTO = 50;
const MAX_RECUPERACIONES = 2;
const MAX_REINTENTOS_RESOLUCION = 2;
// Como BitChord: tras 4 canciones seguidas que no llegan a sonar el problema es
// la red (o YouTube), no las canciones; se para en vez de vaciar la cola.
const MAX_SALTOS_SEGUIDOS = 4;

// Mismas reglas que useYouTube: Number(null) es 0, así que "nunca se guardó
// nada" se distingue explícitamente.
function leerVolumenGuardado() {
  try {
    const crudo = localStorage.getItem(CLAVE_VOLUMEN);
    if (crudo === null) return VOLUMEN_POR_DEFECTO;
    const v = Number(crudo);
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : VOLUMEN_POR_DEFECTO;
  } catch {
    return VOLUMEN_POR_DEFECTO;
  }
}

function guardarVolumen(v) {
  try {
    localStorage.setItem(CLAVE_VOLUMEN, String(v));
  } catch {
    // no crítico
  }
}

// fetch HTTP nativo, creado una sola vez.
let promesaFetch = null;
function obtenerFetch() {
  promesaFetch ??= Promise.resolve(crearFetchNativo());
  return promesaFetch;
}

// Fuente de una pista: su archivo local en este móvil (id «local:<trackId>») o el audio de
// YouTube. Una pista de YouTube no vuelve a mirar el archivo local: si se llegó aquí es porque
// el local ya falló y App decidió seguir con YouTube.
function resolverFuente(id, { trackId, forzar, fetch }) {
  return esIdLocal(id)
    ? resolverFuenteReproduccion({ trackId: trackIdDeIdLocal(id), forzar, fetch })
    : resolverFuenteReproduccion({ trackId, videoId: id, usarLocal: false, forzar, fetch, resolver: resolverAudio });
}

// ---- Puente con App.jsx ---------------------------------------------------
// App.jsx ya publica título/artista/carátula y recibe comandos de "siguiente /
// anterior / play-pausa" a través de window.musicsippi (lo expone Electron).
// En Android se expone la misma superficie mínima: así la notificación recibe
// los metadatos y los botones del sistema llegan a App.jsx sin tocarlo.
const metaActual = { titulo: '', artista: '', subtitulo: '', portadaUrl: null, trackId: null, clave: '' };
// La pista que JS sabe que tiene (o va a tener) el nativo: la metadata solo se le da a ella. La fija
// el hook (reproducir, transición, adopción) con fijarPistaNativa().
const pistaNativa = { id: null, trackId: null };
let ultimaEnviada = ''; // `${id}|${clave}` de lo último mandado al nativo
const oyentesComando = new Set();
let puenteInstalado = false;

/** Metadata de App para la pista `id` del nativo, o null si App describe otra canción. */
function metaPara(id, trackId) {
  return destinoMetadata({ trackIdMeta: metaActual.trackId, idNativo: id, trackIdNativo: trackId }) === id ? metaActual : null;
}

function enviarMetadata() {
  const id = destinoMetadata({ trackIdMeta: metaActual.trackId, idNativo: pistaNativa.id, trackIdNativo: pistaNativa.trackId });
  if (!id || !metaActual.clave) return; // App aún no describe la pista del nativo: se manda al cambiar
  const firma = `${id}|${metaActual.clave}`;
  if (firma === ultimaEnviada) return;
  ultimaEnviada = firma;
  ReproductorNativo.actualizarMetadata({
    id,
    titulo: metaActual.titulo,
    artista: metaActual.artista,
    album: metaActual.subtitulo,
    portadaUrl: metaActual.portadaUrl,
  }).catch(() => {});
}

function fijarPistaNativa(id, trackId) {
  if (pistaNativa.id === id && pistaNativa.trackId === trackId) return;
  Object.assign(pistaNativa, { id, trackId });
  enviarMetadata();
}

function instalarPuente() {
  if (puenteInstalado || typeof window === 'undefined' || window.musicsippi) return;
  puenteInstalado = true;
  window.musicsippi = {
    publicarEstado(estado) {
      if (!estado?.hayTrack) return;
      const portadaUrl = typeof estado.cover === 'string' && estado.cover.startsWith('http') ? estado.cover : null;
      const subtitulo = `Sonando desde · ${estado.modo?.nombre ?? 'tu biblioteca'}`;
      const favorito = Boolean(estado.favorito);
      const aleatorio = Boolean(estado.aleatorio);
      const trackId = estado.trackId ?? null;
      const clave = `${trackId}|${estado.titulo}|${estado.artista}|${subtitulo}|${portadaUrl}|${favorito}|${aleatorio}`;
      if (clave === metaActual.clave) return; // `sonando` también dispara esto
      Object.assign(metaActual, { titulo: estado.titulo, artista: estado.artista, subtitulo, portadaUrl, trackId, clave });
      enviarMetadata();
      ReproductorNativo.configurarAcciones({ favorito, aleatorio }).catch(() => {});
    },
    alRecibirComando(callback) {
      oyentesComando.add(callback);
      return () => oyentesComando.delete(callback);
    },
  };
  ReproductorNativo.addListener('comando', ({ accion, ts }) => {
    // Un ⏭/⏮ pulsado con el WebView congelado llega al desbloquear: ya no es actual.
    if (comandoCaducado(accion, ts)) return;
    oyentesComando.forEach((cb) => cb(accion));
  });
}

// Cuántas canciones por delante se mantienen ya resueltas en la cola nativa, y
// cuántas se resuelven a la vez (youtubei.js no necesita más para 3 pistas).
const MAX_SIGUIENTES = 3;
const CONCURRENCIA_PRECARGA = 2;
const MAX_ANTERIORES = 1;

// Espera para agrupar las transiciones atrasadas que llegan en ráfaga al despertar el WebView.
const ESPERA_TRANSICIONES_MS = 300;
const SENAL_INICIAL = { activo: false, esperando: false, idInterrumpida: null };
// Espera antes de reintentar una orden que el servicio no aceptó (el plugin ya rehízo la conexión).
const ESPERA_REINTENTO_NATIVO_MS = 1500;

const diagnostico = crearDiagnostico({ entorno: () => globalThis.navigator?.userAgent ?? '' });
/** Rastro de lo último que intentó el reproductor, para copiarlo desde el aviso de fallo. */
export const informeDiagnostico = () => diagnostico.informe();

export function useReproductorNativo(alTerminar, alFallarVideo, alAvanzarNativo, alSaltoNativo) {
  const contenedorRef = useRef(null); // sin uso: no hay iframe. App.jsx lo monta igual.
  const alTerminarRef = useRef(alTerminar);
  const alFallarVideoRef = useRef(alFallarVideo);
  const alAvanzarNativoRef = useRef(alAvanzarNativo);
  const alSaltoNativoRef = useRef(alSaltoNativo);
  const senalDebilRef = useRef(SENAL_INICIAL);
  const trackIdRespaldoRef = useRef(new Map()); // videoId de respaldo -> trackId (para mostrar lo que suena)
  const cargandoRef = useRef(0); // token de la cargarPista en vuelo (0 = ninguna)
  const anticipadaRef = useRef(null); // {lista, actualId}: lo que sigue, antes de resolverlo
  const precargaRef = useRef(null); // última petición {lista, actualId}
  const tokenPrecargaRef = useRef(0);
  const videoActualRef = useRef(null);
  const trackIdPorIdRef = useRef(new Map()); // id de la cola nativa -> trackId (para el archivo local y las copias pendientes)
  const tokenRef = useRef(0); // invalida cargas en vuelo al cambiar de pista
  const recuperacionesRef = useRef(0);
  const saltosSeguidosRef = useRef(0);
  const sonoRef = useRef(null); // videoId que llegó a sonar (no se salta: se reintenta)
  const posicionMsRef = useRef(0);
  const sonandoRef = useRef(false);
  const estadoRef = useRef('pausado');
  const volumenRef = useRef(leerVolumenGuardado());
  const volumenAnteriorRef = useRef(leerVolumenGuardado() || 100);
  const peticionRef = useRef(0); // cuándo pidió el usuario por última vez una pista (reproducir/recrear)
  const nativoVivoRef = useRef(false); // al abrir, el nativo ya tenía una pista y se adoptó (no se restaura encima)
  const esperaSyncRef = useRef(null); // promesa de la primera sincronización con el nativo
  const reproducirRef = useRef(null);
  const pedidoRef = useRef(null); // último id pedido: es el que reintenta ▶ tras un fallo
  const arranqueRef = useRef(null); // null | {fase:'cargando'} | {fase:'fallo', motivo}
  // trackId de un id de la cola nativa: lo registra quien lo pide; los locales lo llevan dentro.
  const trackIdDe = useCallback(
    (id) => trackIdPorIdRef.current.get(id) ?? (id && esIdLocal(id) ? trackIdDeIdLocal(id) : null),
    []
  );
  // Única puerta para cambiar la pista actual del lado JS: así la metadata va siempre con su pista.
  const marcarActual = useCallback(
    (id) => {
      videoActualRef.current = id;
      if (id) fijarPistaNativa(id, trackIdDe(id));
    },
    [trackIdDe]
  );

  const [listo, setListo] = useState(false);
  const [sonando, setSonando] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [volumen, setVolumenState] = useState(() => leerVolumenGuardado());
  const [temporizador, setTemporizador] = useState(null); // {finMs?, alFinal}
  const servicioCerradoRef = useRef(false); // el nativo se cerró solo tras una pausa larga
  const [senalDebil, setSenalDebilState] = useState(SENAL_INICIAL);
  const [arranque, setArranque] = useState(null);
  const vigilanteRef = useRef(null);
  vigilanteRef.current ??= crearVigilanteArranque({
    alCambiar: (e) => {
      arranqueRef.current = e;
      setArranque(e);
      if (e?.fase === 'fallo') diagnostico.anotar('sin arrancar', e.motivo);
    },
  });
  // Guardada que suena por falta de señal {videoId, trackId}: no está en la cola, pero es lo que hay que mostrar.
  const [pistaRespaldo, setPistaRespaldoState] = useState(null);
  const pistaRespaldoRef = useRef(null);
  const setPistaRespaldo = useCallback((p) => {
    pistaRespaldoRef.current = p?.videoId ?? null;
    setPistaRespaldoState(p);
  }, []);

  const fijarSenalDebil = useCallback((v) => {
    const nuevo = v ? { activo: !!v.activo, esperando: !!v.esperando, idInterrumpida: v.idInterrumpida ?? null } : SENAL_INICIAL;
    senalDebilRef.current = nuevo;
    setSenalDebilState(nuevo);
    if (!nuevo.activo || nuevo.esperando) setPistaRespaldo(null);
  }, [setPistaRespaldo]);

  // Suena una guardada del modo sin señal. videoActualRef sigue siendo la interrumpida a propósito: así el
  // reproducir(interrumpida) que dispare App es un no-op y no se pisa al nativo, que vuelve a ella solo.
  const anotarRespaldo = useCallback((videoId) => {
    setPistaRespaldo({ videoId, trackId: trackIdRespaldoRef.current.get(videoId) ?? null });
  }, [setPistaRespaldo]);

  useEffect(() => {
    alTerminarRef.current = alTerminar;
  }, [alTerminar]);
  useEffect(() => {
    alFallarVideoRef.current = alFallarVideo;
  }, [alFallarVideo]);
  useEffect(() => {
    alAvanzarNativoRef.current = alAvanzarNativo;
  }, [alAvanzarNativo]);
  useEffect(() => {
    alSaltoNativoRef.current = alSaltoNativo;
  }, [alSaltoNativo]);

  // Entrega al nativo lo que sigue sin resolver nada: bloquear la pantalla justo tras elegir una canción
  // duerme el WebView, y sin esto el servicio se queda sin siguiente. Espera a cargar(), que las borra.
  const enviarAnticipada = useCallback(() => {
    const pedido = anticipadaRef.current;
    if (!pedido || cargandoRef.current || pedido.actualId !== videoActualRef.current) return;
    ReproductorNativo.fijarPendientes({
      actualId: pedido.actualId,
      pendientes: pendientesParaNativo(pedido.lista, esIdLocal),
    }).catch((e) => console.warn('[audio-nativo] fijarPendientes', e?.message ?? e));
  }, []);

  const anticiparCola = useCallback(
    (lista, actualVideoId) => {
      anticipadaRef.current = { lista, actualId: actualVideoId };
      enviarAnticipada();
    },
    [enviarAnticipada]
  );

  /**
   * Resuelve las siguientes pistas y se las entrega a la cola nativa. Se
   * difiere mientras haya una carga en vuelo (cargar() vacía la cola) y se
   * repite al terminarla; un token descarta resultados de peticiones viejas.
   */
  const ejecutarPrecarga = useCallback(async () => {
    const pedido = precargaRef.current;
    if (!pedido || cargandoRef.current) return;
    // La pista actual aún no es la que el llamador cree: lo reintentará la
    // carga en curso o el próximo cambio.
    if (pedido.actualId && pedido.actualId !== videoActualRef.current) return;
    const token = ++tokenPrecargaRef.current;
    const tokenCarga = tokenRef.current;
    const lista = pedido.lista.slice(0, MAX_SIGUIENTES);
    // La anterior de la cola de JS también se deja resuelta en el nativo (⏮ sin WebView). Va tras las
    // siguientes en el reparto de trabajo, que son las que urgen.
    const previas = (pedido.anteriores ?? []).slice(-MAX_ANTERIORES);
    const trabajo = [...lista, ...previas];
    // Registra el trackId de todas: el nativo puede pasar solo a cualquiera (también a las pendientes).
    for (const p of [...pedido.lista, ...(pedido.anteriores ?? [])]) {
      if (p.trackId) trackIdPorIdRef.current.set(p.videoId, p.trackId);
    }
    // Si la lista anticipada ya llega más lejos que este pedido, no se pisa con una más corta.
    const anticipada = anticipadaRef.current;
    const base =
      anticipada?.actualId === pedido.actualId && anticipada.lista.length > pedido.lista.length
        ? anticipada.lista
        : pedido.lista;
    const enItems = new Set(lista.map((p) => p.videoId));
    const pendientes = pendientesParaNativo(base.filter((p) => !enItems.has(p.videoId)), esIdLocal);
    const resueltos = new Array(trabajo.length).fill(null);
    let siguiente = 0;
    const fetchNativo = await obtenerFetch();
    const trabajador = async () => {
      while (siguiente < trabajo.length) {
        const i = siguiente++;
        if (token !== tokenPrecargaRef.current) return;
        try {
          if (trabajo[i].trackId) trackIdPorIdRef.current.set(trabajo[i].videoId, trabajo[i].trackId);
          const audio = await resolverFuente(trabajo[i].videoId, { trackId: trabajo[i].trackId, fetch: fetchNativo });
          resueltos[i] = { audio, pista: trabajo[i] };
        } catch (e) {
          // Si no se puede resolver se omite: JS la reintentará (o la saltará)
          // cuando le toque, con su flujo normal de fallos.
          console.warn('[audio-nativo] precarga omitida', trabajo[i].videoId, e?.message ?? e);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA_PRECARGA, trabajo.length) }, trabajador));
    if (token !== tokenPrecargaRef.current || tokenCarga !== tokenRef.current) return;
    const aItem = ({ audio, pista }) => ({
      id: pista.videoId,
      url: audio.url,
      headers: audio.headers,
      titulo: pista.titulo ?? '',
      artista: pista.artista ?? '',
      album: metaActual.subtitulo, // «Sonando desde · …»: el mismo origen que la actual
      portadaUrl: pista.portadaUrl ?? null,
      duracionMs: Math.round((audio.duracion ?? 0) * 1000),
      gananciaDb: gananciaNivelada(audio.loudnessDb),
      encadenada: !!pista.encadenada, // mismo álbum que la anterior: sin fundido si «Sin fundido en álbumes»
    });
    try {
      await ReproductorNativo.encolarSiguientes({
        actualId: pedido.actualId ?? videoActualRef.current,
        pendientes,
        items: resueltos.slice(0, lista.length).filter(Boolean).map(aItem),
        // Solo si el llamador las indicó (aunque sea vacío: entonces el nativo olvida su historial).
        ...(pedido.anteriores ? { anteriores: resueltos.slice(lista.length).filter(Boolean).map(aItem) } : {}),
        // Música guardada que el nativo reproduce si se pierde la señal.
        ...(pedido.respaldo
          ? {
              respaldo: pedido.respaldo.map((p) => ({
                id: p.videoId,
                titulo: p.titulo ?? '',
                artista: p.artista ?? '',
                portadaUrl: p.portadaUrl ?? null,
              })),
            }
          : {}),
      });
    } catch (e) {
      console.warn('[audio-nativo] encolarSiguientes', e?.message ?? e);
    }
  }, []);

  /**
   * lista = [{videoId, titulo, artista, portadaUrl}] con las pistas que vienen
   * después de la actual, en orden. `actualVideoId` (opcional) es la pista tras
   * la que van: si ya no es la actual, la petición se descarta.
   */
  const precargarSiguientes = useCallback(
    (lista, actualVideoId, anteriores, respaldo) => {
      // `anteriores` (opcional, de la mas lejana a la mas cercana): van ANTES de la actual; el nativo las
      // conserva para que el boton anterior funcione con el WebView dormido.
      // `respaldo` (opcional): [{videoId, trackId, titulo, artista, portadaUrl}] guardadas en el móvil para
      // cuando falle la señal.
      if (respaldo) for (const p of respaldo) if (p.trackId) trackIdRespaldoRef.current.set(p.videoId, p.trackId);
      precargaRef.current = {
        lista: lista ?? [],
        actualId: actualVideoId ?? null,
        anteriores: anteriores ?? null,
        respaldo: respaldo ?? null,
      };
      ejecutarPrecarga();
    },
    [ejecutarPrecarga]
  );

  const fallar = useCallback((videoId, codigo, detalle) => {
    console.warn('[audio-nativo] fallo', codigo, videoId, detalle ?? '');
    diagnostico.anotar('fallo', `${codigo} ${videoId} ${detalle ?? ''}`);
    // El reproductor del móvil no responde: la canción no tiene la culpa y saltar fallaría igual.
    if (esFalloDelReproductor(codigo)) {
      vigilanteRef.current.fallo(codigo);
      return;
    }
    saltosSeguidosRef.current += 1;
    if (saltosSeguidosRef.current >= MAX_SALTOS_SEGUIDOS) {
      console.warn('[audio-nativo] demasiados fallos seguidos: se para (¿sin conexión?)');
      saltosSeguidosRef.current = 0;
      ReproductorNativo.pausar().catch(() => {});
      vigilanteRef.current.fallo(codigo);
      return;
    }
    // Se limpia para que reproducir() no descarte por idempotencia el
    // reintento con otro candidato (igual que useYouTube).
    videoActualRef.current = null;
    alFallarVideoRef.current?.({ videoId, codigo });
  }, []);

  /**
   * Resuelve la URL y la entrega al servicio. `forzar` salta la caché de
   * resolverAudio (URL caducada).
   */
  const cargarPista = useCallback(
    async (videoId, { autoplay = true, segundos = 0, forzar = false, intento = 0 } = {}) => {
      const token = ++tokenRef.current;
      cargandoRef.current = token; // aplaza la precarga: cargar() vacía la cola nativa
      let audio;
      try {
        audio = await resolverFuente(videoId, { trackId: trackIdPorIdRef.current.get(videoId), forzar, fetch: await obtenerFetch() });
      } catch (e) {
        if (token !== tokenRef.current) return;
        cargandoRef.current = 0;
        // Un fallo técnico (red, YouTube caído) se reintenta antes de acusar
        // al video; "no disponible" es del video y no tiene sentido repetirlo.
        if (e.codigo !== 'no_disponible' && intento < MAX_REINTENTOS_RESOLUCION) {
          setTimeout(() => {
            if (token === tokenRef.current) cargarPista(videoId, { autoplay, segundos, forzar, intento: intento + 1 });
          }, 1500);
          return;
        }
        fallar(videoId, e.codigo ?? 'resolucion', e.message);
        return;
      }
      if (token !== tokenRef.current) return;
      diagnostico.anotar('resuelto', `${videoId} ${audio.cliente ?? ''}`);
      if (audio.duracion > 0) setDuracion(audio.duracion);
      try {
        await ReproductorNativo.fijarVolumen({ valor: volumenRef.current });
        // Solo la metadata de ESTA pista: si App ya describe otra, mejor vacía que con otro título.
        const meta = metaPara(videoId, trackIdDe(videoId));
        servicioCerradoRef.current = false; // cargar() recrea el servicio si hacía falta
        await ReproductorNativo.cargar({
          url: audio.url,
          headers: audio.headers,
          titulo: meta?.titulo ?? '',
          artista: meta?.artista ?? '',
          album: meta?.subtitulo ?? '',
          portadaUrl: meta?.portadaUrl ?? null,
          posicionMs: Math.round(segundos * 1000),
          reproducirAlCargar: autoplay,
          id: videoId,
          gananciaDb: gananciaNivelada(audio.loudnessDb),
        });
        diagnostico.anotar('entregado', videoId);
        if (token === tokenRef.current) {
          cargandoRef.current = 0;
          enviarAnticipada();
          ejecutarPrecarga(); // la cola nativa quedó solo con esta pista
        }
      } catch (e) {
        if (token !== tokenRef.current) return;
        cargandoRef.current = 0;
        diagnostico.anotar('orden rechazada', `${intento} ${e?.message ?? e}`);
        // El plugin ya descartó la conexión colgada: un reintento la rehace desde cero.
        if (intento < 1) {
          setTimeout(() => {
            if (token === tokenRef.current) cargarPista(videoId, { autoplay, segundos, forzar, intento: intento + 1 });
          }, ESPERA_REINTENTO_NATIVO_MS);
          return;
        }
        fallar(videoId, e?.code === 'rechazado' ? 'nativo_rechazado' : 'nativo', e?.message ?? String(e));
      }
    },
    [fallar, ejecutarPrecarga, enviarAnticipada, trackIdDe]
  );

  // «Nivelar volumen»: el servicio aplica la ganancia de cada pista; aquí solo se le dice si está activa.
  useEffect(() => {
    const enviar = () => ReproductorNativo.fijarNivelacion({ activo: leerNivelar() }).catch(() => {});
    enviar();
    window.addEventListener(EVENTO_NIVELAR, enviar);
    return () => window.removeEventListener(EVENTO_NIVELAR, enviar);
  }, []);

  // «Fundido entre canciones»: lo aplica el servicio (corre con la pantalla bloqueada); aquí solo se le pasan los ajustes.
  useEffect(() => {
    const enviar = () =>
      ReproductorNativo.fijarFundido({ segundos: leerFundido(), sinAlbumes: leerSinFundidoAlbumes() }).catch(() => {});
    enviar();
    window.addEventListener(EVENTO_FUNDIDO, enviar);
    return () => window.removeEventListener(EVENTO_FUNDIDO, enviar);
  }, []);

  /**
   * Lee el estado del player nativo y lo ADOPTA (pista, posición, si suena) sin recargar nada: mientras
   * la app estaba en segundo plano el nativo pudo avanzar o retroceder solo, o el WebView recrearse
   * con una sesión vieja. Devuelve si había algo que adoptar. No hace nada si el usuario acaba de
   * pedir una pista (el nativo aún tiene la anterior).
   */
  const sincronizarConNativo = useCallback(async () => {
    let nativo;
    try {
      nativo = await ReproductorNativo.estadoActual();
    } catch {
      return false;
    }
    const reciente = Date.now() - peticionRef.current < 3000;
    const plan = planAdopcion({ nativo, videoActual: videoActualRef.current, cargando: cargandoRef.current || reciente });
    if (!plan) return false;
    if (plan.senalDebil) fijarSenalDebil(plan.senalDebil);
    if (plan.respaldo) {
      // Una guardada del modo sin señal no está en la cola de JS: no se avanza el índice.
      if (plan.id !== pistaRespaldoRef.current) anotarRespaldo(plan.id);
    } else if (plan.cambioPista) {
      marcarActual(plan.id); // el reproducir(id) que dispare App será no-op
      recuperacionesRef.current = 0;
      setPistaRespaldo(null);
      alAvanzarNativoRef.current?.(plan.id);
    }
    posicionMsRef.current = plan.posicionMs;
    setTiempo(plan.posicionMs / 1000);
    if (plan.duracionMs > 0) setDuracion(plan.duracionMs / 1000);
    const suena = plan.estado === 'reproduciendo';
    if (suena) vigilanteRef.current.sono();
    estadoRef.current = plan.estado;
    sonandoRef.current = suena;
    setSonando(suena);
    return true;
  }, [fijarSenalDebil, anotarRespaldo, setPistaRespaldo, marcarActual]);

  // Al abrir (o recrearse el WebView) y cada vez que la app vuelve a primer plano: la fuente de verdad
  // es el nativo. Sin esto, JS seguiría creyendo en la pista vieja y la restauraría/recargaría encima.
  useEffect(() => {
    const espera = Promise.race([
      sincronizarConNativo().then((hay) => {
        nativoVivoRef.current = hay;
      }),
      new Promise((r) => setTimeout(r, 1500)),
    ]).finally(() => {
      if (esperaSyncRef.current === espera) esperaSyncRef.current = null;
    });
    esperaSyncRef.current = espera;
    const alVolver = () => {
      if (!document.hidden) sincronizarConNativo();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [sincronizarConNativo]);

  // Lo que anota el servicio: saltos con el JS dormido (bloqueo, notificación, auricular), oídas y reproducciones.
  useEffect(() => {
    const recoger = () => {
      ReproductorNativo.saltosPendientes()
        .then((r) => {
          // Saltos y oídas (tipo «oida») juntos y en el orden en que ocurrieron.
          for (const s of ordenarPendientesNativos(r?.saltos)) alSaltoNativoRef.current?.(s);
        })
        .catch(() => {});
    };
    const alVolver = () => {
      if (!document.hidden) recoger();
    };
    recoger();
    document.addEventListener('visibilitychange', alVolver);
    // Con la app abierta no cambia la visibilidad: el servicio avisa de cada reproducción que anota.
    const alAnotar = crearCoalescedor(recoger, ESPERA_TRANSICIONES_MS);
    const aviso = ReproductorNativo.addListener('anotacion', () => alAnotar());
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      aviso.then((h) => h.remove()).catch(() => {});
    };
  }, []);

  // Eventos del servicio nativo.
  useEffect(() => {
    instalarPuente();
    let cancelado = false;
    const manejadores = [];
    // Al despertar el WebView llegan en ráfaga las transiciones que ocurrieron dormido: solo vale la última.
    const coalescerTransicion = crearCoalescedor(({ id, respaldo }) => {
      if (!id) return;
      recuperacionesRef.current = 0;
      posicionMsRef.current = 0;
      setTiempo(0);
      setDuracion(0);
      if (respaldo) {
        anotarRespaldo(id);
        return;
      }
      marcarActual(id);
      setPistaRespaldo(null);
      alAvanzarNativoRef.current?.(id);
    }, ESPERA_TRANSICIONES_MS);
    (async () => {
      const alta = [
        await ReproductorNativo.addListener('estado', (e) => {
          estadoRef.current = e.estado;
          if (e.estado === 'error' || e.estado === 'reproduciendo') diagnostico.anotar(e.estado, `${e.codigo ?? ''} ${e.mensaje ?? ''}`);
          if (e.estado === 'error') {
            // En el modo sin señal el nativo gestiona los cortes de red: JS no debe recargar ni saltar.
            if (senalDebilRef.current.activo) return;
            // El error puede ser de una pista encolada que ya pasó a sonar
            // mientras JS dormía: manda el id que informa el servicio.
            const videoId = e.id || videoActualRef.current;
            if (!videoId) return;
            marcarActual(videoId);
            sonandoRef.current = false;
            setSonando(false);
            // Una canción que ya sonó no se salta por un corte: se vuelve a
            // resolver y se reanuda donde iba.
            const recuperable = e.recuperable || sonoRef.current === videoId;
            if (recuperable && recuperacionesRef.current < MAX_RECUPERACIONES) {
              recuperacionesRef.current += 1;
              olvidarAudio(videoId);
              cargarPista(videoId, {
                autoplay: true,
                segundos: (e.posicionMs ?? posicionMsRef.current) / 1000,
                forzar: true,
              });
            } else {
              fallar(videoId, `nativo_${e.codigo}`, e.mensaje);
            }
            return;
          }
          const suena = e.estado === 'reproduciendo';
          sonandoRef.current = suena;
          setSonando(suena);
          if (suena) {
            vigilanteRef.current.sono();
            recuperacionesRef.current = 0;
            saltosSeguidosRef.current = 0;
            sonoRef.current = videoActualRef.current;
          }
          if (e.estado === 'terminado') alTerminarRef.current?.();
        }),
        // ExoPlayer pasó solo a la siguiente de la cola nativa (fin de pista o
        // botón del sistema). Con el WebView congelado esto llega tarde, al
        // despertar; no importa, el audio ya siguió. Se marca la pista como
        // actual para que el reproducir(videoId) que dispare App sea no-op.
        await ReproductorNativo.addListener('transicion', (t) => coalescerTransicion(t)),
        await ReproductorNativo.addListener('senalDebil', (v) => fijarSenalDebil(v)),
        // Pausa larga: el servicio se cerró solo. El siguiente ▶ vuelve a cargar la pista en su posición.
        await ReproductorNativo.addListener('cerrado', () => {
          servicioCerradoRef.current = true;
        }),
        await ReproductorNativo.addListener('temporizador', (t) => {
          setTemporizador(t.finMs || t.alFinal ? { finMs: t.finMs ?? null, alFinal: !!t.alFinal } : null);
        }),
        await ReproductorNativo.addListener('progreso', (p) => {
          posicionMsRef.current = p.posicionMs;
          setTiempo(p.posicionMs / 1000);
          if (p.duracionMs > 0) setDuracion(p.duracionMs / 1000);
        }),
      ];
      if (cancelado) alta.forEach((h) => h.remove());
      else {
        manejadores.push(...alta);
        setListo(true);
      }
    })();
    return () => {
      cancelado = true;
      manejadores.forEach((h) => h.remove());
    };
  }, [cargarPista, fallar, fijarSenalDebil, anotarRespaldo, setPistaRespaldo, marcarActual]);

  const reproducir = useCallback(
    (videoId, opciones) => {
      if (!videoId) return;
      // Mismo contrato idempotente que useYouTube: volver a pedir el video que
      // ya está cargado no lo reinicia. Tras un fallo sí vale: volver a tocarla es reintentar.
      if (videoActualRef.current === videoId && arranqueRef.current?.fase !== 'fallo') return;
      const autoplay = opciones?.autoplay ?? true;
      const segundos = opciones?.segundos ?? 0;
      if (!autoplay) {
        // Restaurar la sesión guardada: no se carga encima de lo que el nativo ya tiene sonando (o en
        // pausa) — esperar a leer su estado y, si había pista, adoptarla en vez de recargar la vieja.
        if (esperaSyncRef.current) {
          esperaSyncRef.current.then(() => reproducirRef.current?.(videoId, opciones));
          return;
        }
        if (nativoVivoRef.current) return;
        vigilanteRef.current.limpiar();
      } else {
        nativoVivoRef.current = false;
        // Solo tras un fallo: los saltos automáticos también pasan por aquí y tienen que seguir sumando.
        if (arranqueRef.current?.fase === 'fallo') saltosSeguidosRef.current = 0;
        vigilanteRef.current.iniciar();
      }
      diagnostico.anotar('pedido', `${videoId} autoplay=${autoplay}`);
      pedidoRef.current = videoId;
      peticionRef.current = Date.now();
      if (opciones?.trackId) trackIdPorIdRef.current.set(videoId, opciones.trackId);
      marcarActual(videoId);
      recuperacionesRef.current = 0;
      setTiempo(segundos);
      setDuracion(0);
      // Si ya está precargada en la cola nativa, el cambio es inmediato. Si no,
      // se calla la anterior YA (resolver tarda 1-2 s y seguía sonando la vieja
      // con el título nuevo en pantalla).
      const token = ++tokenRef.current;
      const cargarNormal = () => {
        if (token !== tokenRef.current) return;
        if (autoplay) ReproductorNativo.pausar().catch(() => {});
        cargarPista(videoId, { autoplay, segundos });
      };
      if (autoplay && segundos === 0) {
        ReproductorNativo.saltarA({ id: videoId })
          .then((r) => {
            if (!r?.aplicado) cargarNormal();
            // La cola tras la nueva actual se rehace (la precarga pudo pedirse antes del salto).
            else if (token === tokenRef.current) ejecutarPrecarga();
          })
          .catch(cargarNormal);
      } else {
        cargarNormal();
      }
    },
    [cargarPista, ejecutarPrecarga, marcarActual]
  );
  reproducirRef.current = reproducir;

  // No hay player que recrear (el servicio nativo sobrevive al bloqueo de
  // pantalla), pero App.jsx lo usa también como "reintenta este video".
  const recrearPlayer = useCallback(
    (opciones) => {
      const videoId = opciones?.videoId ?? videoActualRef.current ?? pedidoRef.current;
      if (!videoId) return;
      if (opciones?.autoplay ?? true) vigilanteRef.current.iniciar();
      diagnostico.anotar('reintento', videoId);
      pedidoRef.current = videoId;
      peticionRef.current = Date.now();
      marcarActual(videoId);
      cargarPista(videoId, {
        autoplay: opciones?.autoplay ?? true,
        segundos: opciones?.segundos ?? 0,
        forzar: true,
      });
    },
    [cargarPista, marcarActual]
  );

  const buscar = useCallback((segundos) => {
    const destino = Math.max(0, segundos);
    setTiempo(destino);
    posicionMsRef.current = destino * 1000;
    ReproductorNativo.buscar({ ms: Math.round(destino * 1000) }).catch(() => {});
    // Tras terminar, seekTo(0) (repetir) tiene que volver a sonar, como en el iframe.
    if (estadoRef.current === 'terminado') ReproductorNativo.reproducir().catch(() => {});
  }, []);

  const saltar = useCallback(
    (delta) => buscar(posicionMsRef.current / 1000 + delta),
    [buscar]
  );
  const reiniciar = useCallback(() => buscar(0), [buscar]);

  // «Repetir» = repeat-one en el player nativo: ExoPlayer no emite "terminado"
  // al acabar la canción, así que reiniciar() desde JS no llegaría a ejecutarse.
  const fijarRepeticion = useCallback((activo) => {
    ReproductorNativo.repetir({ activo: !!activo }).catch(() => {});
  }, []);

  const alternarPausa = useCallback(() => {
    // Tras un fallo el nativo no tiene nada que reanudar: ▶ es «inténtalo otra vez».
    if (arranqueRef.current?.fase === 'fallo' || servicioCerradoRef.current) {
      servicioCerradoRef.current = false;
      saltosSeguidosRef.current = 0;
      recrearPlayer({ segundos: posicionMsRef.current / 1000 });
    } else if (sonandoRef.current) ReproductorNativo.pausar().catch(() => {});
    else ReproductorNativo.reproducir().catch(() => {});
  }, [recrearPlayer]);

  const pausar = useCallback(() => {
    ReproductorNativo.pausar().catch(() => {});
  }, []);

  const cambiarVolumen = useCallback((v) => {
    setVolumenState(v);
    guardarVolumen(v);
    volumenRef.current = v;
    if (v > 0) volumenAnteriorRef.current = v;
    ReproductorNativo.fijarVolumen({ valor: v }).catch(() => {});
  }, []);

  const alternarSilencio = useCallback(() => {
    cambiarVolumen(volumen > 0 ? 0 : volumenAnteriorRef.current || 100);
  }, [volumen, cambiarVolumen]);

  // Temporizador para dormir: vive en el servicio nativo (corre con la pantalla bloqueada).
  const fijarTemporizador = useCallback((opcion) => {
    ReproductorNativo.temporizador({
      minutos: opcion?.minutos ?? 0,
      alFinal: !!opcion?.alFinal,
    }).catch(() => {});
  }, []);

  return {
    temporizador,
    fijarTemporizador,
    contenedorRef,
    reproducir,
    alternarPausa,
    pausar,
    buscar,
    saltar,
    reiniciar,
    fijarRepeticion,
    volumen,
    cambiarVolumen,
    alternarSilencio,
    recrearPlayer,
    precargarSiguientes,
    anticiparCola,
    senalDebil,
    pistaRespaldo,
    arranque,
    listo,
    sonando,
    tiempo,
    duracion,
  };
}
