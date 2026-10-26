import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { MODO_LOCAL } from './config/modo.js';
import { Capacitor } from '@capacitor/core';
import { useReproductor, hayColaNativa } from './useReproductor.js';
import { obtenerOnboardingVisto, marcarOnboardingVisto } from './data/onboarding.js';
import { avisoInfinito, avisoFavoritas, avisoModo, avisoRadio } from './movil/avisos.js';
import { debeMostrarAvisoImportar } from '../scripts/lib/aviso-importar.mjs';
import { traducirError } from '../scripts/lib/traducir-error.mjs';
import { registrarReproduccion, obtenerHistorial, obtenerUltimosModos, guardarUltimoModoUsado } from './data/sesion.js';
import {
  asignarEje,
  quitarModo as quitarModoApi,
  unirModos as unirModosApi,
  obtenerMetadata,
  obtenerOverrides,
  obtenerFavoritos,
  guardarFavoritoArtista,
  guardarFavoritoAlbum,
  guardarOverride as guardarOverrideApi,
  quitarTrack,
  guardarColeccion,
  guardarEjes as guardarEjesApi,
  cargarDatosLocales,
} from './data/biblioteca.js';
import { obtenerArtistasFotos, obtenerAlbum, obtenerArtista } from './data/catalogo.js';
import { agregarTrack as agregarTrackApi, agregarAlbum as agregarAlbumApi } from './data/alta.js';
import { importarTuneMyMusic as importarTuneMyMusicApi, importarMusicaLocal as importarMusicaLocalApi, obtenerEsDemo } from './data/administracion.js';
import { actualizarFuentes } from './data/fuentes.js';
import { descubrirModos, obtenerAvisoModosNuevos, limpiarAvisoModosNuevos } from './data/modos.js';
import { suscribirseACanalEnriquecimiento } from './data/enriquecimiento.js';
import {
  suscribirseACanalReproduccion,
  avisarReproduciendo,
  resolverVideoId,
  descartarVideo,
  buscarExterno,
  obtenerRadio,
} from './data/reproduccion.js';
import { colorDePortada } from './colorPortada.js';
import { barajarSeparandoArtistas, ultimaVezDeHistorial } from './movil/barajar.js';
import { elegirContinuacion } from './movil/continuacion.js';
import { camposDeMoodNuevo } from './movil/modos.js';
import { agregarAlFinal, insertarDespues } from './movil/insertarCola.js';
import { repeticionSeCancela } from './movil/repetirUna.js';
import { encadenadaConAnterior } from './data/fundido.js';
import { filtrarNoMeGusta } from './movil/noMeGusta.js';
import { useNoMeGusta } from './movil/useNoMeGusta.js';
import { conPortadasPropias } from './movil/portadaEje.js';
import { leerContinuar, EVENTO_CONTINUAR } from './data/continuar-al-acabar.js';
import { formatearTitulo, colorDeEje } from './ui/formato.js';
import ShellMovil from './movil/ShellMovil.jsx';
import { useImportarOrganizar } from './movil/useImportarOrganizar.js';
import { indiceDePista } from './data/sincronizar-nativo.js';
import { anotarSiDisponibleEnPC, esIdLocal, idLocal, idReproductor, tieneArchivoLocal, trackIdDeIdLocal } from './data/reproduccion-locales.js';
import { useEsMovil } from './movil/useEsMovil.js';
import { iniciarSinConexion, useSinConexion, enviarSeleccion } from './data/sin-conexion-nativo.js';
import {
  seleccionarSinConexion, filtrarDisponibles, filtrarCola, restaurarCola, claveSeleccion,
  leerAjustesSinConexion, EVENTO_AJUSTES as EVENTO_AJUSTES_SIN_CONEXION,
} from './data/sin-conexion.js';
import { EVENTO_ARCHIVOS_LOCALES } from './data/archivos-locales.js';
import { refrescarBibliotecaLocal } from './data/refrescar-biblioteca-local.js';
import { crearSeguimientoUso } from './organizador/seguimiento-uso.js';
import ejesIniciales from '../data/ejes.json';
import biblioteca from '../data/biblioteca.json';
import { restaurarSesion, separarArtistas, migrarPersistenciaLocal, fotoEsValida, guardarSesion, EditorEjes, Ayuda, Escribinos, AcercaDe, SincronizacionMovil } from './escritorio/compartido.jsx';

const AppEscritorio = lazy(() => import('./escritorio/AppEscritorio.jsx'));

