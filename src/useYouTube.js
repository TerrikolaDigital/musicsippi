import { useEffect, useRef, useState, useCallback } from 'react';
import { gananciaNivelada, volumenEfectivo, leerNivelar, EVENTO as EVENTO_NIVELAR } from './data/nivelar-volumen.js';

const CLAVE_VOLUMEN = 'volumenReproductor';

// Default a mitad de volumen, no al máximo — pedido explícito. Ojo con
// Number(null): da 0 (no NaN), así que sin el chequeo de null explícito
// "nunca se guardó nada" caía siempre en 0 en vez de ir al default.
const VOLUMEN_POR_DEFECTO = 50;

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
    // localStorage puede fallar (modo privado, cuota llena); no es crítico.
  }
}

/** Carga la IFrame Player API una sola vez, aunque el hook se monte varias veces. */
let promesaApi = null;
function cargarApi() {
  if (promesaApi) return promesaApi;
  promesaApi = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    document.head.appendChild(tag);
  });
  return promesaApi;
}

/**
 * Reproductor de YouTube.
 *
 * `alTerminar` se guarda en un ref porque el callback de la IFrame API se
 * registra una sola vez al crear el player: si dependiera del valor de la
 * clausura, avanzaría siempre al track que era "el siguiente" en el primer
 * render y la cola se quedaría trabada en el segundo tema.
 */
// Códigos de la IFrame Player API que significan "este video puntual no se
// puede reproducir acá". Los cuatro se tratan igual desde afuera: el track
// necesita OTRO video, no un reintento con el mismo.
//   2   -> el id no tiene forma de videoId válido
//   5   -> el reproductor HTML5 no puede con este contenido
//   100 -> video borrado o privado
//   101/150 -> el dueño prohibió la reproducción embebida (150 es 101 desde un
//              dominio distinto). Este es el caso frecuente: los videoclips
//              oficiales suelen tenerlo, y son justo lo que devuelve una
//              búsqueda por "artista + título".
const ERRORES_DE_VIDEO = new Set([2, 5, 100, 101, 150]);

const noop = () => {};

// Ganancia (dB) por videoId para «Nivelar volumen»: la sonoridad la da el servidor
// (/api/sonoridad, que la lee de InnerTube y la guarda en disco).
const gananciasPorVideo = new Map();
async function pedirGanancia(videoId) {
  if (gananciasPorVideo.has(videoId)) return gananciasPorVideo.get(videoId);
  try {
    const r = await fetch(`/api/sonoridad?videoId=${encodeURIComponent(videoId)}`);
    if (!r.ok) return null;
    const { loudnessDb } = await r.json();
    if (!Number.isFinite(loudnessDb)) return null;
    const db = gananciaNivelada(loudnessDb);
    gananciasPorVideo.set(videoId, db);
    return db;
  } catch {
    return null; // sin servidor o sin red: se queda a 0 dB
  }
}

