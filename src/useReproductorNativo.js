import { useEffect, useRef, useState, useCallback } from 'react';
import { registerPlugin } from '@capacitor/core';
import { resolverAudio, crearFetchNativo, olvidarAudio } from './data/audio-nativo.js';
import { gananciaNivelada, leerNivelar, EVENTO as EVENTO_NIVELAR } from './data/nivelar-volumen.js';
import { leerFundido, leerSinFundidoAlbumes, EVENTO_FUNDIDO } from './data/fundido.js';
import { esIdLocal, resolverFuenteReproduccion, trackIdDeIdLocal } from './data/reproduccion-locales.js';
import { comandoCaducado, planAdopcion } from './data/sincronizar-nativo.js';

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
const metaActual = { titulo: '', artista: '', subtitulo: '', portadaUrl: null, clave: '' };
const oyentesComando = new Set();
let puenteInstalado = false;

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
      const clave = `${estado.titulo}|${estado.artista}|${subtitulo}|${portadaUrl}|${favorito}|${aleatorio}`;
      if (clave === metaActual.clave) return; // `sonando` también dispara esto
      Object.assign(metaActual, { titulo: estado.titulo, artista: estado.artista, subtitulo, portadaUrl, clave });
      ReproductorNativo.actualizarMetadata({
        titulo: metaActual.titulo,
        artista: metaActual.artista,
        album: metaActual.subtitulo,
        portadaUrl,
      }).catch(() => {});
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