export default function App() {
  const [ejes, setEjes] = useState(ejesIniciales.ejes);
  // Estado, no una constante de modulo: "Sin clasificar" necesita que reasignar
  // un track a mano se refleje YA en el badge del header, en los conteos por eje
  // y en la propia lista (sin esto, esas tres cosas mostraban datos de hace horas
  // hasta recargar la pagina, aunque el disco ya tuviera el dato correcto).
  const [tracks, setTracks] = useState(() => biblioteca.tracks);
  const [vista, setVista] = useState('modos');
  const [verLetras, setVerLetras] = useState(false);
  // Pantallas estrechas (app Android, navegador del móvil): interfaz móvil propia.
  const esMovil = useEsMovil();
  const cerrarLetras = useCallback(() => setVerLetras(false), []);

  // Android: QR de "Sincronizar con el PC" escaneado con la cámara -> la app se
  // abre con musicsippi://sincronizar?d=… y sincroniza sola (aviso arriba).
  const [avisoSincronizacion, setAvisoSincronizacion] = useState(null);

  // Móvil: lo que manda es lo guardado en el dispositivo (incluye los cambios
  // hechos en el móvil); el import estático solo pinta el primer frame.
  const [bibliotecaCargada, setBibliotecaCargada] = useState(false);
  useEffect(() => {
    cargarDatosLocales()
      .then((d) => {
        if (!d) return;
        setTracks(d.tracks);
        setEjes(d.ejes);
      })
      .catch((e) => console.warn('[datos-locales]', e))
      .finally(() => setBibliotecaCargada(true));
  }, []);

  // Cabecera sticky que se encoge al bajar y vuelve a su alto al subir (ver
  // docs/superpowers/specs/2026-09-15-shell-scroll-unico-design.md, revisión
  // "header auto-oculto"). `body` volvió a ser el único que scrollea —
  // encogerla con `height` (no `transform`) hace que sea una caja normal en
  // el flujo del documento: al llegar a 0 el contenido de abajo sube solo,
  // sin dejar un hueco vacío como pasaría con position:fixed.
  const cabeceraOuterRef = useRef(null);
  const cabeceraInnerRef = useRef(null);
  const alturaCabeceraRef = useRef(0);
  const cabeceraVisibleRef = useRef(true);
  const ultimoScrollY = useRef(0);
  // La interfaz de escritorio llega en un chunk perezoso: la cabecera no existe en el
  // primer render de App, así que se mide cuando AppEscritorio avisa que se montó.
  const [escritorioMontado, setEscritorioMontado] = useState(false);

  // Escribe el alto directo en el DOM (nodo.style + la variable CSS), sin
  // pasar por React state/setState. Probado en vivo (app instalada con la
  // biblioteca real, no la demo chica): aunque ya no hay transition CSS,
  // el camino scroll -> setState -> re-render -> commit sigue quedando al
  // menos un frame detrás del scroll real, y con más DOM real ese
  // desfasaje crece — eso es lo que se ve como salto/inestabilidad. Al
  // mutar el DOM ACA, en el mismo tick del evento de scroll, no hay ciclo
  // de render de por medio que pueda quedar atrás.
  function aplicarAlturaCabecera() {
    const nodo = cabeceraOuterRef.current;
    if (!nodo) return;
    const alto = cabeceraVisibleRef.current ? alturaCabeceraRef.current : 0;
    nodo.style.height = `${alto}px`;
    document.documentElement.style.setProperty('--cabecera-alto-actual', `${alto}px`);
  }

  useLayoutEffect(() => {
    const nodo = cabeceraInnerRef.current;
    if (!nodo) return;
    const medir = () => {
      alturaCabeceraRef.current = nodo.offsetHeight;
      aplicarAlturaCabecera();
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [escritorioMontado]);

  // Umbral de 8px: sin él, el ruido normal de la rueda del mouse (variaciones
  // de 1-2px por evento) hace que la cabecera parpadee entre mostrarse y
  // esconderse en cada tick de scroll. Debajo de 40px del top siempre se
  // muestra — evita que arranque escondida si la página ya cargó con algo
  // de scroll restaurado (ej. al volver de otra vista).
  useEffect(() => {
    const UMBRAL = 8;
    function alScrollear() {
      const y = window.scrollY;
      let visible = cabeceraVisibleRef.current;
      if (y < 40) visible = true;
      else if (y > ultimoScrollY.current + UMBRAL) visible = false;
      else if (y < ultimoScrollY.current - UMBRAL) visible = true;
      ultimoScrollY.current = y;
      if (visible !== cabeceraVisibleRef.current) {
        cabeceraVisibleRef.current = visible;
        aplicarAlturaCabecera();
      }
    }
    window.addEventListener('scroll', alScrollear, { passive: true });
    return () => window.removeEventListener('scroll', alScrollear);
  }, []);

  // `ejeActivo` es el modo de lo que REALMENTE está sonando (dueño de `cola`);
  // `ejeVista` es el modo que se está mirando en pantalla. Antes eran la misma
  // cosa y por eso simplemente abrir un modo pisaba la cola y cortaba lo que
  // sonaba de otro lado — ver el comentario en `entrarAModo`.
  const [ejeActivo, setEjeActivo] = useState(() => restaurarSesion()?.ejeActivo ?? null);
  const [ejeVista, setEjeVista] = useState(() => restaurarSesion()?.ejeVista ?? null);
  const [cola, setCola] = useState(() => restaurarSesion()?.cola ?? []);
  const [indice, setIndice] = useState(() => restaurarSesion()?.indice ?? 0);
  const [estadoResolucion, setEstadoResolucion] = useState(null);
  const [repetir, setRepetir] = useState(() => restaurarSesion()?.repetir ?? false);
  // Reproducción automática: ids de la cola que añadió la app (separador en la cola) y, si
  // suena la radio de un modo, el id de ese modo (la renovación mezcla ~30 % de fuera).
  const [colaAuto, setColaAuto] = useState(() => new Set());
  const [radioModo, setRadioModo] = useState(null);
  const [continuar, setContinuar] = useState(() => leerContinuar());
  useEffect(() => {
    const alCambiar = () => setContinuar(leerContinuar());
    window.addEventListener(EVENTO_CONTINUAR, alCambiar);
    return () => window.removeEventListener(EVENTO_CONTINUAR, alCambiar);
  }, []);
  const [aleatorio, setAleatorio] = useState(() => restaurarSesion()?.aleatorio ?? true);
  const [busqueda, setBusqueda] = useState('');
  const [modoBuscador, setModoBuscador] = useState('texto');
  // Bug reportado: navegar a Home/otra sección dejaba el texto pegado en la
  // barra de búsqueda (visible arriba en TODA la app, no solo en Buscador),
  // sin forma de "reactivarla" sin antes borrarlo a mano. Se limpia solo al
  // SALIR de la vista 'buscar' — no en cada cambio de vista (eso rompería
  // poder escribir y ver resultados mientras vista ya es 'buscar').
  const vistaAnteriorRef = useRef(vista);
  useEffect(() => {
    if (vistaAnteriorRef.current === 'buscar' && vista !== 'buscar') {
      setBusqueda('');
    }
    vistaAnteriorRef.current = vista;
  }, [vista]);
  const [ultimosModosIds, setUltimosModosIds] = useState([]);
  // Pestaña de Configuración, levantada acá (no local a Administrar) para que
  // el acceso directo "Ayuda" del header pueda forzar esa pestaña puntual
  // aunque Administrar ya esté montado en otra (ej. Backup) — con estado
  // local, entrar de nuevo a la misma vista no reiniciaba la pestaña.
  const [tabConfiguracion, setTabConfiguracion] = useState('modos');
  const [historial, setHistorial] = useState([]);
  // Aleatorio con memoria: lo que lleva más tiempo sin sonar sale antes (ver movil/barajar.js).
  const historialRef = useRef(historial);
  historialRef.current = historial;
  const barajar = (lista) => barajarSeparandoArtistas(lista, ultimaVezDeHistorial(historialRef.current));

  // Onboarding: se muestra hasta que se cierra una vez, compartido entre
  // dispositivos (server, no localStorage — antes volvía a aparecer en cada
  // apertura de la app empaquetada, puerto interno al azar en cada arranque
  // = origen distinto = storage vacío). Arranca en `false` (no `true`) hasta
  // confirmar contra el servidor, para no destellar el modal en cada carga
  // mientras se espera la respuesta.
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false);
  useEffect(() => {
    obtenerOnboardingVisto()
      .then(visto => setMostrarOnboarding(!visto))
      .catch(() => {});
  }, []);
  function cerrarOnboarding() {
    setMostrarOnboarding(false);
    marcarOnboardingVisto().catch(() => {});
  }
  // Cada paso del tour de bienvenida vive en una pantalla distinta — esto es
  // lo que le permite al tour navegar solo antes de señalar cada elemento.
  function irADestinoTour(destino) {
    if (destino === 'cargar') {
      setTabConfiguracion('cargar');
      setVista('administrar');
    } else {
      setVista('modos');
    }
  }

  // Aviso de "importá tu música" para quien todavía solo tiene las
  // canciones de siembra (ver spec 2026-09-09-aviso-importar-musica-propia-design.md
  // y su actualización del 2026-09-11: sin botón de descartar — el usuario pidió
  // que quede fijo, porque un cierre accidental durante una sesión de
  // prueba lo dejaba oculto para siempre sin que hubiese música real
  // todavía). No hay estado de "descartado": la única condición es la
  // biblioteca (calculada sobre `tracks`, más abajo).
  //
  // useMemo, no un const plano: App() re-renderiza cada 500ms mientras suena
  // música (el timer de useYouTube actualiza tiempo/duración) — sin esto,
  // debeMostrarAvisoImportar recorrería tracks entero (dos .some(), miles de
  // tracks en una biblioteca real) dos veces por segundo, para siempre,
  // incluso para alguien que ya importó su música real hace rato.
  const mostrarAvisoImportar = useMemo(() => debeMostrarAvisoImportar(tracks), [tracks]);
  function irAImportarMusica() {
    setTabConfiguracion('cargar');
    setVista('administrar');
  }

  // Solo true en el build de demo (instalador aparte, con canciones de
  // muestra) — ver /api/es-demo en vite.config.js. Agrega un paso extra al
  // onboarding avisando que esas canciones son de ejemplo y cómo borrarlas;
  // en la app real esto nunca se pide ni se muestra.
  const [esDemo, setEsDemo] = useState(false);
  useEffect(() => {
    obtenerEsDemo()
      .then(setEsDemo)
      .catch(() => {});
  }, []);

  // Pantalla de revisión de modos: hoy el único disparador es el banner
  // avisoModosNuevos (más abajo), para imports hechos por terminal (npm run
  // importar). Un import hecho desde la app (CSV o mp3 local) ya NO dispara
  // esto — el descubrimiento y la creación de modos para esos tracks
  // quedan en manos del enriquecimiento automático en segundo plano (ver
  // docs/superpowers/specs/2026-09-11-quitar-revision-modos-post-import-design.md).
  // Se guarda acá el resultado sin aplicar nada todavía — recién al
  // confirmar desde PantallaRevisionModos se escriben ejes.json/biblioteca.json.
  // null = no hay nada que revisar; el objeto entero de /api/descubrir-modos
  // en caso contrario.
  const [revisionModos, setRevisionModos] = useState(null);

  // Aviso de música nueva sin modo (Tarea 18: detección incremental). A
  // diferencia de la revisión de arriba (que se dispara EN VIVO tras un
  // import por tunemymusic.com, con la app ya abierta), `npm run importar`
  // corre por fuera del navegador — no hay pantalla a la que avisarle. Deja
  // un flag en disco (data/aviso-modos-nuevos.json) que se chequea una sola
  // vez acá, al montar. null = no hay nada que ofrecer; en caso contrario,
  // `{cantidad, trackIds}` tal cual lo escribió el importador.
  const [avisoModosNuevos, setAvisoModosNuevos] = useState(null);
  useEffect(() => {
    obtenerAvisoModosNuevos()
      .then((aviso) => setAvisoModosNuevos(aviso))
      .catch(() => {});
  }, []);

  // Aceptar: dispara el descubrimiento filtrado SOLO a los tracks que el
  // importador marcó sin modo (no re-propone modos ya existentes) y abre la
  // misma PantallaRevisionModos de la Tarea 16. El aviso se limpia recién
  // cuando descubrirModos resuelve bien — si falla (red caída), el banner y
  // el flag en disco quedan como estaban para poder reintentar, en vez de
  // perder el aviso en silencio sin haber llegado a mostrar nada.
  function aceptarAvisoModosNuevos() {
    const trackIds = avisoModosNuevos?.trackIds ?? [];
    descubrirModos(trackIds)
      .then((resultado) => {
        setAvisoModosNuevos(null);
        limpiarAvisoModosNuevos();
        setRevisionModos(resultado);
      })
      .catch((e) => window.alert(`No se pudo revisar: ${traducirError(e)}`));
  }
  function descartarAvisoModosNuevos() {
    setAvisoModosNuevos(null);
    limpiarAvisoModosNuevos();
  }

  // Clasificación manual asistida (Tarea 17): a diferencia de la vieja
  // pantalla dedicada de "Para clasificar" (se sacó por baja señal — ver el
  // comentario junto a pendientesDeClasificar más abajo), esto NUNCA se abre
  // solo — solo on-demand, desde el botón "Clasificar ahora" en Configuración
  // → Administrar, junto al contador pasivo. Booleano simple: la lista de
  // tracks a revisar se deriva en cada render de `tracks` (siempre al día).
  const [clasificacionAsistida, setClasificacionAsistida] = useState(false);

  // Chequeo automático de fuentes.json (vocabulario/umbrales/transversales)
  // contra el repo público remoto, como mucho una vez por día. localStorage
  // (no servidor) a propósito: es solo un throttle de "no golpear la red de
  // nuevo hoy", no un dato que importe compartir entre dispositivos. Si el
  // repo remoto no existe todavía o la red falla, actualizarFuentes()
  // resuelve igual con {aplicado:false, errores:[...]} — el .catch() de acá
  // es solo por si el propio fetch rechaza (red caída), para que nunca
  // rompa el arranque de la app ni deje un error visible al usuario.
  useEffect(() => {
    const ULTIMA_CLAVE = 'musicsippi-ultima-actualizacion-fuentes';
    let ultima = null;
    try {
      ultima = localStorage.getItem(ULTIMA_CLAVE);
    } catch {
      // localStorage puede no estar disponible (modo privado, etc.) — sin
      // esto, seguiría reintentando en cada carga, que es aceptable pero
      // no debe romper nada.
    }
    const unDiaMs = 24 * 60 * 60 * 1000;
    if (ultima && Date.now() - Number(ultima) < unDiaMs) return;
    actualizarFuentes()
      .catch(() => {})
      .finally(() => {
        try {
          localStorage.setItem(ULTIMA_CLAVE, String(Date.now()));
        } catch {
          // ver comentario de arriba
        }
      });
  }, []);

  // Un eje borrado de verdad (no desactivado) deja atrás entradas de
  // historial que siguen apuntando a un ejeId fantasma — el ranking de
  // "Modos" en Recientes las mostraba deshabilitadas para siempre (ver
  // rankingModos en Historial). Se limpia la referencia acá, apenas cambian
  // los ejes, y se persiste: la reproducción en sí queda (sigue contando
  // para "Reciente"/"Más sonados"), solo se borra su pertenencia a un modo
  // que ya no existe.
  // Corrección solo en memoria (ya no se re-persiste acá): historial vive en
  // el servidor ahora, y escribir el array completo de vuelta reintroduciría
  // el mismo problema de "dos dispositivos se pisan el uno al otro" que
  // /api/historial evita a propósito guardando por evento. La referencia
  // rota vuelve a limpiarse sola en cada carga, así que dejarla sin
  // persistir acá no pierde nada.
  useEffect(() => {
    const idsValidos = new Set(ejes.map((e) => e.id));
    setHistorial((actual) => {
      let cambio = false;
      const limpio = actual.map((h) => {
        if (!h.ejeId || idsValidos.has(h.ejeId)) return h;
        cambio = true;
        const { ejeId, ejeNombre, ...resto } = h;
        return resto;
      });
      return cambio ? limpio : actual;
    });
  }, [ejes]);
  // { tracks: {trackId: {album, anio, duracionMs, artistaMbid}}, artistas: {mbid: {nombre, generos}} }
  const [metadataMB, setMetadataMB] = useState({ tracks: {}, artistas: {} });
  // Correcciones manuales por track: { trackId: {titulo?, artista?, album?, anio?} }.
  // Capa separada de biblioteca.json y metadata-musicbrainz.json a propósito —
  // ver el comentario en /api/override (vite.config.js): así una reimportación
  // o un reintento del enriquecimiento no pisa lo que el usuario corrigió a mano.
  const [overrides, setOverrides] = useState({});
  const [favoritos, setFavoritos] = useState({ artistas: [], albumes: [] });
  // «No me gusta» (móvil): canciones y artistas que no se recomiendan.
  const { marcas: noMeGusta, marcar: marcarNoMeGusta, quitar: quitarNoMeGusta } = useNoMeGusta();

  // El primer track de una sesión restaurada arranca CARGADO pero en pausa,
  // en el segundo exacto donde quedó — nunca arrancando a sonar solo. Es la
  // misma regla que ya rige "abrir un modo": nada suena sin un gesto
  // explícito. Se compara por trackId (no se limpia con una bandera one-shot)
  // porque en desarrollo el efecto de resolución se re-ejecuta dos veces
  // (StrictMode) para el mismo track — limpiarlo en la primera pasada haría
  // que la segunda ya no lo viera y arrancara a sonar igual. Se vacía solo
  // cuando `trackActual` cambia a otro id (avance real, no un re-render).
  const restaurarRef = useRef(
    (() => {
      const s = restaurarSesion();
      const t = s?.cola[s.indice];
      return t ? { trackId: t.id, segundos: s.tiempo } : null;
    })()
  );

  const trackActual = cola[indice] ?? null;
  // `cola` guarda una FOTO del track (tomada al entrar al modo), no una
  // referencia viva a `tracks`. Mientras eso vale para casi todo (título,
  // artista, id no cambian), `ejes` sí puede cambiar en caliente: marcar
  // "me gusta" al track que está SONANDO — el único caso donde reasignar
  // ejes sí ocurre sobre un track activo en la cola — actualizaba `tracks`
  // pero la barra seguía leyendo la foto vieja y el corazón no se llenaba,
  // aunque el POST ya hubiera guardado en disco. Se resuelve `ejes` en vivo
  // sin tocar la identidad de `trackActual` (de la que depende el efecto de
  // resolución de YouTube: cambiarla ahí re-dispararía la búsqueda/carga).
  const ejesDelTrackActual = trackActual
    ? (tracks.find((t) => t.id === trackActual.id)?.ejes ?? trackActual.ejes)
    : [];

  const {
    contenedorRef,
    reproducir,
    alternarPausa,
    pausar,
    buscar,
    saltar,
    reiniciar,
    fijarRepeticion, // solo Android nativo (repeat-one del player); undefined en web
    volumen,
    cambiarVolumen,
    alternarSilencio,
    recrearPlayer,
    precargarSiguientes,
    sonando,
    tiempo,
    duracion,
    temporizador,
    fijarTemporizador,
  } = useReproductor(
    () => (repetir ? reiniciar() : siguiente()),
    (fallo) => manejarVideoFallido(fallo),
    // Android: el reproductor nativo ya pasó solo a la pista `videoId` de su
    // cola (fin de canción o botón ⏭ con la pantalla bloqueada). Aquí solo se
    // avanza el índice a la pista que corresponde, SIN recargar: el
    // reproducir(videoId) que dispara el efecto de resolución es idempotente.
    (videoId) => {
      // También lo llama el reproductor al volver a primer plano o al reabrirse el WebView, para adoptar
      // la pista que el nativo lleva (sin recargarla). Si es de la cola, la sesión restaurada ya no vale.
      const idsDe = (t) => [idReproductor(t, videoIdResueltoRef.current), idLocal(t.id)];
      if (indiceDePista(cola, videoId, 0, idsDe) >= 0) restaurarRef.current = null;
      // desde el índice actual: si el evento es de la pista que ya es la actual (p. ej.
      // tras volver atrás con ⏮) el índice no debe saltar a un duplicado posterior.
      setIndice((i) => {
        const j = indiceDePista(cola, videoId, i, idsDe);
        return j >= 0 ? j : i;
      });
    }
  );

  // Candidatos alternativos del track que suena, que manda /api/resolver junto
  // con el elegido. Es un ref y no estado porque solo se lee dentro del
  // manejador de fallo: guardarlo en estado provocaría un render por track sin
  // que cambie nada de lo que se ve.
  const candidatosRef = useRef([]);

  // Aviso de "salté este track". NO se puede usar estadoResolucion para esto:
  // saltar cambia el track, y lo primero que hace el efecto de resolución del
  // siguiente es setEstadoResolucion(null) — o sea que el mensaje se borraría
  // antes de que llegue a verse. Por eso vive aparte y se apaga por tiempo.
  // Cuántas veces se volvió a buscar por track, para no quedar en un bucle de
  // re-resoluciones si YouTube insiste en devolver versiones no reproducibles.
  // Es un Map en un ref (no estado): cambiarlo no debe repintar nada, y su
  // tamaño está acotado por la cantidad de tracks de la biblioteca.
  const intentosRef = useRef(new Map());

  // videoId ya resuelto, por trackId. NO puede vivir solo mutando el track:
  // `tracksVisibles` CLONA todo track que tenga una corrección manual, así que
  // la mutación quedaba en un clon viejo y el original seguía con
  // `youtubeVideoId: null`. Cualquier acción posterior que tocara el estado
  // (marcar un favorito, asignar un modo, editar otra ficha) regeneraba los
  // clones, el track volvía a resolverse EN PLENA REPRODUCCIÓN y, si la
  // búsqueda devolvía otro candidato, el video se recargaba desde 0. Un Map en
  // un ref sobrevive a los clones y a los re-renders, y cambiarlo no repinta.
  const videoIdResueltoRef = useRef(new Map());

  // Android: canciones cuyo archivo local ya falló en esta sesión (permiso revocado, archivo
  // borrado): se siguen reproduciendo por YouTube. El contador relanza la resolución del actual.
  const localesFallidasRef = useRef(new Set());
  const [reintentoResolucion, setReintentoResolucion] = useState(0);

  const [avisoSalto, setAvisoSalto] = useState(null);
  useEffect(() => {
    if (!avisoSalto) return;
    const t = setTimeout(() => setAvisoSalto(null), 6000);
    return () => clearTimeout(t);
  }, [avisoSalto]);

  // Una sola sesión reproduciendo a la vez, aunque estén abiertos varios
  // navegadores distintos en la misma máquina (no solo pestañas del mismo
  // navegador — por eso la coordinación vive en el servidor local, no en
  // localStorage/BroadcastChannel, que son por-navegador). sesionId nuevo en
  // cada carga de página a propósito: cada pestaña/recarga es una sesión
  // distinta para este propósito.
  //
  // Math.random en vez de crypto.randomUUID: randomUUID exige "contexto
  // seguro" (HTTPS o localhost) y no existe al entrar por IP simple
  // (http://100.x.x.x, LAN o Tailscale) — justo el caso de uso desde el
  // celular. No hace falta ser criptográficamente fuerte para este id.
  const sesionIdRef = useRef(Math.random().toString(36).slice(2) + Date.now().toString(36));

  useEffect(() => {
    return suscribirseACanalReproduccion(({ sesionId }) => {
      if (sesionId !== sesionIdRef.current) pausar();
    });
  }, [pausar]);

  useEffect(() => {
    if (!sonando) return;
    avisarReproduciendo(sesionIdRef.current).catch(() => {});
  }, [sonando]);

  // Progreso del enriquecimiento automático en background (spec
  // 2026-09-08-enriquecimiento-automatico-design.md) — aviso pasivo en
  // Configuración, nunca un elemento que "moleste solo" en Home.
  const [estadoEnriquecimiento, setEstadoEnriquecimiento] = useState({
    activo: false,
    etapa: null,
    procesados: 0,
    total: 0,
  });
  useEffect(() => {
    return suscribirseACanalEnriquecimiento(setEstadoEnriquecimiento);
  }, []);

  // `tracks`/`ejes` arrancan de un import estático (leído una sola vez al
  // cargar la app) y el enriquecimiento en background reescribe esos mismos
  // archivos en disco todo el tiempo — sin esto, una ventana ya abierta se
  // queda mostrando clasificación vieja (ej. "1755 sin clasificar") aunque el
  // ciclo ya haya terminado y el archivo real diga 1324. Al pasar de
  // `activo: true` a `false` (el ciclo recién terminó), se pide el estado
  // fresco una sola vez y se reemplaza en memoria.
  const activoAnteriorRef = useRef(false);
  useEffect(() => {
    const eraActivo = activoAnteriorRef.current;
    activoAnteriorRef.current = estadoEnriquecimiento.activo;
    if (!eraActivo || estadoEnriquecimiento.activo) return;
    fetch('/api/biblioteca-fresca')
      .then((r) => r.json())
      .then((j) => {
        setTracks(j.tracks);
        setEjes(j.ejes);
      })
      .catch(() => {});
  }, [estadoEnriquecimiento.activo]);

  // Cierra cualquier <details> abierto (la ficha ⓘ, el menú "..." de listas
  // en cada fila) al hacer clic afuera — sin esto, <details>/<summary>
  // nativo solo se cierra volviendo a tocar el mismo botón, lo que estorba
  // la navegación cuando queda abierto de una interacción anterior. Un solo
  // listener acá cubre TODOS los desplegables de la app (son muchas
  // instancias — una por fila de track — así que no tiene sentido
  // replicarlo componente por componente). Clickear el propio summary sigue
  // funcionando normal: el click cae DENTRO de ese <details>, así que este
  // listener no lo toca y el toggle nativo hace lo suyo.
  useEffect(() => {
    function alClickFuera(e) {
      // `composedPath()`, no `det.contains(e.target)`: un clic en un botón
      // DENTRO del panel (ej. "Corregir datos") puede hacer que React
      // reemplace ese botón por otro contenido (el formulario) antes de que
      // este listener corra — en ese momento `e.target` ya es un nodo
      // desmontado, que ningún `.contains()` va a encontrar, así que el
      // <details> se cerraba solo por editar. `composedPath()` es la ruta
      // real del clic tal como era AL HACER CLIC, no se ve afectada por lo
      // que React haga con el DOM después.
      const camino = e.composedPath();
      document.querySelectorAll('details[open]').forEach((det) => {
        if (!camino.includes(det)) det.removeAttribute('open');
      });
    }
    document.addEventListener('click', alClickFuera);
    return () => document.removeEventListener('click', alClickFuera);
  }, []);

  const siguiente = useCallback(() => {
    if (cola.length === 0) return;
    if (cola.length === 1) {
      // Con un solo track no hay adonde "avanzar": setIndice(0) cuando el indice
      // ya es 0 no cambia de valor, React hace bail-out del render y el efecto
      // que dispara la reproduccion (dependiente de la identidad de trackActual)
      // nunca se vuelve a ejecutar. La cancion se queda muda al terminar.
      // reiniciar() (seekTo a 0) si dispara playback de nuevo — es el mismo
      // mecanismo que ya usa el modo "repetir", que sabemos que funciona.
      reiniciar();
      return;
    }
    setIndice((i) => (i + 1) % cola.length);
  }, [cola.length, reiniciar]);

  // Atajos de teclado para el reproductor — pedido explícito. Se ignoran
  // mientras se está escribiendo en cualquier campo (buscador, nombre de
  // lista, edición de ficha, etc.): sin este chequeo, tocar espacio para
  // escribir "hola mundo" pausaría la música en cada palabra.
  useEffect(() => {
    function alTocarTecla(e) {
      if (!trackActual) return;
      // Teclas multimedia (teclados con Play/Pausa/Siguiente/Anterior
      // dedicados) — pedido explícito. No pasan por Media Session porque el
      // audio suena adentro del iframe de YouTube (cross-origin): el SO le
      // da el control a ESE frame, no a esta página, así que Media Session
      // nunca las recibe acá. Pero el navegador SÍ las manda como
      // KeyboardEvent normal con estos códigos — funciona mientras la
      // pestaña esté enfocada, sin el chequeo de "escribiendo" de abajo:
      // no son teclas de texto, no hay nada que puedan interferir.
      if (e.code === 'MediaPlayPause') {
        e.preventDefault();
        alternarPausa();
        return;
      }
      if (e.code === 'MediaTrackNext') {
        e.preventDefault();
        siguiente();
        return;
      }
      if (e.code === 'MediaTrackPrevious') {
        e.preventDefault();
        setIndice((i) => Math.max(0, i - 1));
        return;
      }
      const activo = document.activeElement;
      const escribiendo =
        activo &&
        (activo.tagName === 'INPUT' ||
          activo.tagName === 'TEXTAREA' ||
          activo.tagName === 'SELECT' ||
          activo.isContentEditable);
      if (escribiendo) return;
      if (e.key === ' ') {
        e.preventDefault(); // sin esto, espacio también scrollea la página
        alternarPausa();
      } else if (e.key === 'ArrowRight') {
        siguiente();
      } else if (e.key === 'ArrowLeft') {
        setIndice((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener('keydown', alTocarTecla);
    return () => window.removeEventListener('keydown', alTocarTecla);
  }, [trackActual, alternarPausa, siguiente]);

  // Si el modo al que se entra no tiene tracks, la cola queda vacia y
  // trackActual pasa a null: la barra de controles se desmonta con el. Sin este
  // efecto, lo que sonaba antes de entrar seguia sonando sin ningun control en
  // pantalla para pararlo.
  useEffect(() => {
    if (!trackActual) pausar();
  }, [trackActual, pausar]);

  // Registra en el historial una sola vez por track NUEVO, no cada vez que
  // este efecto se re-ejecuta (el de resolución puede reintentar contra el
  // mismo track sin que haya cambiado nada real — no querés un historial
  // lleno de la misma canción diez veces por eso). El ref guarda el último
  // id ya anotado, comparado contra trackActual en cada render.
  const ultimoLoggeadoRef = useRef(null);
  useEffect(() => {
    if (!trackActual || ultimoLoggeadoRef.current === trackActual.id) return;
    ultimoLoggeadoRef.current = trackActual.id;
    const entrada = {
      // El id real (no el "album-xxx" de mentira) — así el historial cruza
      // contra la biblioteca igual que metadata-deezer.json.
      trackId: trackActual.trackIdReal ?? trackActual.id,
      // En una radio de modo el origen no tiene id propio: se apunta al modo para las estadísticas.
      ejeId: ejeActivo?.id ?? ejeActivo?.radioDe ?? null,
      ejeNombre: ejeActivo?.nombre ?? null,
      titulo: trackActual.titulo,
      artista: trackActual.artista,
      // Duración (s) si ya se conoce: la usan las estadísticas de tiempo escuchado.
      ...(metadataDe(trackActual.trackIdReal ?? trackActual.id).duracionMs
        ? { duracionS: Math.round(metadataDe(trackActual.trackIdReal ?? trackActual.id).duracionMs / 1000) }
        : {}),
      ts: Date.now(),
    };
    // Optimista: se ve al toque en "Recientes" sin esperar la vuelta del
    // servidor. El POST es best-effort — si falla (offline, servidor
    // reiniciando), no rompe la reproducción; se pierde esa entrada nomás.
    setHistorial((actual) => [entrada, ...actual].slice(0, 10000));
    registrarReproduccion(entrada).catch(() => {});
  }, [trackActual, ejeActivo]);

  // Uso para alimentar estados: de lo que suena desde un chip de «¿Cómo te sientes?» (ejeActivo.estadoId) se
  // mide cuánto se oyó. Al pasar a otra canción: oída > 70 % suma, saltada < 30 % resta (ver senales-estados.js).
  const seguimientoUsoRef = useRef(null);
  seguimientoUsoRef.current ??= crearSeguimientoUso({
    alCerrar: (trackId, estadoId, fraccion) => {
      import('./data/uso-estados-movil.js').then((m) => m.registrarUsoEstadoMovil(trackId, estadoId, fraccion)).catch(() => {});
    },
  });
  useEffect(() => {
    seguimientoUsoRef.current.cambio(trackActual ? (trackActual.trackIdReal ?? trackActual.id) : null, ejeActivo?.estadoId ?? null);
  }, [trackActual, ejeActivo]);
  useEffect(() => {
    seguimientoUsoRef.current.tiempo(tiempo, duracion);
  }, [tiempo, duracion]);

  // Cuenta de tracks por eje. Un track puede estar en varios ejes.
  const conteos = useMemo(() => {
    const m = new Map();
    for (const t of tracks) {
      for (const a of t.ejes) m.set(a.ejeId, (m.get(a.ejeId) ?? 0) + 1);
    }
    return m;
  }, [tracks]);

  // Ya no hay pantalla dedicada de "Para clasificar" (se sacó por baja
  // señal — ver Configuración), pero la app puede seguir agregando tracks
  // que caen en 'sin-clasificar' con el tiempo. Este número es solo un
  // indicador pasivo dentro de Configuración — nunca en el Home, nunca en
  // la barra de navegación global (pedido explícito) — para que no quede
  // invisible del todo si vuelve a hacer falta mirarlo.
  const pendientesDeClasificar = useMemo(
    () => tracks.filter((t) => t.ejes.some((a) => a.ejeId === 'sin-clasificar') && !t.generoSimple).length,
    [tracks]
  );

  // "Más escuchado" real (no solo cuántos tracks tenés guardados) a partir
  // de `historial` — reproducciones recientes en ESTE navegador, no un
  // conteo histórico de toda la vida, pero es la única señal de escucha real
  // que existe hoy (no hay backend de analytics). Ordena "Mis listas", "Por
  // artistas" y el modo destacado del Home.
  const conteoPlaysPorEje = useMemo(() => {
    const m = new Map();
    for (const h of historial) {
      if (!h.ejeId) continue;
      m.set(h.ejeId, (m.get(h.ejeId) ?? 0) + 1);
    }
    return m;
  }, [historial]);


  // `tracks` con título/artista corregidos a mano ya aplicados. Vive acá (no
  // en cada componente que muestra un track) para que TODO lo que agrupa,
  // busca o filtra por artista/título — modos, buscador, sugerencias de
  // clasificación, historial — vea la corrección sin que haga falta tocar
  // cada uno por separado. `tracks` (sin corregir) se conserva para lo que
  // necesita el dato crudo: asignar/reasignar ejes, MenuListas.
  // Escuchar sin conexión (solo Android nativo): estado compartido con el plugin, ids de
  // canciones con archivo local en este móvil y filtrado de lo no reproducible sin red.
  const sinConexion = useSinConexion();
  const { hayRed } = sinConexion;
  const [idsLocales, setIdsLocales] = useState(() => new Set());
  const [historialListo, setHistorialListo] = useState(false);
  const [ajustesSinConexion, setAjustesSinConexion] = useState(0);
  const [cambiosArchivosLocales, setCambiosArchivosLocales] = useState(0);
  const colaAntesDeSinRedRef = useRef(null);
  const ultimaSeleccionRef = useRef('');
  // trackId -> videoId de la caché de resolución (IndexedDB «cacheYoutube»): la mayoría de las
  // canciones no llevan youtubeVideoId en el track, y sin esto la selección sin conexión sale vacía.
  const [videoIdsCache, setVideoIdsCache] = useState(() => new Map());
  const videoIdDeSinConexion = useCallback(
    (t) => t.youtubeVideoId ?? videoIdResueltoRef.current.get(t.id) ?? videoIdsCache.get(t.id) ?? null,
    [videoIdsCache]
  );
  // Con red no se filtra nada (mismas referencias que sin esta función).
  const guardadosFiltro = hayRed ? null : sinConexion.guardados;
  const disponibleSinRed = useCallback(
    (t) => idsLocales.has(t.id) || sinConexion.guardados.has(videoIdDeSinConexion(t)),
    [idsLocales, sinConexion.guardados, videoIdDeSinConexion]
  );

  const tracksVisibles = useMemo(() => {
    const base =
      Object.keys(overrides).length === 0
        ? tracks
        : tracks.map((t) => {
            const ov = overrides[t.id];
            if (!ov || (!ov.titulo && !ov.artista)) return t;
            return { ...t, titulo: ov.titulo || t.titulo, artista: ov.artista || t.artista };
          });
    return guardadosFiltro
      ? filtrarDisponibles(base, { guardados: guardadosFiltro, idsLocales, videoIdDe: videoIdDeSinConexion })
      : base;
  }, [tracks, overrides, guardadosFiltro, idsLocales, videoIdDeSinConexion]);

  // Derivado solo para la UI móvil: nunca va a setTracks ni a lo que se guarda.
  const tracksMovil = useMemo(
    () =>
      guardadosFiltro
        ? filtrarDisponibles(tracks, { guardados: guardadosFiltro, idsLocales, videoIdDe: videoIdDeSinConexion })
        : tracks,
    [tracks, guardadosFiltro, idsLocales, videoIdDeSinConexion]
  );
  const nGuardadas = useMemo(
    () => (hayColaNativa ? tracks.filter(disponibleSinRed).length : 0),
    [tracks, disponibleSinRed]
  );

  useEffect(() => {
    if (hayColaNativa) iniciarSinConexion();
  }, []);

  // trackIds con archivo local en este móvil; se relee al cargar la biblioteca y cuando cambia
  // (sincronizar/importar). Solo se sustituye el Set si cambió su contenido.
  useEffect(() => {
    if (!hayColaNativa || !bibliotecaCargada) return undefined;
    let cancelado = false;
    import('./data/lib/db.js')
      .then(async ({ obtenerTodos }) => {
        const [regs, cacheYt] = await Promise.all([
          obtenerTodos('archivosLocales'),
          obtenerTodos('cacheYoutube').catch(() => []),
        ]);
        if (cancelado) return;
        const nuevos = new Set(regs.filter((r) => r.dispositivo === 'movil' && r.uri).map((r) => r.trackId));
        setIdsLocales((prev) => (prev.size === nuevos.size && [...nuevos].every((id) => prev.has(id)) ? prev : nuevos));
        const mapa = new Map(cacheYt.filter((r) => r?.trackId && r.videoId).map((r) => [r.trackId, r.videoId]));
        setVideoIdsCache((prev) =>
          prev.size === mapa.size && [...mapa].every(([k, v]) => prev.get(k) === v) ? prev : mapa
        );
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [bibliotecaCargada, tracks, cambiosArchivosLocales]);

  useEffect(() => {
    const alCambiar = () => setCambiosArchivosLocales((n) => n + 1);
    window.addEventListener(EVENTO_ARCHIVOS_LOCALES, alCambiar);
    return () => window.removeEventListener(EVENTO_ARCHIVOS_LOCALES, alCambiar);
  }, []);

  useEffect(() => {
    const alCambiar = () => setAjustesSinConexion((n) => n + 1);
    window.addEventListener(EVENTO_AJUSTES_SIN_CONEXION, alCambiar);
    return () => window.removeEventListener(EVENTO_AJUSTES_SIN_CONEXION, alCambiar);
  }, []);

  // Envía al nativo qué guardar: con retardo y solo si la selección o los ajustes cambiaron.
  useEffect(() => {
    if (!hayColaNativa || !bibliotecaCargada || !historialListo) return undefined;
    const espera = setTimeout(() => {
      const { ids, nFavoritas } = seleccionarSinConexion({
        tracks, historial, noMeGusta, idsLocales, videoIdDe: videoIdDeSinConexion, ahora: Date.now(),
      });
      const clave = claveSeleccion(ids, leerAjustesSinConexion());
      if (clave === ultimaSeleccionRef.current) return;
      ultimaSeleccionRef.current = clave;
      enviarSeleccion({ ids, nFavoritas }).catch(() => {
        ultimaSeleccionRef.current = '';
      });
    }, 2000);
    return () => clearTimeout(espera);
  }, [bibliotecaCargada, historialListo, tracks, historial, noMeGusta, idsLocales, sinConexion.guardados, ajustesSinConexion, videoIdDeSinConexion]);

  // Al perder la red, la cola se reduce a lo que suena sin ella (la pista actual se conserva).
  const hayRedAnteriorRef = useRef(true);
  useEffect(() => {
    const habiaRed = hayRedAnteriorRef.current;
    hayRedAnteriorRef.current = hayRed;
    if (hayColaNativa && hayRed && !habiaRed) {
      // Vuelve la red: se repone la cola recortada si el usuario no cambió de cola entre medias.
      const r = restaurarCola(colaAntesDeSinRedRef.current, cola, indice);
      colaAntesDeSinRedRef.current = null;
      if (r) {
        setCola(r.cola);
        setIndice(r.indice);
      }
      return;
    }
    if (!hayColaNativa || !habiaRed || hayRed || cola.length === 0) return;
    const r = filtrarCola(cola, indice, disponibleSinRed);
    if (r.cola.length === cola.length) return;
    colaAntesDeSinRedRef.current = cola;
    setCola(r.cola);
    setIndice(r.indice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayRed]);

  const tracksDe = useCallback(
    (ejeId) => tracksVisibles.filter((t) => t.ejes.some((a) => a.ejeId === ejeId)),
    [tracksVisibles]
  );

  // Tracks del modo que se está MIRANDO (no necesariamente el que suena).
  // Solo tiene sentido para un modo real (con id) — los resultados de
  // búsqueda/artista/historial no tienen una lista "de fondo" separada de
  // la cola misma, así que ahí queda vacío y no se usa.
  const tracksVista = useMemo(
    () => (ejeVista?.id ? tracksDe(ejeVista.id) : []),
    [ejeVista, tracksDe]
  );

  // Créditos que aparecen SOLOS (sin separador alguno) en algún track —
  // la señal que separarArtistas usa para decidir si un "&" es una
  // colaboración real o parte del nombre de una banda. Ver el comentario
  // largo junto a separarArtistas.
  const artistasSolos = useMemo(() => {
    const s = new Set();
    for (const t of tracksVisibles) {
      if (!/\s*·\s*|\s*,\s*|\s+vs\s+/.test(t.artista)) s.add(t.artista.trim().toLowerCase());
    }
    return s;
  }, [tracksVisibles]);

  // Cada artista de una colaboración cuenta para sí mismo, no solo el string
  // completo del crédito — ver separarArtistas. Se calcula una sola vez acá
  // y lo usan tanto el bloque "Por artistas" del Home como la pestaña
  // Artistas del buscador, ordenados distinto según para qué se use.
  const artistasBiblioteca = useMemo(() => {
    const porClave = new Map();
    for (const t of tracksVisibles) {
      for (const nombre of separarArtistas(t.artista, artistasSolos)) {
        const clave = nombre.toLowerCase();
        const entrada = porClave.get(clave) ?? { nombre, cantidad: 0 };
        entrada.cantidad += 1;
        porClave.set(clave, entrada);
      }
    }
    return [...porClave.values()];
  }, [tracksVisibles, artistasSolos]);

  const conteoPlaysPorArtista = useMemo(() => {
    const porId = new Map(tracks.map((t) => [t.id, t]));
    const m = new Map();
    for (const h of historial) {
      const t = porId.get(h.trackId);
      if (!t) continue;
      for (const nombre of separarArtistas(t.artista, artistasSolos)) {
        m.set(nombre, (m.get(nombre) ?? 0) + 1);
      }
    }
    return m;
  }, [historial, tracks, artistasSolos]);

  // "Los que más escucho" primero (no solo los que más tracks tenés
  // guardados) — reproducciones reales como criterio principal, cantidad de
  // tracks como desempate para artistas todavía sin historial.
  const topArtistas = useMemo(
    () =>
      [...artistasBiblioteca]
        .sort((a, b) => {
          const playsA = conteoPlaysPorArtista.get(a.nombre) ?? 0;
          const playsB = conteoPlaysPorArtista.get(b.nombre) ?? 0;
          return playsB - playsA || b.cantidad - a.cantidad;
        })
        .slice(0, 10),
    [artistasBiblioteca, conteoPlaysPorArtista]
  );

  // Persiste una asignacion manual y refleja el resultado real del servidor en
  // el estado local (no lo que la UI esperaba guardar). Ver H3/H7 en la revision:
  // sin validar la respuesta, un track podia "desaparecer" de la app si el
  // servidor rechazaba el pedido y la UI lo sacaba de la lista igual.
  const asignarManual = useCallback(async (trackId, ejeId) => {
    const r = await asignarEje(trackId, ejeId);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
    setTracks((ts) => ts.map((t) => (t.id === trackId ? { ...t, ejes: json.ejes } : t)));
    // `propagadas` (Tarea 17, Hueco 3): cuántos tracks más del mismo artista
    // cascadeó el aprendizaje incremental (propagarSugerenciasUnanimes, ahora
    // conectado también a /api/asignar, no solo al import de CSV). Ninguno de
    // los llamadores viejos de asignarManual usaba el valor de retorno, así
    // que devolverlo acá no les cambia nada — solo lo aprovecha
    // ClasificacionAsistida para avisar el efecto cascada.
    return json.propagadas ?? 0;
  }, []);

  // A diferencia de asignarManual (solo agrega), esto saca un modo puntual —
  // la pieza que faltaba para poder corregir una clasificación manual mal
  // hecha desde la ficha del track, no solo desde "Para clasificar".
  const quitarModo = useCallback(async (trackId, ejeId) => {
    const r = await quitarModoApi(trackId, ejeId);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
    setTracks((ts) => ts.map((t) => (t.id === trackId ? { ...t, ejes: json.ejes } : t)));
  }, []);

  // Une el modo `origenId` en `destinoId` (móvil: «Unir con…» del ⋯ de un modo).
  const unirModos = useCallback(async (origenId, destinoId) => {
    const r = await unirModosApi(origenId, destinoId);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
    if (json.tracks) setTracks(json.tracks);
    if (json.ejes) setEjes(json.ejes);
    return json;
  }, []);

  // Se pide por fetch (no import estático) y se repite cada vez que hace
  // falta refrescar, no solo al montar: el script de enriquecimiento sigue
  // corriendo de fondo y agregando álbum/año/géneros con el tiempo. Un fetch
  // que falla (servidor reiniciando, etc.) se ignora en silencio — el peor
  // caso es mostrar "sin resolver todavía" en vez de romper la app.
  const refrescarMetadata = useCallback(() => {
    obtenerMetadata()
      .then(setMetadataMB)
      .catch(() => {});
  }, []);

  // Móvil: importar por enlace y organizar en modos en segundo plano.
  const importacion = useImportarOrganizar({ activo: MODO_LOCAL, setTracks, setEjes, refrescarMetadata });

  const refrescarOverrides = useCallback(() => {
    obtenerOverrides()
      .then(setOverrides)
      .catch(() => {});
  }, []);

  const refrescarFavoritos = useCallback(() => {
    obtenerFavoritos()
      .then(setFavoritos)
      .catch(() => {});
  }, []);

  // Tras sincronizar, relee el estado persistido sin recargar la página. No se
  // modifica `cola`, `indice` ni el reproductor: una canción en curso sigue
  // sonando incluso si ya no aparece en la biblioteca recién fusionada.
  const recargarDatosLocales = useCallback(
    () =>
      refrescarBibliotecaLocal({
        cargarDatos: cargarDatosLocales,
        obtenerMetadata,
        obtenerFavoritos,
        setTracks,
        setEjes,
        setMetadata: setMetadataMB,
        setFavoritos,
      }),
    []
  );

  useEffect(() => {
    if (!MODO_LOCAL || !Capacitor.isNativePlatform()) return undefined;
    let manejador = null;
    let cancelado = false;
    import('./data/sincronizar-movil.js')
      .then((m) =>
        m.escucharEnlacesDeSincronizacion((estado) => {
          setAvisoSincronizacion(estado);
          if (estado.fase === 'listo') recargarDatosLocales().catch((e) => console.warn('[datos-locales]', e));
        })
      )
      .then((h) => {
        if (cancelado) h?.remove();
        else manejador = h;
      });
    return () => {
      cancelado = true;
      manejador?.remove();
    };
  }, [recargarDatosLocales]);

  const refrescarHistorial = useCallback(() => {
    obtenerHistorial()
      .then(setHistorial)
      .catch(() => {})
      .finally(() => setHistorialListo(true));
  }, []);

  const refrescarUltimosModos = useCallback(() => {
    obtenerUltimosModos()
      .then(setUltimosModosIds)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refrescarMetadata();
    refrescarOverrides();
    refrescarFavoritos();
    refrescarHistorial();
    refrescarUltimosModos();
    // Una sola vez al montar, después de pedir el estado real: si el server
    // no tenía nada propio, aplica lo viejo de localStorage. No hace falta
    // esperar la respuesta para re-pedir acá — el próximo refresh de página
    // ya lo va a traer; esto es solo para no perder el historial de antes.
    migrarPersistenciaLocal();
  }, [refrescarMetadata, refrescarOverrides, refrescarFavoritos, refrescarHistorial, refrescarUltimosModos]);

  // "Me gusta" de álbum/artista — pedido explícito, igual que el de canción
  // pero para dos entidades que no existían como registro propio (se
  // calculan al vuelo desde `tracks`). Optimista: actualiza el estado local
  // antes de esperar la respuesta, como el resto de los toggles de la app.
  const alternarFavoritoArtista = useCallback((nombre, activo) => {
    const clave = nombre.trim().toLowerCase();
    setFavoritos((f) => ({
      ...f,
      artistas: activo ? [...new Set([...f.artistas, clave])] : f.artistas.filter((n) => n !== clave),
    }));
    guardarFavoritoArtista(nombre, activo).catch(() => {});
  }, []);

  const alternarFavoritoAlbum = useCallback((artista, titulo, activo) => {
    const clave = `${artista.trim().toLowerCase()}||${titulo.trim().toLowerCase()}`;
    setFavoritos((f) => ({
      ...f,
      albumes: activo ? [...new Set([...f.albumes, clave])] : f.albumes.filter((k) => k !== clave),
    }));
    guardarFavoritoAlbum(artista, titulo, activo).catch(() => {});
  }, []);

  // Fotos de artista confirmadas por /api/artista (búsqueda directa por
  // artista, desempatada por fans) — más confiables que la que trae
  // metadata-deezer.json (pegada a la búsqueda de un track puntual, ver
  // fotoDeArtista más abajo). Arranca con lo que ya se visitó alguna vez;
  // abrirArtista() suma la del artista actual apenas la consigue, sin
  // esperar a un refresh.
  const [fotosArtistasConfirmadas, setFotosArtistasConfirmadas] = useState({});
  useEffect(() => {
    obtenerArtistasFotos()
      .then((j) => setFotosArtistasConfirmadas(j.fotos ?? {}))
      .catch(() => {});
  }, []);

  // Álbum/año: la corrección manual pisa el dato de MusicBrainz, nunca al
  // revés — es la señal más confiable que hay (la puso el usuario a mano).
  const metadataDe = useCallback(
    (trackId) => {
      const t = metadataMB.tracks[trackId];
      const ov = overrides[trackId];
      const artista = t?.artistaMbid ? metadataMB.artistas[t.artistaMbid] : null;
      return {
        album: ov?.album ?? t?.album ?? null,
        anio: ov?.anio ?? t?.anio ?? null,
        duracionMs: t?.duracionMs ?? null,
        generos: artista?.generos ?? [],
        coverUrl: t?.coverUrl ?? null,
        fotoArtista: t?.fotoArtista ?? null,
      };
    },
    [metadataMB, overrides]
  );

  // Tinte del reproductor (C1-C2): color vivo de la portada que suena, mezclado
  // con el color del modo activo (ver --tinte en styles.css). Solo tiñe fondos
  // oscuros y acentos, nunca el texto, así que el contraste se mantiene (C3).
  const portadaActual = trackActual
    ? (metadataDe(trackActual.trackIdReal ?? trackActual.id).coverUrl ?? trackActual.coverUrl ?? null)
    : null;
  const colorModoActivo = ejeActivo?.id ? colorDeEje(ejeActivo) : null;
  const [colorPortadaActual, setColorPortadaActual] = useState(null); // también tiñe la miniatura
  useEffect(() => {
    const raiz = document.documentElement.style;
    if (colorModoActivo) raiz.setProperty('--color-modo', colorModoActivo);
    else raiz.removeProperty('--color-modo');
    let vigente = true;
    colorDePortada(portadaActual).then((c) => {
      if (!vigente) return;
      if (c) raiz.setProperty('--color-portada', `rgb(${c.r}, ${c.g}, ${c.b})`);
      else raiz.removeProperty('--color-portada');
      setColorPortadaActual(c ? `rgb(${c.r}, ${c.g}, ${c.b})` : null);
    });
    return () => {
      vigente = false;
    };
  }, [portadaActual, colorModoActivo]);


  // Álbumes de tu biblioteca, agrupados por artista+título — pedido
  // explícito (reemplaza "Canciones" en el submenú). No existe hoy ninguna
  // entidad "álbum" guardada: se arma agrupando los tracks que YA tienen
  // álbum resuelto (metadataDe), lo mismo que ya hace VistaAlbum para saber
  // cuántos tracks del álbum real están en tu biblioteca.
  const albumesBiblioteca = useMemo(() => {
    const porClave = new Map();
    tracksVisibles.forEach((t, indice) => {
      const meta = metadataDe(t.id);
      if (!meta.album) return;
      const clave = `${t.artista.toLowerCase()}||${meta.album.toLowerCase()}`;
      const entrada = porClave.get(clave) ?? {
        titulo: meta.album,
        artista: t.artista,
        anio: meta.anio,
        coverUrl: meta.coverUrl,
        cantidad: 0,
        indice,
      };
      entrada.cantidad += 1;
      entrada.indice = Math.max(entrada.indice, indice);
      if (!entrada.anio && meta.anio) entrada.anio = meta.anio;
      if (!entrada.coverUrl && meta.coverUrl) entrada.coverUrl = meta.coverUrl;
      porClave.set(clave, entrada);
    });
    return [...porClave.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  }, [tracksVisibles, metadataDe]);

  // Cantidad de álbumes por artista, para "Por artistas" del sidebar — solo
  // "N canciones" se sentía corto de contenido con la tarjeta chica. Ignora
  // álbumes de 1 sola canción: son sueltos con "álbum" = el nombre del single
  // (medido en vivo con canales de covers/instrumentales, ej. Edward Ong:
  // 75 canciones daban "73 álbumes", ruido en vez de discografía real).
  const albumesPorArtista = useMemo(() => {
    const m = new Map();
    for (const a of albumesBiblioteca) {
      if (a.cantidad < 2) continue;
      const clave = a.artista.toLowerCase();
      m.set(clave, (m.get(clave) ?? 0) + 1);
    }
    return m;
  }, [albumesBiblioteca]);

  // Botones multimedia del teclado (play/pausa, avanzar, retroceder) — Play
  // ya andaba solo (el navegador engancha play/pausa a cualquier elemento de
  // audio/video sin pedir nada), pero avanzar/retroceder no tienen
  // comportamiento por defecto: hay que decirle al SO explícitamente qué
  // hacer con esos dos vía Media Session. De paso, esto es lo mismo que
  // alimenta el mini panel "reproduciendo ahora" del sistema operativo
  // (con título/artista/carátula) — se completa metadata igual, sin costo
  // extra.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!trackActual) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.setActionHandler('previoustrack', () => setIndice((i) => Math.max(0, i - 1)));
    navigator.mediaSession.setActionHandler('nexttrack', siguiente);
    const meta = metadataDe(trackActual.trackIdReal ?? trackActual.id);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: formatearTitulo(trackActual.titulo),
      artist: formatearTitulo(trackActual.artista),
      album: meta.album ? formatearTitulo(meta.album) : '',
      artwork: meta.coverUrl ? [{ src: meta.coverUrl }] : [],
    });
    return () => {
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [trackActual, siguiente, metadataDe]);

  // Duración total por eje — cuánto dura un modo/lista completo, no solo
  // cuántos tracks tiene. Suma lo que ya se conoce nomás: si falta duración
  // para una parte de los tracks (el enriquecimiento no terminó, o el track
  // nunca sonó todavía), el total es un piso real, no una cuenta inventada.
  const duracionesTotales = useMemo(() => {
    const m = new Map();
    for (const t of tracks) {
      const ms = metadataDe(t.id).duracionMs;
      if (!ms) continue;
      for (const a of t.ejes) m.set(a.ejeId, (m.get(a.ejeId) ?? 0) + ms);
    }
    return m;
  }, [tracks, metadataDe]);

  // Hasta 4 carátulas distintas por eje, para el collage de las tarjetas de
  // Home — el mismo lenguaje visual que ya se armó en la exploración de
  // Lovable, pero con carátulas reales de la biblioteca en vez de mock data.
  const coversDeEje = useMemo(() => {
    const m = new Map();
    for (const t of tracks) {
      const url = metadataDe(t.id).coverUrl;
      if (!url) continue;
      for (const a of t.ejes) {
        const lista = m.get(a.ejeId) ?? [];
        if (lista.length < 4 && !lista.includes(url)) {
          lista.push(url);
          m.set(a.ejeId, lista);
        }
      }
    }
    return conPortadasPropias(m, ejes);
  }, [tracks, metadataDe, ejes]);

  // Artistas distintos por lista (vista completa de "Listas" del buscador —
  // pedido explícito de mostrar quiénes están adentro, no solo cantidad).
  const artistasDeEje = useMemo(() => {
    const m = new Map();
    for (const t of tracks) {
      for (const a of t.ejes) {
        const lista = m.get(a.ejeId) ?? [];
        if (lista.length < 6 && !lista.includes(t.artista)) {
          lista.push(t.artista);
          m.set(a.ejeId, lista);
        }
      }
    }
    return m;
  }, [tracks]);

  // Foto del artista: primero la confirmada por /api/artista (búsqueda
  // directa por artista, desempatada por fans — la misma que se ve en la
  // página del artista), y si todavía no se visitó esa página, la que haya
  // quedado pegada a algún track suyo vía metadata-deezer.json (búsqueda por
  // "artista + título" de un track puntual, menos confiable: puede traer el
  // artista de otro resultado, o directamente null aunque el artista real sí
  // tenga foto en Deezer — el caso reportado con Soda Stereo).
  function fotoDeArtista(nombre) {
    const clave = nombre.toLowerCase();
    if (fotoEsValida(fotosArtistasConfirmadas[clave])) return fotosArtistasConfirmadas[clave];
    const track = tracks.find((t) => separarArtistas(t.artista, artistasSolos).some((n) => n.toLowerCase() === clave));
    const foto = track ? metadataDe(track.id).fotoArtista : null;
    return fotoEsValida(foto) ? foto : null;
  }

  // Título/artista corregidos a mano. Se aplican en `tracksVisibles` (más
  // abajo) en vez de directo sobre `track.titulo`/`track.artista` en cada
  // sitio que los muestra: así una sola corrección se propaga a las listas,
  // el buscador, el agrupado por artista y el historial sin tocar cada uno.
  const tituloDe = useCallback(
    (track) => overrides[track.id]?.titulo || track.titulo,
    [overrides]
  );
  const artistaDe = useCallback(
    (track) => overrides[track.id]?.artista || track.artista,
    [overrides]
  );

  const guardarOverride = useCallback(async (trackId, cambios) => {
    const r = await guardarOverrideApi(trackId, cambios);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
    setOverrides(json.overrides);
  }, []);

  // Fase 9: agrega un track elegido en la búsqueda externa. El servidor lo
  // clasifica y cachea su videoId (ya se conoce, viene de la búsqueda) — acá
  // solo hace falta reflejarlo en `tracks` para que aparezca YA en Home,
  // "Para clasificar", el buscador interno, etc., sin esperar un refresh.
  const agregarTrackExterno = useCallback(async ({ titulo, artista, videoId }) => {
    const r = await agregarTrackApi({ titulo, artista, videoId });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
    if (!json.yaExistia) {
      setTracks((ts) => [...ts, json.track]);
      // El servidor ya enriqueció portada/álbum al agregarlo (ver
      // enriquecerTrackDeezerUno en vite.config.js) — sin este refetch, la
      // portada quedaba escrita en metadata-deezer.json pero invisible hasta
      // recargar la página entera, porque metadataMB solo se lee al montar.
      refrescarMetadata();
    }
    return json;
  }, [refrescarMetadata]);

  // Pantalla "Cargar tu biblioteca" (CSV de tunemymusic.com). El servidor
  // devuelve `tracks`/`ejes` completos ya actualizados — más simple que
  // mergear a mano un lote que puede tocar cientos de tracks y crear listas
  // nuevas a la vez (a diferencia de asignarLote, que solo toca `ejes` de
  // tracks que YA existían).
  const importarTuneMyMusic = useCallback(async (contenidoCsv) => {
    const r = await importarTuneMyMusicApi(contenidoCsv);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.mensaje ?? json.error ?? `HTTP ${r.status}`);
    setTracks(json.tracks);
    setEjes(json.ejes);
    // El descubrimiento y la creación de modos para estos tracks quedan en
    // manos del enriquecimiento automático en segundo plano — ya no se
    // dispara acá (ver docs/superpowers/specs/2026-09-11-quitar-revision-modos-post-import-design.md,
    // elimina la carrera con ese enriquecimiento).
    return json;
  }, []);

  const importarMusicaLocal = useCallback(async (rutas) => {
    const r = await importarMusicaLocalApi(rutas);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.mensaje ?? json.error ?? `HTTP ${r.status}`);
    setTracks(json.tracks);
    // Mismo criterio que importarTuneMyMusic: el descubrimiento y la
    // creación de modos quedan en manos del enriquecimiento automático en
    // segundo plano, ya no se dispara acá.
    return json;
  }, []);

  // Tracklist completo de un álbum (vía Deezer, trae tracks que el usuario
  // nunca agregó, no solo los que ya tiene) — separado de `vista` porque hay
  // que poder volver a la pantalla de donde se abrió, no siempre a Inicio.
  const [album, setAlbum] = useState(null);
  // Perfil de artista (Deezer): álbumes + canciones populares. Declarado acá
  // (no más abajo, junto a abrirArtista) porque abrirAlbum ya lo necesita
  // para armar la pila de navegación.
  const [artista, setArtista] = useState(null);
  // Pila real de navegación, no un solo "anterior": álbum → artista → otro
  // álbum → "volver" tiene que reconstruir CADA paso con sus propios datos
  // (qué álbum/artista se estaba mirando ahí), no solo el nombre de la
  // vista — si no, "volver" dos veces desde un álbum abierto vía un artista
  // terminaba mostrando el álbum equivocado (el último cargado, no el que
  // realmente estaba antes en esa posición de la pila).
  const [pilaVistas, setPilaVistas] = useState([]);
  // Contadores de petición: si dos clics disparan dos abrirAlbum/abrirArtista
  // seguidos (doble clic, click sobre el resultado anterior aún cargando),
  // las respuestas pueden llegar en cualquier orden — sin esto, una petición
  // vieja que responde tarde pisaba el resultado de la petición nueva (por
  // ejemplo mostrando "no encontramos este álbum" encima del álbum correcto
  // que ya había cargado bien).
  const idPeticionAlbum = useRef(0);
  const idPeticionArtista = useRef(0);

  // Solo carga los datos del álbum (sin tocar la navegación de escritorio):
  // la capa móvil lo usa directo, con su propia pila.
  const cargarAlbum = useCallback(
    async (nombreArtista, titulo, albumConocido) => {
      setAlbum({ cargando: true });
      const miId = ++idPeticionAlbum.current;
      try {
        // Si ya sabemos el álbum (por MusicBrainz/Spotify, ver metadataDe),
        // se lo pasamos al servidor para que busque el álbum directo en vez
        // de adivinar por track — evita quedarse con el single/remix/versión
        // en vivo que suele ganarle al álbum real en la búsqueda por track.
        // El resto de los álbumes del artista (para el lateral "Más álbumes
        // de X") viaja en paralelo, no en cadena — /api/artista ya trae esa
        // lista completa (misma que usa la ficha de artista), así que no
        // hace falta un endpoint nuevo. Si esta parte falla, el álbum en sí
        // igual se muestra: el lateral queda vacío en vez de tumbar la vista.
        const [json, jsonArtista] = await Promise.all([
          obtenerAlbum({ artista: nombreArtista, titulo, albumConocido }),
          // Un fallo del artista (red, límite de Deezer) no debe tumbar el álbum.
          obtenerArtista(nombreArtista).catch(() => ({ encontrado: false })),
        ]);
        if (miId !== idPeticionAlbum.current) return;
        if (json.error || !json.encontrado) {
          setAlbum({
            cargando: false,
            error: json.error ? traducirError(new Error(json.mensaje ?? json.error)) : null,
            encontrado: !!json.encontrado,
          });
          return;
        }
        // Ya están TODOS en la ficha del artista (un clic más allá, con
        // "→" al lado del nombre) — acá alcanza con los más recientes, sin
        // scroll, no con repetir la lista entera.
        const otrosAlbumes = jsonArtista.encontrado
          ? jsonArtista.albumes
              .filter((a) => a.titulo.toLowerCase() !== json.titulo?.toLowerCase())
              .sort((a, b) => (b.anio ?? 0) - (a.anio ?? 0))
              .slice(0, 8)
          : [];
        setAlbum({ cargando: false, encontrado: true, ...json, otrosAlbumes });
      } catch (e) {
        if (miId !== idPeticionAlbum.current) return;
        setAlbum({ cargando: false, error: traducirError(e), encontrado: false });
      }
    },
    []
  );

  const abrirAlbum = useCallback(
    (nombreArtista, titulo, albumConocido) => {
      setPilaVistas((p) => [...p, { vista, album, artista }]);
      setVista('album');
      return cargarAlbum(nombreArtista, titulo, albumConocido);
    },
    [vista, album, artista, cargarAlbum]
  );

  // Mismo patrón que abrirAlbum — comparte la misma pila de navegación
  // (ver pilaVistas más arriba) y la misma guarda contra respuestas fuera de
  // orden.
  const cargarArtista = useCallback(
    async (nombre) => {
      setArtista({ cargando: true, nombre });
      const miId = ++idPeticionArtista.current;
      try {
        const json = await obtenerArtista(nombre);
        if (miId !== idPeticionArtista.current) return;
        if (json.error || !json.encontrado) {
          // `nombre` (el pedido, no el de Deezer) queda igual cuando no se
          // encuentra — sin esto el mensaje de error no podía decir a quién
          // no encontró, y la pestaña "En tu biblioteca" (que no depende de
          // Deezer para nada) se quedaba sin forma de saber qué artista
          // buscar entre tus propias canciones.
          setArtista({
            cargando: false,
            nombre,
            error: json.error ? traducirError(new Error(json.mensaje ?? json.error)) : null,
            encontrado: !!json.encontrado,
          });
          return;
        }
        setArtista({ cargando: false, encontrado: true, ...json });
        if (json.fotoUrl) {
          setFotosArtistasConfirmadas((f) => ({ ...f, [nombre.toLowerCase()]: json.fotoUrl }));
        }
      } catch (e) {
        if (miId !== idPeticionArtista.current) return;
        setArtista({ cargando: false, nombre, error: traducirError(e), encontrado: false });
      }
    },
    []
  );

  const abrirArtista = useCallback(
    (nombre) => {
      setPilaVistas((p) => [...p, { vista, album, artista }]);
      setVista('artista');
      return cargarArtista(nombre);
    },
    [vista, album, artista, cargarArtista]
  );

  // Deshace un paso de la pila de arriba: restaura la vista, el álbum y el
  // artista que estaban activos en ESE momento, no solo el nombre de la
  // vista — así "volver" desde un álbum abierto vía un artista, y de ahí a
  // otro álbum, reconstruye cada paso con sus datos reales en vez de mostrar
  // el último álbum/artista cargado en memoria. Pila vacía (llegaste acá
  // por un link directo, sin pasos previos) cae a Inicio.
  function volverAtras() {
    setPilaVistas((p) => {
      if (p.length === 0) {
        setVista('modos');
        return p;
      }
      const anterior = p[p.length - 1];
      setVista(anterior.vista);
      setAlbum(anterior.album);
      setArtista(anterior.artista);
      return p.slice(0, -1);
    });
  }

  // Arma una cola con TODO el álbum: los tracks que ya están en la biblioteca
  // se reproducen con su objeto real (historial, cola editable, todo normal);
  // los que no, con un track "de mentira" igual que la vista previa del
  // buscador externo — se resuelven a YouTube solos la primera vez que suenan.
  function reproducirAlbum(desdeIndice = 0) {
    if (!album?.tracks) return;
    const porId = new Map(tracks.map((t) => [t.id, t]));
    const cola = album.tracks.map((t) => {
      const real = porId.get(t.trackId);
      if (real) return real;
      return {
        id: `album-${t.trackId}`,
        trackIdReal: t.trackId,
        artista: t.artista,
        titulo: t.titulo,
        fuentes: ['album'],
        youtubeQuery: `${t.artista} ${t.titulo}`,
        youtubeVideoId: null,
        ejes: [],
        // Todavía no tiene metadata propia (metadataDe no lo encuentra, no
        // está en la biblioteca) — sin esto la barra de reproducción se
        // quedaba sin portada aunque la ficha del álbum sí la tenía.
        coverUrl: album.coverUrl ?? null,
        album: album.titulo,
      };
    });
    // Sin navegar: se sigue viendo el álbum mientras suena, la barra de
    // reproducción (global) se hace cargo — mismo criterio que "Para
    // clasificar" (ver reproducirSinNavegar).
    reproducirSinNavegar(cola[desdeIndice], cola, album.titulo);
  }

  // Mismo patrón que reproducirAlbum: mezcla tracks reales (ya en biblioteca)
  // con "de mentira" para las canciones populares del artista que todavía no
  // se agregaron — se resuelven solas a YouTube la primera vez que suenan.
  function reproducirCancionesArtista(desdeIndice = 0) {
    if (!artista?.canciones) return;
    const porId = new Map(tracks.map((t) => [t.id, t]));
    const cola = artista.canciones.map((c) => {
      const real = porId.get(c.trackId);
      if (real) return real;
      return {
        id: `album-${c.trackId}`,
        trackIdReal: c.trackId,
        artista: c.artista,
        titulo: c.titulo,
        fuentes: ['album'],
        youtubeQuery: `${c.artista} ${c.titulo}`,
        youtubeVideoId: null,
        ejes: [],
      };
    });
    reproducirSinNavegar(cola[desdeIndice], cola, artista.nombre);
  }

  // Agrega TODO el álbum a la biblioteca (lo que falte), con la misma
  // clasificación automática que cualquier track nuevo (anclas + YouTube) —
  // sin esto habría que agregar y clasificar canción por canción.
  const agregarAlbum = useCallback(async () => {
    const r = await agregarAlbumApi({
      tracks: album.tracks.map((t) => ({ artista: t.artista, titulo: t.titulo, duracionMs: t.duracionMs })),
      albumTitulo: album.titulo,
      anio: album.anio,
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
    setTracks(json.tracks);
    setEjes(json.ejes);
    return json;
  }, [album]);

  // Agrega UN track suelto (de un álbum o de la lista de canciones de un
  // artista) a la biblioteca, opcionalmente marcándolo de una a "me gusta".
  // Reusa /api/agregar-album con un array de un solo elemento en vez de
  // /api/agregar-track: ese necesita un videoId YA resuelto (el track tuvo
  // que sonar al menos una vez), mientras que agregar-album resuelve el
  // video él mismo — funciona para un track que nunca se reprodujo.
  const agregarTrackSuelto = useCallback(async (t, { favorito = false, albumTitulo, anio } = {}) => {
    const r = await agregarAlbumApi({
      tracks: [{ artista: t.artista, titulo: t.titulo, duracionMs: t.duracionMs }],
      albumTitulo: albumTitulo ?? t.albumTitulo,
      anio,
      ejeId: favorito ? 'favoritos' : undefined,
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
    setTracks(json.tracks);
    setEjes(json.ejes);
    return json;
  }, []);

  // Opuesto de agregarTrackSuelto: saca el track de la biblioteca por
  // completo, no de un modo/lista puntual — "－" simétrico al "＋" en las
  // filas de álbum/artista.
  const quitarTrackSuelto = useCallback(async (trackId) => {
    const r = await quitarTrack(trackId);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
    setTracks(json.tracks);
    if (json.ejesEliminados?.length > 0) {
      setEjes((es) => es.filter((e) => !json.ejesEliminados.includes(e.nombre)));
    }
    return json;
  }, []);

  // `tiempo` cambia cada ~500ms mientras suena — guardarlo en cada cambio
  // saturaría localStorage por nada. Se lee desde un ref siempre actualizado
  // (asignación directa en el cuerpo del render, sin efecto de por medio) y
  // se persiste solo: (a) cada 5s mientras hay algo cargado, (b) al cambiar
  // de track/modo/preferencia — eso sí importa que quede guardado ya, no en
  // el próximo tick —, y (c) al ocultar/cerrar la pestaña, para no perder los
  // últimos segundos entre el último guardado periódico y el cierre real.
  const estadoSesionRef = useRef();
  estadoSesionRef.current = {
    cola,
    trackActual,
    ejeActivo,
    ejeVista,
    aleatorio,
    repetir,
    // Mientras el track restaurado sigue "en pausa esperando" (restaurarRef
    // todavía activo para este id), `tiempo` del hook puede no haberse
    // sincronizado todavía en este mismo render — usar el valor restaurado
    // de una en vez del 0 inicial evita que el primer guardado pise la
    // posición real con cero antes de que el player se ponga al día.
    // `!!restaurarRef.current &&` explícito, no alcanza con comparar los
    // ids con optional chaining: si NO hay sesión restaurada (null) Y
    // tampoco hay track actual (cola vacía), ambos lados dan `undefined` y
    // `undefined === undefined` es true — entraba a leer `.segundos` de un
    // ref que en realidad es null. Bug real, visto en vivo (pantalla en
    // blanco tras un reload con la cola vacía).
    tiempo:
      !!restaurarRef.current && !!trackActual && restaurarRef.current.trackId === trackActual.id
        ? restaurarRef.current.segundos
        : tiempo,
  };

  useEffect(() => {
    function guardar() {
      const s = estadoSesionRef.current;
      if (s.cola.length === 0) return;
      guardarSesion({
        colaIds: s.cola.map((t) => t.id),
        trackActualId: s.trackActual?.id ?? null,
        ejeActivoId: s.ejeActivo?.id ?? null,
        ejeActivoNombre: s.ejeActivo?.nombre ?? null,
        ejeVistaId: s.ejeVista?.id ?? null,
        ejeVistaNombre: s.ejeVista?.nombre ?? null,
        tiempo: s.tiempo,
        aleatorio: s.aleatorio,
        repetir: s.repetir,
      });
    }
    function alOcultar() {
      if (document.hidden) guardar();
    }
    const id = setInterval(guardar, 5000);
    window.addEventListener('beforeunload', guardar);
    document.addEventListener('visibilitychange', alOcultar);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', guardar);
      document.removeEventListener('visibilitychange', alOcultar);
    };
  }, []);

  // Guardado inmediato ante cambios "estructurales" (cambiar de track, de
  // modo, de preferencia) — el intervalo de arriba solo cubre el avance del
  // tiempo dentro del MISMO track.
  useEffect(() => {
    if (cola.length === 0) return;
    guardarSesion({
      colaIds: cola.map((t) => t.id),
      trackActualId: trackActual?.id ?? null,
      ejeActivoId: ejeActivo?.id ?? null,
      ejeActivoNombre: ejeActivo?.nombre ?? null,
      ejeVistaId: ejeVista?.id ?? null,
      ejeVistaNombre: ejeVista?.nombre ?? null,
      tiempo: estadoSesionRef.current.tiempo,
      aleatorio,
      repetir,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cola, trackActual, ejeActivo, ejeVista, aleatorio, repetir]);

  // Solo navega — NO toca `cola`/`ejeActivo`. Antes armaba la cola y arrancaba
  // a sonar apenas se entraba a un modo, así que abrir un modo cortaba lo que
  // estuviera sonando de otro lado (otro modo, una búsqueda). Ahora "mirar" y
  // "reproducir" son cosas separadas: lo segundo solo pasa si tocás una
  // canción puntual o el botón de aleatorio/secuencial (ver `reproducirModo`).
  // Ejes de sistema (ej. "sin-clasificar") no son modos navegables de
  // verdad — no deben quedar guardados como "últimos vistos" ni resucitar
  // después en "Seguí escuchando" del Home. Se llama tanto al entrar a ver
  // un modo (entrarAModo) como al reproducirlo directo con el botón ▶ sin
  // pasar por la pantalla (reproducirModo) — pedido explícito: "Seguí
  // escuchando" tiene que reflejar lo que sonó de verdad, no solo lo que se
  // navegó.
  function registrarModoEscuchado(eje) {
    if (!eje?.id || eje.sistema) return;
    setUltimosModosIds((actual) => [eje.id, ...actual.filter((id) => id !== eje.id)].slice(0, 6));
    guardarUltimoModoUsado(eje.id).catch(() => {});
  }

  function entrarAModo(eje) {
    setEjeVista(eje);
    registrarModoEscuchado(eje);
    setVista('reproductor');
    refrescarMetadata();
  }

  // Arranca (o reinicia) la reproducción de un modo: desde una canción
  // puntual (click en una fila) si se pasa `trackInicial`, o desde el
  // principio (botón aleatorio/secuencial). `forzarAleatorio`, si se pasa,
  // pisa la preferencia guardada — lo usa el botón cuando el usuario recién
  // la está cambiando, para no depender de que el estado ya se haya
  // actualizado en este mismo render.
  function reproducirModo(eje, lista, trackInicial, forzarAleatorio) {
    if (lista.length === 0) {
      if (esMovil) setAvisoSalto(avisoModo(eje?.nombre ?? 'Este modo', 0, false));
      return;
    }
    registrarModoEscuchado(eje);
    const usarAleatorio = forzarAleatorio ?? aleatorio;
    // Móvil: arrancar un modo entero (no una canción puntual) avisa de qué suena.
    if (esMovil && !trackInicial) setAvisoSalto(avisoModo(eje?.nombre ?? 'Modo', lista.length, usarAleatorio));
    const ordenada = usarAleatorio ? barajar(lista) : lista;
    const idx = trackInicial ? ordenada.indexOf(trackInicial) : 0;
    // Reproducir es una orden explícita: si la cola nueva empieza por el
    // track que la sesión restauró en pausa, tiene que sonar igual.
    restaurarRef.current = null;
    setEjeActivo(eje);
    setColaAuto(new Set());
    setRadioModo(null);
    setCola(ordenada);
    setIndice(idx < 0 ? 0 : idx);
    refrescarMetadata();
  }

  // Botón aleatorio de la barra: edita la cola que suena (como BitChord).
  // Activarlo mezcla lo que viene DESPUÉS de la actual (no corta nada);
  // desactivarlo devuelve el orden que había antes de mezclar, siguiendo
  // desde la canción que suena.
  const ordenPrevioRef = useRef(null);
  function alternarAleatorioCola() {
    const actual = cola[indice];
    if (!aleatorio) {
      ordenPrevioRef.current = cola;
      setCola([...cola.slice(0, indice + 1), ...barajar(cola.slice(indice + 1))]);
      setAleatorio(true);
      return;
    }
    const previo = ordenPrevioRef.current;
    ordenPrevioRef.current = null;
    setAleatorio(false);
    const idx = previo ? previo.indexOf(actual) : -1;
    if (previo && idx >= 0) {
      setCola(previo);
      setIndice(idx);
    }
  }

  function alternarAleatorioYReproducir(eje, lista) {
    const nuevo = !aleatorio;
    setAleatorio(nuevo);
    reproducirModo(eje, lista, null, nuevo);
  }

  // --- Edición de cola ---
  // Los tres casos (quitar / mover / agregar) tienen que mantener `indice`
  // apuntando al MISMO track que sonaba antes de la edición, no a la misma
  // posición numérica — si no, editar la cola mientras suena algo cambia lo
  // que está sonando sin que el usuario lo haya pedido.

  function quitarDeCola(idx) {
    setCola((c) => c.filter((_, i) => i !== idx));
    setIndice((i) => (idx < i ? i - 1 : i));
    // Si idx === i (se quitó el track actual), el índice numérico queda
    // igual pero el array se corrió: ahora apunta al que era el siguiente.
    // Es el comportamiento esperado, no un bug — "quitar lo que suena" avanza.
  }

  // Sacar e insertar (no swap): el origen puede terminar en cualquier
  // posición respecto del destino, arrastrando por drag-to-reorder.
  function moverACola(origen, destino) {
    if (origen === destino) return;
    setCola((c) => {
      if (origen < 0 || origen >= c.length || destino < 0 || destino >= c.length) return c;
      const nueva = [...c];
      const [item] = nueva.splice(origen, 1);
      nueva.splice(destino, 0, item);
      return nueva;
    });
    setIndice((i) => {
      if (i === origen) return destino;
      if (origen < i && i <= destino) return i - 1;
      if (destino <= i && i < origen) return i + 1;
      return i;
    });
  }

  // Una o varias pistas de golpe (álbum, artista, mood): una sola actualización de estado,
  // no una por pista — con cola vacía, cada llamada veía `cola` vacía y pisaba a la anterior.
  function agregarACola(pistas) {
    const lista = Array.isArray(pistas) ? pistas : [pistas];
    const r = agregarAlFinal(cola, indice, lista);
    if (r.cola === cola) return;
    setCola(r.cola);
    setIndice(r.indice);
  }

  // «Reproducir a continuación» (móvil): tras la que suena; sin cola, empieza la lista completa.
  function reproducirDespues(pistas) {
    const lista = Array.isArray(pistas) ? pistas : [pistas];
    const r = insertarDespues(cola, indice, lista);
    if (r.cola === cola) return;
    setCola(r.cola);
    setIndice(r.indice);
  }

  // Agrega/saca un track de una "colección" (favoritos o cualquier playlist).
  // Es un tag independiente del modo, no un modo más: un track puede estar
  // clasificado en pop-dance Y en dos playlists distintas al mismo tiempo
  // (por eso pega a /api/coleccion, no a /api/asignar — ese último saca
  // 'sin-clasificar' antes de asignar, semántica que no aplica acá).
  const alternarColeccion = useCallback(async (trackId, ejeId, activo) => {
    const r = await guardarColeccion(trackId, ejeId, activo);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
    setTracks((ts) => ts.map((t) => (t.id === trackId ? { ...t, ejes: json.ejes } : t)));
    // Sacar el último track de una lista puede dejarla vacía y el servidor la
    // borra sola (ver podarEjesVacios) — reflejarlo acá para que desaparezca
    // del Home sin esperar un reload.
    if (json.ejesEliminados?.length > 0) {
      setEjes((es) => es.filter((e) => !json.ejesEliminados.includes(e.nombre)));
    }
  }, []);

  const alternarFavorito = useCallback(
    (trackId, activo) => alternarColeccion(trackId, 'favoritos', activo),
    [alternarColeccion]
  );

  // Guardado con rollback: si el servidor rechaza (ver validarEjes en
  // vite.config.js), la UI vuelve al estado anterior en vez de quedar
  // mostrando un cambio que el disco nunca tuvo. Vive en App (no en
  // EditorEjes) porque "Crear lista" desde la home la necesita también.
  const guardarEjes = useCallback(
    async (nuevos) => {
      const anterior = ejes;
      setEjes(nuevos);
      try {
        const r = await guardarEjesApi({ version: 1, actualizado: new Date().toISOString(), ejes: nuevos });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.mensaje ?? json.error ?? `HTTP ${r.status}`);
        return true;
      } catch (e) {
        setEjes(anterior);
        window.alert(`No se pudo guardar: ${traducirError(e)}`);
        return false;
      }
    },
    [ejes]
  );

  // "⋮ Ocultar del Inicio" en las tarjetas de modo — mismo efecto que
  // "Ocultar" en Configuración, pero sin salir de donde estás.
  const ocultarModo = useCallback(
    (ejeId) => guardarEjes(ejes.map((e) => (e.id === ejeId ? { ...e, activo: false } : e))),
    [ejes, guardarEjes]
  );

  const crearEje = useCallback(
    async (nombre, tipo, extra = {}) => {
      const limpio = nombre.trim();
      if (!limpio) return;
      // El id es un slug estable y no se reutiliza: si ya existe uno igual, se
      // le agrega un sufijo en vez de reciclar el de un eje borrado.
      let id = limpio
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (ejes.some((e) => e.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;

      // Si se borraron todos los ejes editables, el spread queda vacio y
      // Math.max(...[]) da -Infinity, que JSON.stringify serializa como "null".
      const ordenes = ejes.filter((e) => !e.sistema).map((e) => e.orden);
      const siguienteOrden = ordenes.length > 0 ? Math.max(...ordenes) + 1 : 1;

      const guardado = await guardarEjes([
        ...ejes,
        {
          id,
          nombre: limpio,
          tipo,
          orden: siguienteOrden,
          activo: true,
          sistema: false,
          padre: null,
          descripcion:
            tipo === 'playlist' ? 'Playlist creada por el usuario.' : 'Creado desde la app.',
          anclas: { artistas: [], titulos: [] },
          tagsLastfm: [],
          ...extra,
        },
      ]);
      // Devuelve el id: ClasificacionAsistida lo necesita para asignarle el
      // track actual al modo recién creado en el mismo paso, sin tener que
      // recalcular el slug por su cuenta (la lógica de sufijo ante
      // colisiones vive acá, una sola vez). null si no se pudo guardar.
      return guardado === false ? null : id;
    },
    [ejes, guardarEjes]
  );

  function crearListaRapida() {
    const nombre = window.prompt('Nombre de la lista nueva:');
    if (nombre && nombre.trim()) crearEje(nombre, 'playlist', camposDeMoodNuevo('fijo'));
  }

  // Reemplaza toda la cola por los resultados de búsqueda actuales, arranca
  // en el track clickeado. `ejeActivo` sintético (sin id real) porque un
  // resultado de búsqueda no pertenece a un solo modo — BarraReproductor y
  // Reproductor solo leen `eje.nombre` para mostrarlo, no necesitan más.
  // Genérica: arma una cola a partir de cualquier lista de tracks resuelta
  // fuera de un modo (resultados de búsqueda, artista, historial, más
  // sonados). `etiqueta` es lo único que cambia según quién llama — se usa
  // como "eje" sintético (sin id real) solo para mostrar de dónde salió
  // esta cola. Quien llama decide la etiqueta porque solo el llamador sabe
  // el contexto (qué se buscó, qué artista, etc).
  function cargarCola(track, resultados, etiqueta, origenExtra = null) {
    // Sin modo real de por medio: la cola ES la vista, no hay nada más para
    // "mirar" aparte — por eso limpia ejeVista en vez de fijarlo.
    setEjeVista(null);
    restaurarRef.current = null; // ver reproducirModo
    setEjeActivo({ nombre: etiqueta, ...origenExtra });
    setColaAuto(new Set());
    setRadioModo(null);
    setCola(resultados);
    setIndice(resultados.indexOf(track));
    refrescarMetadata();
  }

  // "Radio desde esta canción": mix automático de YouTube Music a partir de
  // la que suena (reglas en src/data/lib/radio.js). La actual queda primera
  // (sigue sonando sin cortes) y detrás las 24 de la radio; las que ya están
  // en la biblioteca entran como el track real (con sus modos y "me gusta").
  async function iniciarRadio() {
    const semilla = trackActual;
    if (!semilla) return;
    // En móvil el aviso no bloquea (franja que se apaga sola); en escritorio, alert.
    const avisar = (msg) => (esMovil ? setAvisoSalto(msg) : window.alert(msg));
    if (esMovil) setAvisoSalto(avisoRadio(formatearTitulo(semilla.titulo), true));
    let videoId = semilla.youtubeVideoId ?? videoIdResueltoRef.current.get(semilla.id);
    if (!videoId) {
      // Aún no se resolvió (la canción acaba de empezar): se resuelve aquí en vez de pedir esperar.
      try {
        videoId = (await resolverVideoId(semilla.youtubeQuery, semilla.id)).videoId;
      } catch {
        videoId = null;
      }
      if (!videoId) {
        avisar('No se pudo encontrar la canción en YouTube para crear su radio.');
        return;
      }
      videoIdResueltoRef.current.set(semilla.id, videoId);
    }
    let pistas;
    try {
      pistas = await obtenerRadio(videoId, semilla.artista);
    } catch (e) {
      avisar(`No se pudo crear la radio: ${e?.message ?? e}`);
      return;
    }
    const porClave = new Map(tracks.map((t) => [`${t.artista}|${t.titulo}`.toLowerCase(), t]));
    const radio = pistas.map(
      (p) =>
        porClave.get(`${p.artista}|${p.titulo}`.toLowerCase()) ?? {
          id: `radio-${p.videoId}`,
          artista: p.artista,
          titulo: p.titulo,
          fuentes: ['radio'],
          youtubeQuery: `${p.artista} ${p.titulo}`,
          youtubeVideoId: p.videoId,
          coverUrl: p.portadaUrl,
          ejes: [],
        }
    );
    setAleatorio(false);
    cargarCola(semilla, [semilla, ...radio], `Radio: ${formatearTitulo(semilla.titulo)}`);
    if (esMovil) setAvisoSalto(avisoRadio(formatearTitulo(semilla.titulo)));
  }

  // Vectores de similitud (embeddings) del móvil, si el organizador ya los calculó.
  async function leerVectores() {
    if (!MODO_LOCAL) return [];
    try {
      const { obtenerTodos } = await import('./data/lib/db.js');
      return await obtenerTodos('vectores');
    } catch {
      return [];
    }
  }

  // «Radio del modo»: mezcla sin fin con canciones del modo y ~30 % de parecidas de fuera
  // (por similitud). Se renueva sola al acabar (ver «Reproducción automática» más abajo).
  async function iniciarRadioModo(eje) {
    if (!eje) return;
    const nombre = formatearTitulo(eje.nombre);
    const vectores = await leerVectores();
    const lista = elegirContinuacion({
      tracks: tracksVisibles,
      cola: [],
      historial: historialRef.current,
      vectores,
      marcas: noMeGusta,
      n: 24,
      modoId: eje.id,
      fraccionFuera: 0.3,
      excluirRecientes: false,
    });
    if (lista.length === 0) {
      if (esMovil) setAvisoSalto(avisoModo(nombre, 0, false));
      return;
    }
    registrarModoEscuchado(eje);
    setAleatorio(true);
    cargarCola(lista[0], lista, `Radio de ${nombre}`);
    setEjeActivo({ nombre: `Radio de ${nombre}`, radioDe: eje.id });
    setRadioModo(eje.id);
    if (esMovil) setAvisoSalto(`Radio de ${nombre}`);
  }

  // «Reproducción automática»: al quedar pocas canciones en la cola (y sin «repetir») se añaden
  // ~10 parecidas a lo último escuchado, para que no se pare ni vuelva al principio. Se hace
  // antes de llegar a la última para que la cola nativa ya las tenga con la pantalla bloqueada.
  const colaRef = useRef(cola);
  colaRef.current = cola;
  const ampliandoColaRef = useRef(false);
  useEffect(() => {
    if (!continuar || repetir || cola.length === 0 || ampliandoColaRef.current) return;
    if (cola.length - indice - 1 > 3) return;
    ampliandoColaRef.current = true;
    (async () => {
      try {
        const vectores = await leerVectores();
        if (colaRef.current !== cola) return; // la cola cambió mientras tanto
        const nuevas = elegirContinuacion({
          tracks: tracksVisibles,
          cola,
          historial: historialRef.current,
          vectores,
          marcas: noMeGusta,
          n: 10,
          modoId: radioModo,
          fraccionFuera: radioModo ? 0.3 : 0,
        });
        if (nuevas.length === 0) return;
        setCola((c) => (c === cola ? [...c, ...nuevas] : c));
        setColaAuto((a) => new Set([...a, ...nuevas.map((t) => t.id)]));
      } finally {
        ampliandoColaRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuar, repetir, cola, indice, radioModo, noMeGusta]);

  function reproducirLista(track, resultados, etiqueta) {
    cargarCola(track, resultados, etiqueta);
    setVista('reproductor');
  }

  // Mezclas de Inicio (Creado para ti, Ánimo, Mezcla de dos modos): suena la lista tal cual (ya
  // viene ordenada o barajada) sin salir de Inicio; «Sonando desde» muestra `etiqueta`.
  // `estadoId`: el estado del chip de ánimo del que viene (para medir cuánto se oye de cada canción).
  function reproducirSecuencia(lista, etiqueta, { aleatorio: conAleatorio = false, estadoId = null } = {}) {
    if (!lista?.length) return;
    setAleatorio(conAleatorio);
    reproducirSinNavegar(lista[0], lista, etiqueta, estadoId ? { estadoId } : null);
  }

  // Para "Para clasificar": tiene que poder sonar SIN sacar al usuario de la
  // pantalla de clasificar (asignar mientras escucha es el punto). La barra
  // de reproducción es global — no hace falta estar en la vista Reproductor
  // para que suene y se controle desde ahí.
  function reproducirSinNavegar(track, resultados, etiqueta, origenExtra = null) {
    cargarCola(track, resultados, etiqueta, origenExtra);
  }

  // "Infinito" del Home: arranca una reproducción aleatoria de TODA la
  // biblioteca directo, sin pasar por ningún modo puntual — reusa
  // reproducirSinNavegar (mismo mecanismo que "Para clasificar") para no
  // sacar al usuario del Home. El avance de cola es circular (ver
  // siguiente()), así que esto es efectivamente el "modo radio" que pedía
  // la ficha técnica: mezcla propia, infinita, de todo lo que ya tenés.
  //
  // setAleatorio(true) es a propósito: Infinito SIEMPRE mezcla, así que el
  // toggle de la barra de abajo tiene que reflejar eso — mismo criterio que
  // los botones Play/Aleatorio de la cola (ver más abajo, "dejan `aleatorio`
  // en el estado que corresponde"). Sin esto, si el usuario venía de un modo
  // en secuencial, el ícono quedaba mostrando "Play" mientras en realidad
  // sonaba mezclado.
  function sorprenderMe() {
    if (filtrarNoMeGusta(tracksVisibles, noMeGusta).length === 0) {
      if (esMovil) setAvisoSalto(avisoInfinito(0));
      return;
    }
    const mezclada = barajar(filtrarNoMeGusta(tracksVisibles, noMeGusta));
    setAleatorio(true);
    reproducirSinNavegar(mezclada[0], mezclada, 'Infinito');
    if (esMovil) setAvisoSalto(avisoInfinito(mezclada.length));
  }

  // "Favoritas" del Home: pedido explícito de que sea simétrico con
  // Infinito — arranca a sonar mezclado YA, no solo navega a mirar la
  // lista (que es lo que hacía antes, entrarAModo a secas). Entra al modo
  // (para que quede a la vista qué está sonando) y fuerza aleatorio=true
  // por el mismo motivo que Infinito: si no, el ícono de la barra podía
  // quedar mostrando "Play" mientras en realidad suena mezclado.
  function reproducirFavoritas() {
    const lista = favoritosEje ? tracksDe(favoritosEje.id) : [];
    if (lista.length === 0) {
      if (esMovil) setAvisoSalto(avisoFavoritas(0));
      return;
    }
    entrarAModo(favoritosEje);
    setAleatorio(true);
    reproducirModo(favoritosEje, lista, null, true);
    if (esMovil) setAvisoSalto(avisoFavoritas(lista.length)); // pisa el genérico de reproducirModo
  }

  /**
   * El video que sonaba no se pudo reproducir de verdad en este dispositivo.
   *
   * Antes esto NO EXISTÍA: el player no escuchaba errores, así que un video con
   * el embebido prohibido (error 150, muy común en videoclips oficiales) dejaba
   * la app muda sin avisar ni saltar, y encima el id malo quedaba cacheado para
   * siempre. El síntoma era "suena una vez y después ninguna canción más".
   *
   * Se prueba con otro candidato de la misma búsqueda antes de rendirse: el
   * track sí está en YouTube, solo que en otra subida.
   */
  async function manejarVideoFallido({ videoId, codigo }) {
    const track = trackActual;
    if (!track) return;

    // Falló el archivo local (no el vídeo): no se descarta nada de YouTube, se vuelve a
    // resolver la canción sin él y, si YouTube tampoco la tiene, ya saldrá el aviso.
    if (esIdLocal(videoId)) {
      const trackId = trackIdDeIdLocal(videoId);
      localesFallidasRef.current.add(trackId);
      videoIdResueltoRef.current.delete(trackId);
      if (trackId === track.id) setReintentoResolucion((n) => n + 1);
      return;
    }

    // 'sin_respuesta' lo emite el vigía: el player no contestó. Eso no acusa al
    // video —lo más probable es que el player esté congelado—, así que no se
    // descarta nada; se rehace el player y se reintenta el mismo video.
    if (codigo === 'sin_respuesta') {
      recrearPlayer({ videoId, autoplay: true, segundos: 0 });
      return;
    }

    // Se ESPERA al descarte a propósito: si más abajo hay que volver a
    // resolver, el servidor tiene que conocer ya el id descartado o devolvería
    // exactamente el mismo y el reintento no serviría de nada.
    await descartarVideo(track.id, videoId).catch((e) =>
      console.error('No se pudo registrar el video descartado:', e)
    );

    const restantes = candidatosRef.current.filter((id) => id !== videoId);
    candidatosRef.current = restantes;
    if (restantes.length > 0) {
      console.warn(
        `[youtube] error ${codigo} en ${videoId}; probando otra versión de`,
        track.artista, '-', track.titulo
      );
      // El caché en memoria del track también tiene el id malo: si no se
      // actualiza, cualquier vuelta a este track lo reusaría.
      track.youtubeVideoId = restantes[0];
      reproducir(restantes[0], { trackId: track.id });
      return;
    }

    // Sin candidatos en memoria. Ojo: eso NO significa que no haya alternativas.
    // El caso habitual es que el id viniera del caché, y entonces nunca hubo
    // lista: una sola entrada, que acaba de fallar. Sin este bloque, cualquier
    // track ya cacheado se saltaba al primer error sin probar NADA — que era el
    // comportamiento real en una biblioteca cacheada, o sea casi siempre.
    // Ahora se vuelve a buscar; como el descarte ya está registrado, esta
    // búsqueda devuelve versiones distintas de la que falló.
    const intentos = intentosRef.current.get(track.id) ?? 0;
    if (intentos < 2) {
      intentosRef.current.set(track.id, intentos + 1);
      track.youtubeVideoId = null;
      videoIdResueltoRef.current.delete(track.id);
      try {
        const json = await resolverVideoId(track.youtubeQuery, track.id);
        // Si el usuario ya se movió a otro track, este resultado es viejo.
        if (trackActual?.id !== track.id) return;
        if (json.videoId) {
          console.warn(
            `[youtube] re-resuelto ${track.artista} - ${track.titulo} -> ${json.videoId}`
          );
          track.youtubeVideoId = json.videoId;
          videoIdResueltoRef.current.set(track.id, json.videoId);
          candidatosRef.current = json.candidatos ?? [json.videoId];
          reproducir(json.videoId, { trackId: track.id });
          return;
        }
      } catch (e) {
        console.error('Falló la re-resolución de', track.titulo, e);
      }
    }

    // Ahora sí, sin alternativas. Esto es específico de este track (los demás
    // pueden estar perfectos), así que saltar es lo correcto — al revés que los
    // fallos sistémicos tipo sin_api_key, que saltarían la cola entera.
    console.warn('Ningún video reproducible para:', track.artista, '-', track.titulo);
    track.youtubeVideoId = null;
    videoIdResueltoRef.current.delete(track.id);
    // Si el PC tiene el archivo, queda anotada la copia y se avisa en vez de «sin versión».
    const paraCopiar = hayColaNativa && (await anotarSiDisponibleEnPC(track.id).catch(() => false));
    if (cola.length > 1) {
      setAvisoSalto(
        paraCopiar
          ? `${track.artista} - ${track.titulo}: Disponible al sincronizar.`
          : `${track.artista} - ${track.titulo}: sin versión reproducible, se saltó.`
      );
      siguiente();
    } else {
      // Único track de la cola: no hay a dónde saltar, así que el cartel fijo
      // sí sobrevive (nada va a cambiar de track y a limpiarlo).
      setEstadoResolucion(paraCopiar ? 'disponible_al_sincronizar' : 'no_reproducible');
    }
  }

  // Resuelve el videoId contra YouTube solo cuando el track va a sonar.
  // La cuota de la Data API es de ~100 busquedas/dia, asi que resolver toda
  // la biblioteca por adelantado no es viable; el cache en disco es permanente.
  useEffect(() => {
    if (!trackActual) return;
    let cancelado = false;

    async function resolver() {
      // Limpia un cartel de error dejado por el track anterior. Sin esto, si un
      // track fallaba ("no encontrado") y el siguiente ya estaba resuelto, la
      // rama de abajo devolvía antes de tocar estadoResolucion y el cartel rojo
      // seguía mostrado sobre un track que en realidad sonaba bien.
      setEstadoResolucion(null);

      // Si este es el track que la sesión restauró, cargar en pausa en vez de
      // arrancar a sonar — ver el comentario en restaurarRef más arriba. Se
      // consulta por trackId (no se apaga acá) para sobrevivir el doble
      // efecto de StrictMode sobre este mismo track.
      const opciones =
        restaurarRef.current?.trackId === trackActual.id
          ? { autoplay: false, segundos: restaurarRef.current.segundos }
          : undefined;
      // Se gasta apenas se avanza a OTRO track — evita que un `siguiente()`
      // más adelante en la misma sesión herede el "cargar en pausa".
      if (!opciones) restaurarRef.current = null;

      // El ref se consulta ADEMÁS del campo del track: el campo se pierde cada
      // vez que tracksVisibles re-clona (ver videoIdResueltoRef), y sin esto
      // un track con corrección manual se re-resolvía a mitad de canción.
      // Android: si la canción está en este móvil suena su archivo (sin buscar en YouTube).
      if (hayColaNativa && !localesFallidasRef.current.has(trackActual.id)) {
        const hayLocal = await tieneArchivoLocal(trackActual.id).catch(() => false);
        if (cancelado) return;
        if (hayLocal) {
          const id = idLocal(trackActual.id);
          videoIdResueltoRef.current.set(trackActual.id, id);
          candidatosRef.current = [];
          reproducir(id, { ...opciones, trackId: trackActual.id });
          precargarColaRef.current?.();
          return;
        }
      }
      const yaResuelto = trackActual.youtubeVideoId ?? videoIdResueltoRef.current.get(trackActual.id);
      if (yaResuelto) {
        // Sin candidatos guardados (viene del caché en memoria): si este falla,
        // manejarVideoFallido lo descarta y el siguiente intento hará una
        // búsqueda nueva, que ya lo excluirá.
        candidatosRef.current = [yaResuelto];
        reproducir(yaResuelto, { ...opciones, trackId: trackActual.id });
        return;
      }
      setEstadoResolucion('buscando');
      try {
        const json = await resolverVideoId(trackActual.youtubeQuery, trackActual.id);
        if (cancelado) return;
        if (json.videoId) {
          // Mutación directa a propósito, no setTracks: este objeto es el mismo
          // que vive dentro de `tracks` (tracksDe filtra sin clonar), así que el
          // caché en memoria queda disponible si el track vuelve a sonar más
          // tarde. Es seguro porque asignarManual solo reemplaza por un objeto
          // nuevo al track que el usuario reclasifica desde "Sin clasificar", y
          // un track ahí nunca está simultáneamente en una cola de reproducción.
          trackActual.youtubeVideoId = json.videoId;
          videoIdResueltoRef.current.set(trackActual.id, json.videoId);
          // Las alternativas por si la elegida resulta no reproducible. Se
          // guardan para no tener que repetir la búsqueda, que en modo local
          // cuesta 100 unidades de cuota.
          candidatosRef.current = json.candidatos ?? [json.videoId];
          setEstadoResolucion(null);
          reproducir(json.videoId, { ...opciones, trackId: trackActual.id });
          precargarColaRef.current?.(); // ya hay videoId actual: preparar las siguientes
        } else if (json.error === 'sin_api_key') {
          // Falla de configuración, no del track: saltarlo no arregla nada y
          // saltaría TODA la cola en silencio (cada track fallaría igual),
          // dejando al usuario sin saber por qué no suena nada.
          setEstadoResolucion('sin_api_key');
        } else if (json.error === 'youtube_error') {
          // Fallo técnico real de YouTube/InnerTube (cuota agotada, la API
          // cambió algo, lo que sea) — no "esta canción puntual no está".
          // Antes esto cascadeaba por el mismo `else` genérico que
          // "no encontrado" y perdía `json.detalle` (el motivo real que el
          // servidor sí manda) sin loggearlo en ningún lado. No se salta
          // solo: si es algo sistémico (cuota agotada, por ejemplo) saltar
          // fallaría en cadena por TODA la cola en silencio, igual que
          // sin_api_key.
          console.error(
            'Error de YouTube al resolver:', trackActual.artista, '-', trackActual.titulo, '—', json.detalle
          );
          setEstadoResolucion('youtube_error');
        } else if (json.error === 'cuota_agotada') {
          // Solo en modo local (la Data API v3 tiene tope diario; InnerTube,
          // que usa el escritorio, no). Sistémico como los de arriba: hoy no
          // se resuelve nada nuevo, saltar recorrería la cola entera para
          // nada.
          console.error('Cuota diaria de YouTube agotada al resolver:', trackActual.artista, '-', trackActual.titulo);
          setEstadoResolucion('cuota_agotada');
        } else if (json.error === 'error_red') {
          // El dispositivo no pudo llegar a YouTube (sin datos, sin WiFi). En
          // un celular es el caso más común de todos y no tiene nada que ver
          // con este track en particular.
          console.error('Fallo de red al resolver:', trackActual.artista, '-', trackActual.titulo, '—', json.detalle);
          setEstadoResolucion('error_red');
        } else {
          // Acá sí: la búsqueda corrió bien, YouTube simplemente no tiene
          // nada — específico de ESTE track, saltar tiene sentido.
          console.warn('No encontrado en YouTube, se salta:', trackActual.artista, '-', trackActual.titulo);
          // Si el PC tiene el archivo, queda anotada la copia y se avisa «Disponible al sincronizar».
          const paraCopiar = hayColaNativa && (await anotarSiDisponibleEnPC(trackActual.id).catch(() => false));
          if (cancelado) return;
          setEstadoResolucion(paraCopiar ? 'disponible_al_sincronizar' : 'no_encontrado');
          if (paraCopiar && cola.length > 1) setAvisoSalto(`${trackActual.artista} - ${trackActual.titulo}: Disponible al sincronizar.`);
          if (cola.length > 1) siguiente();
        }
      } catch (e) {
        if (cancelado) return;
        // Esto es el propio fetch a /api/resolver fallando (servidor local
        // caído, sin red) — no un error que YouTube haya devuelto. Sistémico
        // por definición (afecta a CUALQUIER track que intente resolver
        // ahora), así que tampoco se salta solo.
        console.error('Error de red al pedir /api/resolver:', trackActual.artista, '-', trackActual.titulo, '—', e);
        setEstadoResolucion('error');
      }
    }

    resolver();
    return () => {
      cancelado = true;
    };
  }, [trackActual, reproducir, cola.length, siguiente, reintentoResolucion]);

  // Android: «repetir» se delega al player nativo (repeat-one), porque con la
  // cola precargada ExoPlayer no emite "terminado" y reiniciar() no llegaría.
  useEffect(() => {
    fijarRepeticion?.(repetir);
  }, [repetir, fijarRepeticion]);

  // «Repetir» vale solo para la canción que suena: al pasar a otra (botones, gesto, pantalla de
  // bloqueo, tocar otra) vuelve a «sin repetir». El efecto de arriba lo propaga al player nativo.
  const idRepetidoRef = useRef(trackActual?.id ?? null);
  useEffect(() => {
    const idNuevo = trackActual?.id ?? null;
    const idAnterior = idRepetidoRef.current;
    idRepetidoRef.current = idNuevo;
    if (repeticionSeCancela({ repetir, idAnterior, idNuevo })) setRepetir(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona al cambio de canción
  }, [trackActual?.id]);

  // Cola nativa (solo Android): mantiene en el reproductor nativo las 3
  // pistas que vienen después de la actual ya resueltas, para que con la
  // pantalla bloqueada (WebView congelado) ExoPlayer pase solo a la siguiente
  // al terminar o con el botón ⏭ del sistema. Misma consulta y trackId que el
  // efecto de resolución de arriba; respeta el orden de `cola` y su
  // circularidad (como siguiente()). Con "repetir" (una) no se precarga nada.
  // Es un ref a función para que el efecto de resolución pueda llamarla justo
  // tras reproducir() sin ponerla en sus dependencias.
  const PISTAS_POR_DELANTE = 25;
  const generacionPrecargaRef = useRef(0);
  const precargarColaRef = useRef(null);
  precargarColaRef.current = async () => {
    if (!hayColaNativa) return;
    const actual = cola[indice];
    const actualId = actual && idReproductor(actual, videoIdResueltoRef.current);
    if (!actualId) return; // se llamará de nuevo cuando termine de resolverse
    const generacion = ++generacionPrecargaRef.current;
    const n = cola.length;
    // Descripción de una pista de la cola para el nativo (videoId resuelto, metadatos, encadenada con
    // la que va justo antes). null = sin resolver (JS la tratará cuando le toque); undefined = la
    // petición quedó obsoleta.
    const describir = async (t, previa, buscar = true) => {
      // Con archivo local en este móvil la pista suena de él (id «local:…»), sin buscar en YouTube.
      const hayLocal = !localesFallidasRef.current.has(t.id) && (await tieneArchivoLocal(t.id).catch(() => false));
      if (generacion !== generacionPrecargaRef.current) return undefined;
      if (hayLocal) videoIdResueltoRef.current.set(t.id, idLocal(t.id));
      let videoId = hayLocal ? idLocal(t.id) : idReproductor(t, videoIdResueltoRef.current);
      if (!videoId && buscar) {
        try {
          videoId = (await resolverVideoId(t.youtubeQuery, t.id)).videoId;
        } catch {
          videoId = null;
        }
        if (generacion !== generacionPrecargaRef.current) return undefined;
        if (videoId) videoIdResueltoRef.current.set(t.id, videoId);
      }
      if (!videoId) return null;
      const meta = metadataDe(t.trackIdReal ?? t.id);
      const cover = meta?.coverUrl ?? t.coverUrl;
      // «Sin fundido en álbumes»: ¿va encadenada con la anterior de la cola (mismo álbum, en orden)?
      const encadenada = encadenadaConAnterior(
        { album: metadataDe(previa.trackIdReal ?? previa.id)?.album, artista: previa.artista },
        { album: meta?.album, artista: t.artista },
        { aleatorio }
      );
      return {
        encadenada,
        videoId,
        trackId: t.id,
        titulo: formatearTitulo(t.titulo),
        artista: formatearTitulo(t.artista),
        portadaUrl: typeof cover === 'string' && cover.startsWith('http') ? cover : null,
      };
    };
    // La anterior de la cola también se deja en el nativo: ⏮ del sistema (auriculares, pantalla de
    // bloqueo) funciona sin despertar el WebView. Sin vuelta al final (JS tampoco la da: ⏮ en la primera
    // no hace nada) y sin gastar búsquedas de YouTube: solo si ya está resuelta (normalmente ya sonó).
    const anteriores = [];
    if (indice > 0) {
      const pasada = await describir(cola[indice - 1], cola[Math.max(0, indice - 2)], false);
      if (pasada === undefined) return;
      if (pasada) anteriores.push(pasada);
    }
    const pistas = [];
    if (!repetir && n > 1) {
      // 25 por delante: las 3 primeras se resuelven a URL en JS; el resto va
      // como "pendientes" y el servicio nativo las resuelve solo si JS no
      // está (app quitada de recientes). Las 3 primeras se mandan en cuanto
      // están, sin esperar a buscar las demás.
      for (let k = 1; k <= Math.min(PISTAS_POR_DELANTE, n - 1); k += 1) {
        if (k === 4 && pistas.length > 0) precargarSiguientes([...pistas], actualId, anteriores);
        const pista = await describir(cola[(indice + k) % n], cola[(indice + k - 1) % n]);
        if (pista === undefined) return;
        if (pista) pistas.push(pista); // sin resolver: JS la tratará cuando le toque
      }
    }
    if (generacion !== generacionPrecargaRef.current) return;
    precargarSiguientes(pistas, actualId, anteriores);
  };
  useEffect(() => {
    precargarColaRef.current?.();
  }, [cola, indice, repetir, aleatorio]);

  // Reproductor miniatura (la ventanita que aparece al minimizar en
  // escritorio). Solo existe dentro de Electron: en el navegador
  // window.musicsippi no está y estos dos efectos no hacen nada.
  //
  // La miniatura no reproduce: el audio sigue acá. Es un control remoto, así
  // que alcanza con publicarle qué suena y escuchar sus tres botones.
  const ultimoEstadoMiniRef = useRef({ clave: '', ts: 0 });
  useEffect(() => {
    if (!window.musicsippi?.publicarEstado) return;
    const meta = trackActual ? metadataDe(trackActual.trackIdReal ?? trackActual.id) : null;
    // Origen que se muestra en «Sonando desde»: un modo/lista (con color) o uno
    // sintético sin id (Infinito, un artista…), que también debe llegar a la notificación.
    const modo = ejeActivo?.nombre
      ? { nombre: formatearTitulo(ejeActivo.nombre), color: ejeActivo.id ? colorDeEje(ejeActivo) : null }
      : null;
    const progreso =
      trackActual && duracion > 0 ? Math.min(1, Math.max(0, tiempo / duracion)) : 0;
    const estado = {
      hayTrack: Boolean(trackActual),
      titulo: trackActual ? formatearTitulo(trackActual.titulo) : '',
      artista: trackActual ? formatearTitulo(trackActual.artista) : '',
      cover: meta?.coverUrl ?? trackActual?.coverUrl ?? null,
      sonando,
      modo,
      favorito: Boolean(trackActual?.ejes?.some((e) => e.ejeId === 'favoritos')),
      aleatorio,
      tinte: colorPortadaActual,
      progreso: Math.round(progreso * 1000) / 1000,
    };
    // El progreso cambia sin parar; lo demás casi nunca. Si solo cambió el
    // progreso, no se publica más de ~4 veces por segundo.
    const { progreso: _p, ...resto } = estado;
    const clave = JSON.stringify(resto);
    const ahora = Date.now();
    const ultimo = ultimoEstadoMiniRef.current;
    if (clave === ultimo.clave && ahora - ultimo.ts < 250) return;
    ultimoEstadoMiniRef.current = { clave, ts: ahora };
    window.musicsippi.publicarEstado(estado);
  }, [trackActual, sonando, metadataDe, ejeActivo, tiempo, duracion, colorPortadaActual, aleatorio]);

  useEffect(() => {
    if (!window.musicsippi?.alRecibirComando) return undefined;
    // Devuelve su propia función para desuscribirse: sin eso, cada re-montaje
    // del efecto dejaría un listener más y un solo clic en la miniatura
    // dispararía la acción varias veces.
    return window.musicsippi.alRecibirComando((comando) => {
      if (comando === 'play-pausa') alternarPausa();
      else if (comando === 'anterior') setIndice((i) => Math.max(0, i - 1));
      else if (comando === 'siguiente') siguiente();
      else if (comando === 'favorito' && trackActual) {
        alternarFavorito(trackActual.id, !trackActual.ejes?.some((e) => e.ejeId === 'favoritos'));
      } else if (comando === 'aleatorio') alternarAleatorioCola();
    });
  }, [alternarPausa, siguiente, trackActual, alternarFavorito, alternarAleatorioCola]);

  const deGusto = ejes.filter((e) => e.tipo === 'gusto' && e.activo && !e.padre && !e.sistema);
  const idsDeGusto = new Set(deGusto.map((e) => e.id));
  // Si el padre de un sub-eje esta oculto (o quedo huerfano por cualquier otro
  // motivo), el hijo no aparece como tarjeta propia (tiene padre) ni como
  // sub-eje (nadie lo va a buscar bajo un padre que no se ve): desaparece por
  // completo de "Modos", tracks y todo, sin ningun aviso. Se muestra como
  // tarjeta independiente para garantizar que siempre haya una forma de llegar.
  const huerfanos = ejes.filter(
    (e) => e.tipo === 'gusto' && e.activo && e.padre && !idsDeGusto.has(e.padre)
  );
  const funcionales = ejes.filter((e) => e.tipo === 'funcional' && e.activo);
  // "Chill" es una lista armada a mano, pero cumple la misma función que
  // "De fondo" (escuchar sin prestar atención) — pedido explícito: que
  // aparezca ahí también, además de en "Mis listas".
  const chill = ejes.find((e) => e.id === 'chill' && e.activo);
  const funcionalesConChill = chill ? [...funcionales, chill] : funcionales;
  // `seguida: true` = playlist editorial/de otro (nombre con año, marketing,
  // "Liked from Radio", etc.) que llegó de un import pero no la armaste vos.
  // Antes tenía su propia sección al fondo del Home ("Que seguís"); ahora se
  // suma a "Para escuchar" — pedido explícito de no separarla, son igual de
  // válidas para escuchar aunque no las hayas armado vos.
  // Favoritos es "gusto" por tipo (para poder marcarse con el corazón como
  // cualquier track), pero funciona como lista, no como modo — mismo
  // criterio que ya usa MenuListas (ver más abajo, `|| e.id === 'favoritos'`
  // en su "listas"). Sin este caso especial no aparecía en ningún lado del
  // Home: `deGusto` la excluye por ser `sistema: true` (para que no se pueda
  // borrar desde Administrar), y `playlists` la excluía por no ser
  // `tipo: 'playlist'`.
  const playlists = ejes.filter(
    (e) => (e.tipo === 'playlist' || e.id === 'favoritos') && e.activo && !e.seguida
  );
  const seguidas = ejes.filter((e) => e.tipo === 'playlist' && e.activo && e.seguida);

  function porPlaysLuegoTracks(a, b) {
    const playsA = conteoPlaysPorEje.get(a.id) ?? 0;
    const playsB = conteoPlaysPorEje.get(b.id) ?? 0;
    return playsB - playsA || (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0);
  }

  // "Mis listas" y "Para escuchar" ordenadas por lo que más se escucha de
  // verdad, no por orden de creación/importación.
  const playlistsOrdenadas = [...playlists].sort(porPlaysLuegoTracks);
  // "Mis listas" del Home específicamente, sin Favoritas — Favoritas ya
  // tiene su propio acceso directo en "Inicio rápido", mostrarla acá de
  // nuevo es la misma tarjeta repetida sin necesidad. playlistsOrdenadas
  // (con Favoritas incluida) sigue intacta para "Listas" del submenú y el
  // menú de "Agregar a lista", donde sí hace falta como destino real.
  const misListasHome = playlistsOrdenadas.filter((e) => e.id !== 'favoritos');
  const paraEscuchar = [...deGusto, ...huerfanos, ...seguidas].sort(porPlaysLuegoTracks);

  // Resuelve los ids guardados contra los ejes ACTUALES: si uno se ocultó o
  // se borró desde que se usó, no debe aparecer acá con datos rotos. Como
  // pidió el usuario, solo se muestran las primeras 6 (no todo lo guardado).
  const seguidos = ultimosModosIds
    .map((id) => ejes.find((e) => e.id === id))
    // `!e.sistema` afuera: "sin-clasificar" es un eje real (con `activo: true`)
    // pero no un modo navegable — si alguna vez se entró ahí (ej. desde
    // Administrar, antes de sacar "Para clasificar") quedaba guardado en
    // ultimosModosIds y volvía a aparecer acá con "0 tracks" para siempre.
    // Pedido explícito: nunca en el Home.
    .filter((e) => e && e.activo && !e.sistema)
    .slice(0, 6);
  const idsSeguidos = new Set(seguidos.map((e) => e.id));

  // Cada sección de tarjetas del Home vive en una sola fila horizontal, sin
  // wrap ni scroll — "las que quepan" según el ancho real del contenedor, no
  // un número fijo adivinado. "Ver todas" expande esa sección puntual a grilla
  // completa (envolviendo en varias filas) en vez de mandar a otra pantalla,
  // porque no existe hoy una vista dedicada de "todas mis listas"/"todo lo de
  // fondo" — construir esa navegación es más de lo que se pidió acá.
  const [listasExpandidas, setListasExpandidas] = useState(false);
  const [redescubrirExpandido, setRedescubrirExpandido] = useState(false);
  const [paraEscucharExpandido, setParaEscucharExpandido] = useState(false);

  // El hero rota entre TUS modos más escuchados (no un único ganador fijo):
  // se arma el top 3 por reproducciones reales (cae a cantidad de tracks si
  // todavía no hay historial) y la hora del día decide cuál de esos 3 se
  // muestra ahora — cambia sola durante el día, siempre entre algo que de
  // verdad escuchás, sin inventar una asociación arbitraria "género = hora".
  // Se descartan los que ya están en "Seguí escuchando" — si no, entrar a un
  // modo y volver lo mostraba dos veces seguidas arriba de todo (la tarjeta
  // de "seguí escuchando" Y el hero, el mismo modo repetido). Si eso deja la
  // lista vacía (biblioteca chica, todo lo escuchado ya está en "seguidos"),
  // se usa la lista completa igual — mejor repetido que sin hero.
  const candidatosHeroSinRepetir = deGusto.filter((e) => !idsSeguidos.has(e.id));
  const candidatosHero = [...(candidatosHeroSinRepetir.length > 0 ? candidatosHeroSinRepetir : deGusto)]
    .sort(porPlaysLuegoTracks)
    .slice(0, 3);
  const modoDestacado =
    candidatosHero.length > 0 ? candidatosHero[new Date().getHours() % candidatosHero.length] : null;

  // Vista previa mientras no hay ningún modo todavía (recién importaste, o el
  // enriquecimiento automático no terminó su primera pasada). Pedido
  // explícito: en vez de dejar este espacio vacío, mostrar de dónde sale una
  // carátula REAL tuya (nunca inventada) para dar una idea de cómo se va a
  // ver esto cuando esté listo. Cualquier playlist ya importada sirve, no
  // hace falta que sea un modo de género.
  //
  // Elección DETERMINÍSTICA (la primera con carátula — misListasHome ya
  // viene ordenada por más escuchada — no al azar), con useMemo normal.
  // Dos bugs reales seguidos acá: (1) al azar con useMemo cambiaba de
  // carátula sola cada vez que biblioteca/covers se actualizaba mientras el
  // enriquecimiento corría; (2) el intento de arreglo con useState congelaba
  // el pick para siempre la primera vez que este componente montaba —
  // las carátulas (metadata-deezer.json) cargan aparte, después del primer
  // render, así que solía congelarse en "no hay nada" antes de que
  // coversDeEje tuviera algo. Determinístico resuelve los dos: no cambia
  // sola porque el resultado es estable mientras la playlist más escuchada
  // sea la misma, y sí reacciona cuando las carátulas terminan de llegar.
  const previaModoAleatoria = useMemo(() => {
    if (modoDestacado) return null;
    return misListasHome.find((e) => (coversDeEje.get(e.id) ?? []).length > 0) ?? null;
  }, [modoDestacado, misListasHome, coversDeEje]);

  const favoritosEje = ejes.find((e) => e.id === 'favoritos');

  // "Lo que casi no escuchás": tenés tracks guardados (conteos > 0) pero
  // ~ninguna reproducción real todavía — para redescubrir biblioteca, no
  // para lo mismo que ya aparece arriba en "Seguí escuchando" o el hero.
  const idsDestacadosArriba = new Set([...idsSeguidos, modoDestacado?.id].filter(Boolean));
  const casiNoEscuchas = [...deGusto, ...funcionalesConChill, ...playlists]
    .filter((e) => (conteos.get(e.id) ?? 0) > 0 && !idsDestacadosArriba.has(e.id))
    .filter((e) => (conteoPlaysPorEje.get(e.id) ?? 0) === 0)
    .sort((a, b) => (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0))
    .slice(0, 6);

  // ---- Interfaz móvil (≤ 820 px) -------------------------------------------
  // Misma app, otra presentación: todo el estado y las acciones de arriba se
  // pasan tal cual a la capa móvil (src/movil/). Nada de lógica nueva aquí.
  if (esMovil) {
    const ctxMovil = {
      // datos
      tracks: tracksMovil,
      tracksTodos: tracks,
      sinConexion: { ...sinConexion, nGuardadas },
      idsLocales,
      ejes,
      recargarDatosLocales,
      conteos,
      tracksDe,
      metadataDe,
      favoritos,
      historial,
      modoDestacado,
      seguidos,
      coversDeEje,
      // reproducción
      trackActual,
      cola,
      indice,
      setIndice,
      sonando,
      tiempo,
      duracion,
      ejeActivo,
      alternarPausa,
      siguiente,
      anterior: () => setIndice((i) => Math.max(0, i - 1)),
      buscar,
      aleatorio,
      alternarAleatorioCola,
      repetir,
      setRepetir,
      reproducirModo,
      reproducirLista,
      reproducirSecuencia,
      leerVectores,
      noMeGusta,
      guardarNoMeGusta: marcarNoMeGusta,
      quitarNoMeGusta,
      sorprenderMe,
      barajar,
      iniciarRadioModo,
      colaAuto,
      radioModo,
      reproducirFavoritas,
      iniciarRadio,
      topArtistas,
      aviso: avisoSalto,
      avisar: setAvisoSalto,
      estadoResolucion,
      modoLocal: MODO_LOCAL,
      bibliotecaCargada,
      quitarDeCola,
      moverACola,
      agregarACola: (pistas) => {
        agregarACola(pistas);
        setAvisoSalto(Array.isArray(pistas) && pistas.length > 1 ? 'Añadidas a la cola' : 'Añadida a la cola');
      },
      reproducirDespues: (pistas) => {
        reproducirDespues(pistas);
        setAvisoSalto('Se reproducirá a continuación');
      },
      temporizador,
      fijarTemporizador,
      reiniciar,
      // acciones de biblioteca (los envoltorios de App, que también actualizan el estado)
      alternarFavorito,
      alternarFavoritoArtista,
      alternarFavoritoAlbum,
      asignarEje: asignarManual,
      quitarModo,
      unirModos,
      guardarColeccion: alternarColeccion,
      guardarOverride,
      quitarTrackSuelto,
      abrirArtista,
      abrirAlbum,
      // carga de datos sin navegar (la navegación la lleva la capa móvil)
      cargarArtista,
      cargarAlbum,
      artista,
      album,
      artistasBiblioteca,
      albumesBiblioteca,
      fotoDeArtista,
      tracksDeArtista: (nombre) => {
        const clave = nombre.trim().toLowerCase();
        return tracksVisibles
          .filter((t) => separarArtistas(t.artista, artistasSolos).some((n) => n.toLowerCase() === clave))
          .sort((a, b) => formatearTitulo(a.titulo).localeCompare(formatearTitulo(b.titulo)));
      },
      reproducirAlbum,
      reproducirCancionesArtista,
      agregarAlbum,
      agregarTrackSuelto,
      buscarExterno,
      agregarExterno: agregarTrackExterno,
      importacion,
      crearEje,
      guardarEjes,
      // componentes de escritorio reutilizados (evita importar App.jsx desde src/movil)
      componentes: {
        EditorEjes,
        Ayuda,
        Escribinos,
        AcercaDe,
        SincronizacionMovil: () => <SincronizacionMovil recargarDatosLocales={recargarDatosLocales} />,
      },
    };
    return (
      <>
        <ShellMovil ctx={ctxMovil} />
        {avisoSincronizacion && (
          <div
            className="aviso-sincronizacion"
            role="status"
            onClick={() => avisoSincronizacion.fase === 'error' && setAvisoSincronizacion(null)}
          >
            {avisoSincronizacion.fase === 'sincronizando' && `Sincronizando con el PC (${avisoSincronizacion.direccion})…`}
            {avisoSincronizacion.fase === 'listo' &&
              `Sincronizado: ${avisoSincronizacion.canciones} canciones y ${avisoSincronizacion.modos} modos.`}
            {avisoSincronizacion.fase === 'error' && `No se pudo sincronizar: ${avisoSincronizacion.mensaje}`}
          </div>
        )}
        {/* Solo audio (iframe de YouTube en web/Electron): fuera de pantalla, como en escritorio. */}
        <div className="video" aria-hidden="true">
          <div ref={contenedorRef} />
        </div>
      </>
    );
  }

  // Escritorio: interfaz en un chunk perezoso (el móvil nunca la carga). El contenedor
  // del player se queda acá, fuera del Suspense: la IFrame API necesita que el nodo
  // exista al montar la app (si no, no crea nada y nunca reintenta).
  const ctxEscritorio = {
    abrirAlbum,
    abrirArtista,
    aceptarAvisoModosNuevos,
    agregarACola,
    agregarAlbum,
    agregarTrackExterno,
    agregarTrackSuelto,
    album,
    albumesBiblioteca,
    albumesPorArtista,
    aleatorio,
    alternarAleatorioCola,
    alternarAleatorioYReproducir,
    alternarColeccion,
    alternarFavorito,
    alternarFavoritoAlbum,
    alternarFavoritoArtista,
    alternarPausa,
    alternarSilencio,
    artista,
    artistasBiblioteca,
    artistasDeEje,
    artistasSolos,
    asignarManual,
    avisoModosNuevos,
    avisoSalto,
    avisoSincronizacion,
    buscar,
    busqueda,
    cabeceraInnerRef,
    cabeceraOuterRef,
    cambiarVolumen,
    casiNoEscuchas,
    cerrarLetras,
    cerrarOnboarding,
    clasificacionAsistida,
    cola,
    conteos,
    coversDeEje,
    crearEje,
    crearListaRapida,
    descartarAvisoModosNuevos,
    duracion,
    duracionesTotales,
    ejeActivo,
    ejeVista,
    ejes,
    ejesDelTrackActual,
    entrarAModo,
    esDemo,
    estadoEnriquecimiento,
    estadoResolucion,
    favoritos,
    favoritosEje,
    fijarTemporizador,
    fotoDeArtista,
    guardarEjes,
    guardarOverride,
    historial,
    importarMusicaLocal,
    importarTuneMyMusic,
    indice,
    iniciarRadio,
    irADestinoTour,
    irAImportarMusica,
    listasExpandidas,
    metadataDe,
    misListasHome,
    modoBuscador,
    modoDestacado,
    mostrarAvisoImportar,
    mostrarOnboarding,
    moverACola,
    ocultarModo,
    paraEscuchar,
    paraEscucharExpandido,
    pausar,
    pendientesDeClasificar,
    playlistsOrdenadas,
    previaModoAleatoria,
    quitarDeCola,
    quitarModo,
    quitarTrackSuelto,
    redescubrirExpandido,
    reiniciar,
    repetir,
    reproducirAlbum,
    reproducirCancionesArtista,
    reproducirFavoritas,
    reproducirLista,
    reproducirModo,
    reproducirSinNavegar,
    revisionModos,
    seguidas,
    seguidos,
    setAleatorio,
    setAvisoSincronizacion,
    setBusqueda,
    setClasificacionAsistida,
    setEjeVista,
    setIndice,
    setListasExpandidas,
    setModoBuscador,
    setMostrarOnboarding,
    setParaEscucharExpandido,
    setRedescubrirExpandido,
    setRepetir,
    setRevisionModos,
    setTabConfiguracion,
    setVerLetras,
    setVista,
    siguiente,
    sonando,
    sorprenderMe,
    tabConfiguracion,
    temporizador,
    tiempo,
    topArtistas,
    trackActual,
    tracks,
    tracksDe,
    tracksVisibles,
    tracksVista,
    verLetras,
    vista,
    volumen,
    volverAtras,
    alMontar: () => setEscritorioMontado(true),
  };
  return (
    <>
      <Suspense fallback={<div className="app" />}>
        <AppEscritorio ctx={ctxEscritorio} />
      </Suspense>
      {/* Solo audio: este nodo vive fuera del viewport (ver .video en styles.css). */}
      <div className="video" aria-hidden="true">
        <div ref={contenedorRef} />
      </div>
    </>
  );
}