export function useYouTube(alTerminar, alFallarVideo) {
  const contenedorRef = useRef(null);
  const playerRef = useRef(null);
  const alTerminarRef = useRef(alTerminar);
  // Mismo motivo que alTerminarRef: el callback se registra una sola vez al
  // crear el player, así que leerlo de la clausura lo dejaría clavado en el
  // track del primer render.
  const alFallarVideoRef = useRef(alFallarVideo);
  // Video pedido antes de que el player estuviera listo. Crear el player es asincrono
  // (hay que bajar la IFrame API), asi que la primera resolucion casi siempre gana la
  // carrera: sin esta cola, ese loadVideoById se pierde en silencio y no suena nada.
  const pendienteRef = useRef(null);
  // Ademas del `listo` de estado (para quien consuma el hook), hace falta un ref:
  // la guarda de `reproducir` necesita un valor sincronico en el momento de la
  // llamada. Antes chequeaba `playerRef.current?.loadVideoById`, que existe apenas
  // se crea el player — ANTES de que dispare `onReady` — dejando una ventana
  // angosta donde `loadVideoById` se llama sobre un player aun no inicializado.
  const listoRef = useRef(false);
  // Cual video esta cargado ahora mismo, para que reproducir() sea idempotente
  // (ver el comentario junto a su definicion mas abajo).
  const videoActualRef = useRef(null);
  const [listo, setListo] = useState(false);
  const [sonando, setSonando] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [volumen, setVolumenState] = useState(() => leerVolumenGuardado());
  // Mismo patron que pendienteRef: si se cambia el volumen antes de que el
  // player exista, se aplica recien en onReady. Arranca con el volumen
  // GUARDADO (no null) para que se aplique solo apenas el player esté listo,
  // aunque el usuario no toque el slider — sin esto, cada carga de página
  // sonaba al 100% hasta el primer cambio manual, sin importar lo que se
  // hubiera dejado la vez anterior.
  const volumenPendienteRef = useRef(leerVolumenGuardado());
  // Para restaurar al des-silenciar (no queremos que "activar sonido" vuelva
  // siempre a 100 si el usuario lo tenia en 30).
  const volumenAnteriorRef = useRef(leerVolumenGuardado() || 100);
  // «Nivelar volumen»: el volumen real del iframe es volumen del usuario × ganancia de la pista.
  const volumenUsuarioRef = useRef(leerVolumenGuardado());
  const gananciaDbRef = useRef(0);
  const nivelarRef = useRef(leerNivelar());
  const volumenParaPlayer = () =>
    Math.round(volumenEfectivo(volumenUsuarioRef.current, gananciaDbRef.current, nivelarRef.current));
  const aplicarGananciaDe = useCallback((videoId) => {
    const conocida = gananciasPorVideo.get(videoId);
    gananciaDbRef.current = conocida ?? 0;
    if (conocida === undefined && nivelarRef.current) {
      pedirGanancia(videoId).then((db) => {
        if (db === null || videoActualRef.current !== videoId) return;
        gananciaDbRef.current = db;
        if (listoRef.current) playerRef.current?.setVolume?.(volumenParaPlayer());
      });
    }
    if (listoRef.current) playerRef.current?.setVolume?.(volumenParaPlayer());
  }, []);
  useEffect(() => {
    const alCambiar = () => {
      nivelarRef.current = leerNivelar();
      if (videoActualRef.current) aplicarGananciaDe(videoActualRef.current);
      else if (listoRef.current) playerRef.current?.setVolume?.(volumenParaPlayer());
    };
    window.addEventListener(EVENTO_NIVELAR, alCambiar);
    return () => window.removeEventListener(EVENTO_NIVELAR, alCambiar);
  }, [aplicarGananciaDe]);

  useEffect(() => {
    alTerminarRef.current = alTerminar;
  }, [alTerminar]);

  useEffect(() => {
    alFallarVideoRef.current = alFallarVideo;
  }, [alFallarVideo]);

  // VIGÍA. No todos los fallos llegan por onError: un player congelado por el
  // navegador (pantalla bloqueada, pestaña dormida) acepta loadVideoById sin
  // chistar y después no hace nada, sin emitir evento alguno. Sin este
  // temporizador ese caso es indistinguible de "todo bien" y la app se queda
  // esperando para siempre. Se arma al pedir un video y se desarma en cuanto
  // el player da SEÑAL DE VIDA (cualquier cambio de estado), no solo al
  // ponerse a sonar: bufferear lento es normal y no debe contar como fallo.
  const vigiaRef = useRef(null);
  const cancelarVigia = useCallback(() => {
    if (vigiaRef.current) {
      clearTimeout(vigiaRef.current);
      vigiaRef.current = null;
    }
  }, []);
  const armarVigia = useCallback(
    (videoId) => {
      cancelarVigia();
      vigiaRef.current = setTimeout(() => {
        vigiaRef.current = null;
        // Solo si SIGUE esperando este mismo video: si el usuario ya cambió de
        // canción, este temporizador es de una petición vieja y no dice nada.
        if (videoActualRef.current !== videoId) return;
        console.warn('[youtube] el player nunca respondió al cargar', videoId);
        videoActualRef.current = null;
        alFallarVideoRef.current?.({ videoId, codigo: 'sin_respuesta' });
      }, 15000);
    },
    [cancelarVigia]
  );

  // Se incrementa para forzar la reconstrucción del player desde cero. Es un
  // estado y no un ref porque tiene que disparar el efecto de abajo.
  const [generacion, setGeneracion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    cargarApi().then((YT) => {
      if (cancelado || !contenedorRef.current || playerRef.current) return;
      // YT.Player REEMPLAZA el elemento que recibe por su iframe. Si se le
      // pasara el div de React directamente, ese div desaparecería del DOM y
      // al recrear el player (tras un error o un congelamiento) el ref
      // apuntaría a un nodo suelto y la creación fallaría en silencio. Por eso
      // se le da un hijo descartable: el div de React queda intacto como
      // envase estable y acá adentro se puede destruir y rehacer las veces que
      // haga falta.
      const destinatario = document.createElement('div');
      contenedorRef.current.replaceChildren(destinatario);

      playerRef.current = new YT.Player(destinatario, {
        height: '100%',
        width: '100%',
        playerVars: { autoplay: 0, controls: 1, rel: 0, playsinline: 1 },
        events: {
          onError: (e) => {
            // Sin este manejador —que es como estaba— un video con embebido
            // prohibido dejaba la app muda PARA SIEMPRE: no sonaba, no
            // avisaba y no saltaba, con la metadata en pantalla como si todo
            // estuviera bien. Era el fallo que más costó encontrar.
            cancelarVigia();
            const video = videoActualRef.current;
            console.warn('[youtube] onError', e.data, 'en video', video);
            if (ERRORES_DE_VIDEO.has(e.data)) {
              // Se limpia para que reproducir() no lo tome como "ya cargado"
              // y descarte por idempotencia el reintento con otro candidato.
              videoActualRef.current = null;
              alFallarVideoRef.current?.({ videoId: video, codigo: e.data });
            }
          },
          onReady: (e) => {
            listoRef.current = true;
            setListo(true);
            if (volumenPendienteRef.current !== null) {
              volumenUsuarioRef.current = volumenPendienteRef.current;
              e.target.setVolume(volumenParaPlayer());
              volumenPendienteRef.current = null;
            }
            if (pendienteRef.current) {
              const { videoId, autoplay, segundos } = pendienteRef.current;
              // Se apunta también acá: si no, reproducir() creería que no hay
              // nada cargado y volvería a mandar el mismo video, reiniciándolo
              // desde cero justo después de haber arrancado.
              videoActualRef.current = videoId;
              if (autoplay) {
                armarVigia(videoId);
                e.target.loadVideoById({ videoId, startSeconds: segundos });
              } else {
                e.target.cueVideoById({ videoId, startSeconds: segundos });
              }
              pendienteRef.current = null;
            }
          },
          onStateChange: (e) => {
            // Cualquier cambio de estado prueba que el player está vivo y
            // atendió el pedido; a partir de acá el vigía sobra.
            cancelarVigia();
            setSonando(e.data === YT.PlayerState.PLAYING);
            if (e.data === YT.PlayerState.ENDED) {
              // Temporizador "al acabar esta canción": no se pasa a la siguiente.
              if (alFinalRef.current) {
                alFinalRef.current = false;
                setTemporizador(null);
              } else {
                alTerminarRef.current?.();
              }
            }
          },
        },
      });
    });
    return () => {
      cancelado = true;
      cancelarVigia();
      listoRef.current = false;
      videoActualRef.current = null;
      setListo(false);
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [generacion, cancelarVigia, armarVigia]);

  /**
   * Destruye el player y lo vuelve a construir de cero.
   *
   * Hace falta porque un player que quedó inservible no se recupera solo: ni
   * tras un error de video ni —el caso que motivó esto— tras congelarse al
   * bloquear la pantalla del móvil. Antes no había forma de rehacerlo, así que
   * la única salida era recargar la página a mano.
   */
  const recrearPlayer = useCallback((opciones) => {
    // La limpieza del efecto borra videoActualRef, y App.jsx no vuelve a pedir
    // nada porque para él el track no cambió. Así que lo que había que sonar se
    // deja encolado ANTES: pendienteRef sobrevive a la limpieza y onReady lo
    // consume solo. Sin esto, recrear el player dejaba la app en silencio.
    const videoId = opciones?.videoId ?? videoActualRef.current;
    if (videoId) {
      pendienteRef.current = {
        videoId,
        autoplay: opciones?.autoplay ?? true,
        segundos: opciones?.segundos ?? 0,
      };
    }
    console.warn('[youtube] recreando el player', videoId ?? '(sin video)');
    setGeneracion((n) => n + 1);
  }, []);

  /**
   * Al volver de segundo plano, comprueba que el player siga vivo.
   *
   * Cuando el móvil bloquea la pantalla, el navegador congela la página y
   * puede dejar el iframe inservible: acepta las llamadas y no hace nada, sin
   * emitir ningún evento. Antes esto no se detectaba y la única salida era
   * recargar a mano — el síntoma era "reproduce, bloqueo, y ya no suena
   * ninguna canción nunca más".
   *
   * Se comprueba preguntándole la hora al player: si un player que decía estar
   * sonando ya no sabe responder, está muerto y hay que rehacerlo.
   */
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState !== 'visible') return;
      const p = playerRef.current;
      if (!p || !listoRef.current) return;
      let vivo = false;
      try {
        vivo = typeof p.getPlayerState?.() === 'number';
      } catch {
        vivo = false;
      }
      if (!vivo) {
        recrearPlayer({
          videoId: videoActualRef.current,
          // Se recrea EN PAUSA: el usuario volvió a la app pero no pidió que
          // sonara, y arrancar solo sería una sorpresa desagradable. Además,
          // los navegadores móviles bloquean la reproducción automática fuera
          // de un gesto, así que forzarla fallaría igual.
          autoplay: false,
          segundos: tiempo,
        });
      }
    }
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [recrearPlayer, tiempo]);

  // La IFrame API no emite progreso: hay que consultarlo. Solo mientras suena,
  // para no despertar al player cuando esta en pausa.
  useEffect(() => {
    if (!sonando) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      setTiempo(p.getCurrentTime() ?? 0);
      setDuracion(p.getDuration() ?? 0);
    }, 500);
    return () => clearInterval(t);
  }, [sonando]);

  const buscar = useCallback((segundos) => {
    const p = playerRef.current;
    if (!p?.seekTo) return;
    const d = p.getDuration?.() ?? 0;
    const destino = Math.max(0, Math.min(segundos, d || segundos));
    p.seekTo(destino, true);
    setTiempo(destino);
  }, []);

  const saltar = useCallback(
    (delta) => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      buscar((p.getCurrentTime() ?? 0) + delta);
    },
    [buscar]
  );

  const reiniciar = useCallback(() => buscar(0), [buscar]);

  // `opciones.autoplay = false` carga el video CUEADO (pausado) en vez de
  // arrancar a sonar solo — lo usa la restauración de sesión (App.jsx) para
  // dejar todo listo en el punto exacto donde quedó sin reproducir nada sin
  // que el usuario lo haya pedido, la misma regla que ya rige abrir un modo.
  // `opciones.segundos` posiciona ahí de una, sin un seekTo aparte.
  const reproducir = useCallback((videoId, opciones) => {
    if (!videoId) return;
    const autoplay = opciones?.autoplay ?? true;
    const segundos = opciones?.segundos ?? 0;
    // El efecto en App.jsx que llama a esto puede re-ejecutarse sin que el
    // track realmente haya cambiado (una asignacion de estado ajena —
    // marcar "me gusta" al track que suena, por ejemplo — puede disparar un
    // re-render que re-entra a este efecto). Sin esta guarda, reproducir()
    // vuelve a llamar loadVideoById() con el MISMO id y YouTube reinicia el
    // video desde 0, cortando la reproduccion sin que el usuario haya
    // pedido nada. Volver a llamar "reproducir" con el video que ya esta
    // sonando debe ser un no-op — es una garantia razonable del propio
    // reproductor, no un parche para un caso puntual. reiniciar()/buscar(0)
    // siguen funcionando igual: usan seekTo, no pasan por aca.
    if (videoActualRef.current === videoId) return;
    videoActualRef.current = videoId;
    aplicarGananciaDe(videoId);
    // Sin esto la barra de progreso arrastra el tiempo del track anterior hasta
    // que llega el primer tick del intervalo.
    setTiempo(segundos);
    setDuracion(0);
    if (!listoRef.current) {
      pendienteRef.current = { videoId, autoplay, segundos };
      return;
    }
    // El vigía se arma solo cuando se pidió que suene. Con autoplay=false
    // (restauración de sesión) el player queda cueado y quieto A PROPÓSITO:
    // ahí "no pasa nada" es lo correcto, no un fallo que haya que reportar.
    if (autoplay) {
      armarVigia(videoId);
      playerRef.current?.loadVideoById({ videoId, startSeconds: segundos });
    } else {
      playerRef.current?.cueVideoById({ videoId, startSeconds: segundos });
    }
  }, [armarVigia, aplicarGananciaDe]);

  const alternarPausa = useCallback(() => {
    const p = playerRef.current;
    if (!p?.getPlayerState) return;
    if (p.getPlayerState() === window.YT.PlayerState.PLAYING) p.pauseVideo();
    else p.playVideo();
  }, []);

  // Distinto de alternarPausa (que alterna): esto SIEMPRE pausa. Hace falta para
  // cuando la cola queda vacia (un modo sin tracks) — sin una forma de detener
  // explicita, el track anterior sigue sonando y la barra de controles desaparece
  // con el, dejando la musica sonando sin ningun control en pantalla.
  const pausar = useCallback(() => {
    playerRef.current?.pauseVideo?.();
  }, []);

  // iOS bloquea setVolume() a nivel de plataforma (el volumen ahi es solo por
  // hardware) — la UI que consume esto tiene que ocultar el control en iOS en
  // vez de mostrar un slider que no hace nada. Ver App.jsx.
  const cambiarVolumen = useCallback((v) => {
    setVolumenState(v);
    guardarVolumen(v);
    if (v > 0) volumenAnteriorRef.current = v;
    volumenUsuarioRef.current = v;
    if (!listoRef.current) {
      volumenPendienteRef.current = v;
      return;
    }
    playerRef.current?.setVolume?.(volumenParaPlayer());
  }, []);

  const alternarSilencio = useCallback(() => {
    cambiarVolumen(volumen > 0 ? 0 : volumenAnteriorRef.current || 100);
  }, [volumen, cambiarVolumen]);

  // Temporizador para dormir: {minutos} o {alFinal: true}; null lo apaga.
  // Mismo contrato que el reproductor nativo (que lo lleva en el servicio).
  const [temporizador, setTemporizador] = useState(null);
  const alFinalRef = useRef(false);
  const relojTemporizadorRef = useRef(null);
  const fijarTemporizador = useCallback((opcion) => {
    clearTimeout(relojTemporizadorRef.current);
    alFinalRef.current = !!opcion?.alFinal;
    if (opcion?.minutos > 0) {
      const finMs = Date.now() + opcion.minutos * 60_000;
      relojTemporizadorRef.current = setTimeout(() => {
        playerRef.current?.pauseVideo?.();
        setTemporizador(null);
      }, opcion.minutos * 60_000);
      setTemporizador({ finMs, alFinal: false });
    } else {
      setTemporizador(opcion?.alFinal ? { alFinal: true } : null);
    }
  }, []);
  useEffect(() => () => clearTimeout(relojTemporizadorRef.current), []);

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
    volumen,
    cambiarVolumen,
    alternarSilencio,
    recrearPlayer,
    // Solo el reproductor nativo tiene cola propia; el iframe no hace nada.
    precargarSiguientes: noop,
    listo,
    sonando,
    tiempo,
    duracion,
  };
}