export function useReproductorNativo(alTerminar, alFallarVideo, alAvanzarNativo) {
  const contenedorRef = useRef(null); // sin uso: no hay iframe. App.jsx lo monta igual.
  const alTerminarRef = useRef(alTerminar);
  const alFallarVideoRef = useRef(alFallarVideo);
  const alAvanzarNativoRef = useRef(alAvanzarNativo);
  const cargandoRef = useRef(0); // token de la cargarPista en vuelo (0 = ninguna)
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

  const [listo, setListo] = useState(false);
  const [sonando, setSonando] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [volumen, setVolumenState] = useState(() => leerVolumenGuardado());
  const [temporizador, setTemporizador] = useState(null); // {finMs?, alFinal}

  useEffect(() => {
    alTerminarRef.current = alTerminar;
  }, [alTerminar]);
  useEffect(() => {
    alFallarVideoRef.current = alFallarVideo;
  }, [alFallarVideo]);
  useEffect(() => {
    alAvanzarNativoRef.current = alAvanzarNativo;
  }, [alAvanzarNativo]);

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
    // El servicio nativo solo sabe resolver YouTube: las pendientes se cortan en la primera local
    // para no saltarse canciones; esa y las siguientes las entrega JS cuando le toque.
    const resto = pedido.lista.slice(MAX_SIGUIENTES);
    const corte = resto.findIndex((p) => esIdLocal(p.videoId));
    const pendientes = (corte === -1 ? resto : resto.slice(0, corte)).map((p) => ({
      id: p.videoId,
      titulo: p.titulo ?? '',
      artista: p.artista ?? '',
      portadaUrl: p.portadaUrl ?? null,
    }));
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
    (lista, actualVideoId, anteriores) => {
      // `anteriores` (opcional, de la mas lejana a la mas cercana): van ANTES de la actual; el nativo las
      // conserva para que el boton anterior funcione con el WebView dormido.
      precargaRef.current = { lista: lista ?? [], actualId: actualVideoId ?? null, anteriores: anteriores ?? null };
      ejecutarPrecarga();
    },
    [ejecutarPrecarga]
  );

  const fallar = useCallback((videoId, codigo, detalle) => {
    console.warn('[audio-nativo] fallo', codigo, videoId, detalle ?? '');
    saltosSeguidosRef.current += 1;
    if (saltosSeguidosRef.current >= MAX_SALTOS_SEGUIDOS) {
      console.warn('[audio-nativo] demasiados fallos seguidos: se para (¿sin conexión?)');
      saltosSeguidosRef.current = 0;
      ReproductorNativo.pausar().catch(() => {});
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
      if (audio.duracion > 0) setDuracion(audio.duracion);
      try {
        await ReproductorNativo.fijarVolumen({ valor: volumenRef.current });
        await ReproductorNativo.cargar({
          url: audio.url,
          headers: audio.headers,
          titulo: metaActual.titulo,
          artista: metaActual.artista,
          album: metaActual.subtitulo,
          portadaUrl: metaActual.portadaUrl,
          posicionMs: Math.round(segundos * 1000),
          reproducirAlCargar: autoplay,
          id: videoId,
          gananciaDb: gananciaNivelada(audio.loudnessDb),
        });
        if (token === tokenRef.current) {
          cargandoRef.current = 0;
          ejecutarPrecarga(); // la cola nativa quedó solo con esta pista
        }
      } catch (e) {
        if (token !== tokenRef.current) return;
        cargandoRef.current = 0;
        fallar(videoId, 'nativo', e?.message ?? String(e));
      }
    },
    [fallar, ejecutarPrecarga]
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
    if (plan.cambioPista) {
      videoActualRef.current = plan.id; // el reproducir(id) que dispare App será no-op
      recuperacionesRef.current = 0;
      alAvanzarNativoRef.current?.(plan.id);
    }
    posicionMsRef.current = plan.posicionMs;
    setTiempo(plan.posicionMs / 1000);
    if (plan.duracionMs > 0) setDuracion(plan.duracionMs / 1000);
    const suena = plan.estado === 'reproduciendo';
    estadoRef.current = plan.estado;
    sonandoRef.current = suena;
    setSonando(suena);
    return true;
  }, []);

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

  // Eventos del servicio nativo.
  useEffect(() => {
    instalarPuente();
    let cancelado = false;
    const manejadores = [];
    (async () => {
      const alta = [
        await ReproductorNativo.addListener('estado', (e) => {
          estadoRef.current = e.estado;
          if (e.estado === 'error') {
            // El error puede ser de una pista encolada que ya pasó a sonar
            // mientras JS dormía: manda el id que informa el servicio.
            const videoId = e.id || videoActualRef.current;
            if (!videoId) return;
            videoActualRef.current = videoId;
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
        await ReproductorNativo.addListener('transicion', ({ id }) => {
          if (!id) return;
          videoActualRef.current = id;
          recuperacionesRef.current = 0;
          posicionMsRef.current = 0;
          setTiempo(0);
          setDuracion(0);
          alAvanzarNativoRef.current?.(id);
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
  }, [cargarPista, fallar]);

  const reproducir = useCallback(
    (videoId, opciones) => {
      if (!videoId) return;
      // Mismo contrato idempotente que useYouTube: volver a pedir el video que
      // ya está cargado no lo reinicia.
      if (videoActualRef.current === videoId) return;
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
      } else {
        nativoVivoRef.current = false;
      }
      peticionRef.current = Date.now();
      if (opciones?.trackId) trackIdPorIdRef.current.set(videoId, opciones.trackId);
      videoActualRef.current = videoId;
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
    [cargarPista, ejecutarPrecarga]
  );
  reproducirRef.current = reproducir;

  // No hay player que recrear (el servicio nativo sobrevive al bloqueo de
  // pantalla), pero App.jsx lo usa también como "reintenta este video".
  const recrearPlayer = useCallback(
    (opciones) => {
      const videoId = opciones?.videoId ?? videoActualRef.current;
      if (!videoId) return;
      peticionRef.current = Date.now();
      videoActualRef.current = videoId;
      cargarPista(videoId, {
        autoplay: opciones?.autoplay ?? true,
        segundos: opciones?.segundos ?? 0,
        forzar: true,
      });
    },
    [cargarPista]
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
    if (sonandoRef.current) ReproductorNativo.pausar().catch(() => {});
    else ReproductorNativo.reproducir().catch(() => {});
  }, []);

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
    listo,
    sonando,
    tiempo,
    duracion,
  };
}
