// Componentes solo de escritorio. Se cargan perezosos junto con AppEscritorio.jsx.
import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { MODO_LOCAL } from '../config/modo.js';
import { traducirError } from '../../scripts/lib/traducir-error.mjs';
import { decodificarTextoDeArchivo } from '../../scripts/lib/decodificar-texto.mjs';
import { obtenerTendencias, obtenerRecomendaciones } from '../data/catalogo.js';
import { restaurarBackup as restaurarBackupApi, reiniciarTodo as reiniciarTodoApi } from '../data/administracion.js';
import { GENEROS_DEEZER } from '../data/generos.js';
import { cargarFuentesManual } from '../data/fuentes.js';
import { obtenerSugerenciasClasificacion } from '../data/clasificacion.js';
import { resolverVideoId, buscarExterno } from '../data/reproduccion.js';
import { leerNivelar, guardarNivelar } from '../data/nivelar-volumen.js';
import { formatearTitulo, reloj, colorDeEje } from '../ui/formato.js';
import { fotoEsValida, colorDeArtista, Icono, separarArtistas, Ayuda, Escribinos, EditorEjes, SincronizacionMovil, AcercaDe } from './compartido.jsx';



// Versión liviana (sin sha1, corre en el navegador) de la normalización que
// usa el servidor para decidir "esto ya existe" al agregar un track externo
// — ver clasificar.mjs/idTrack. No necesita ser idéntica: es una señal para
// el usuario ANTES de tocar nada ("esto ya lo tenés"), la que de verdad
// decide si se duplica sigue siendo el id real del servidor en /agregar-track.
export function normalizarParaMatch(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
export function tituloParaMatch(t) {
  return normalizarParaMatch(
    t
      .replace(/\s*[([](feat\.|ft\.|with|from|official (music )?video|official audio|lyrics?|full hd)[^)\]]*[)\]]/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
export function artistaParaMatch(a) {
  return normalizarParaMatch(a.split(/\s*·\s*|\s*,\s*|\s+vs\s+/)[0].trim());
}

export function tiempoRelativo(ts) {
  const seg = Math.floor((Date.now() - ts) / 1000);
  if (seg < 60) return 'recién';
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const dias = Math.floor(hs / 24);
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

/** Iniciales de hasta 2 palabras — "Siempre Es Hoy" -> "SE" — para el
 * mismo tipo de icono de color que colorDeArtista cuando no hay carátula. */
export function inicialesDe(texto) {
  const palabras = formatearTitulo(texto).split(/\s+/).filter(Boolean);
  return (palabras[0]?.[0] ?? '') + (palabras[1]?.[0] ?? '');
}

/**
 * <img> con fallback a iniciales de color, reusado en los lugares donde
 * antes cada uno tenía su propia versión de `foto ? <img> : <iniciales>`.
 * La diferencia real con esas copias: acá el fallback también se activa si
 * la URL SÍ existía pero la carga falla EN EL MOMENTO (403 de Deezer por
 * rate-limit, CDN caído, etc.) — el bug reportado como "muchos artistas/
 * álbumes generan error en las imágenes". Antes la rama <img> se elegía una
 * sola vez según los datos (`foto ? <img> : ...`) y se quedaba ahí para
 * siempre así fallara la carga real, sin caer nunca al mismo placeholder
 * que ya se usaba para "todavía no hay foto".
 */
export function FotoOIniciales({
  foto,
  nombre,
  nombreColor = nombre,
  nombreIniciales = nombre,
  className,
  claseVacia,
  loading = 'lazy',
  onClick,
  style,
}) {
  const [fallo, setFallo] = useState(false);
  const src = fotoEsValida(foto) ? foto : null;
  if (src && !fallo) {
    return (
      <img
        className={className}
        src={src}
        alt=""
        loading={loading}
        onError={() => setFallo(true)}
        onClick={onClick}
        style={style}
      />
    );
  }
  if (!claseVacia) return inicialesDe(nombreIniciales);
  return (
    <span
      className={claseVacia}
      style={{ background: colorDeArtista(nombreColor), ...style }}
      aria-hidden="true"
      onClick={onClick}
    >
      {inicialesDe(nombreIniciales)}
    </span>
  );
}

/**
 * Toma el primer archivo de un <input type="file"> onChange y se lo pasa a
 * `fn` — pero recién limpia `input.value` DESPUÉS de que `fn` termina (éxito
 * o error), nunca antes. Un archivo de varios cientos de KB queda respaldado
 * en disco por el navegador (no en memoria); limpiar el input mientras
 * todavía no se terminó de leer invalida ese respaldo — el error resultante
 * es un DOMException "A requested file or directory could not be found...",
 * no algo del archivo en sí. Con archivos chicos nunca se nota. Usarla en
 * cualquier manejador de <input type="file"> que lea contenido (`.text()`)
 * para no reintroducir este bug — no hace falta acordarse del `finally` cada
 * vez.
 */
export async function conArchivoDeInput(e, fn) {
  const input = e.target;
  const archivo = input.files?.[0];
  if (!archivo) return;
  try {
    await fn(archivo);
  } finally {
    input.value = '';
  }
}


/** Duración de un modo/lista entero — "6h 40min" o "42min", no mm:ss. */
export function duracionLarga(ms) {
  if (!ms) return null;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return h > 0 ? `${h}h ${min}min` : `${min}min`;
}

// iOS bloquea el volumen por JavaScript a nivel de plataforma (Android y
// desktop sí funcionan) — mostrar el control ahí sería un slider que no hace
// nada. Se detecta una sola vez, no cambia durante la sesión.
export const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Recorrido corto de bienvenida — pedido explícito de reemplazar el modal
// centrado de antes por globos con flecha que señalan el elemento REAL en
// pantalla (mismo espíritu que un tour de producto), navegando solo entre
// pantallas cuando hace falta y terminando siempre en Cargar biblioteca —
// el paso más importante, para que el recorrido desemboque directo en la
// acción. Cada paso apunta a un elemento marcado con `data-tour="..."` en el
// JSX (ver .submenu, el botón "Configuración", el tile "Infinito" y la
// pestaña "Cargar biblioteca"). `destino` es la clave que le dice a
// `irADestinoTour` (más abajo, en App) a qué pantalla navegar antes de medir
// la posición de ese elemento.
export const PASO_TOUR_MODOS = {
  destino: 'modos',
  selector: '[data-tour="modos"]',
  icono: 'aleatorio',
  titulo: 'Tu música, en tus propios modos',
  texto:
    'Musicsippi no adivina qué te gusta con un algoritmo. Organiza tu biblioteca en "modos de escucha" que vos definís: pop-dance, rock latino, para trabajar, para el gimnasio… los que quieras. Estos accesos llevan directo a tus modos.',
};

export const PASO_TOUR_EXPLORAR = {
  destino: 'modos',
  selector: '[data-tour="explorar"]',
  icono: 'explorar',
  titulo: 'Sumá canciones sueltas cuando quieras',
  texto:
    'No hace falta re-exportar nada para agregar un tema nuevo. Este botón busca en YouTube en tiempo real: escuchás, asignás a un modo y lo agregás a tu biblioteca al toque.',
};

export const PASO_TOUR_CLASIFICACION = {
  destino: 'modos',
  selector: '[data-tour="configuracion"]',
  icono: 'historial',
  titulo: 'Se clasifica sola',
  texto:
    'Cada canción nueva se asigna a un modo automáticamente por artista, sin ninguna clave ni servicio pago. Lo que no matchea queda en "Sin clasificar" para que lo asignes vos una vez. Si alguna vez lo querés revisar a mano, está acá en Configuración.',
};

export const PASO_TOUR_INFINITO = {
  destino: 'modos',
  selector: '[data-tour="infinito"]',
  icono: 'infinito',
  titulo: 'Infinito: tu propia radio',
  texto:
    'Este botón mezcla TODA tu biblioteca y no para nunca: la cola vuelve a empezar sola al llegar al final. Es la forma más rápida de simplemente apretar play sin elegir nada.',
};

// Paso extra, SOLO para el build de demo (ver esDemo en OnboardingTour más
// abajo): las canciones que ya están cargadas son de muestra, no la
// biblioteca de quien está probando la app — sin este aviso, nada en la app
// dice que se pueden borrar y reemplazar por música real. Apunta al aviso
// real que ya está en pantalla (mostrarAvisoImportar en App), no a un globo
// sin destino.
export const PASO_TOUR_DEMO = {
  destino: 'modos',
  selector: '.banner-modos-nuevos',
  icono: 'disco',
  titulo: 'Las canciones que ves son de ejemplo',
  texto:
    'Esta es una demo: las 6 canciones que ya están cargadas son solo para que veas cómo funciona, no tu música. Cuando quieras cargar la tuya, este aviso te trae directo a Cargar biblioteca, el siguiente paso de este recorrido.',
};

// Último paso a propósito (pedido explícito): el recorrido termina EN la
// sección de cargar biblioteca, no solo señalándola, para desembocar
// directo en la acción más importante.
export const PASO_TOUR_CARGAR = {
  destino: 'cargar',
  selector: '[data-tour="cargar-biblioteca"]',
  icono: 'subir',
  titulo: 'El paso más importante: cargá tu biblioteca',
  texto:
    'Exportá tu música desde Spotify, Apple Music, YouTube Music o Amazon Music con tunemymusic.com (gratis) y subí el CSV acá, o, si tenés mp3 descargados en tu disco, elegí directamente esa carpeta. Podés cargar varias veces: nunca borra lo que ya subiste.',
};

export function armarPasosTour(esDemo) {
  const pasos = [PASO_TOUR_MODOS, PASO_TOUR_EXPLORAR, PASO_TOUR_CLASIFICACION, PASO_TOUR_INFINITO];
  if (esDemo) pasos.push(PASO_TOUR_DEMO);
  pasos.push(PASO_TOUR_CARGAR);
  return pasos;
}

// Ancho fijo del globo — se usa tanto para posicionarlo (clampeado a los
// bordes de la ventana) como para ubicar la flecha dentro de él.
export const ANCHO_GLOBO_TOUR = 320;
export const MARGEN_GLOBO_TOUR = 12;

export function OnboardingTour({ onCerrar, esDemo, onIrADestino }) {
  const pasos = useMemo(() => armarPasosTour(esDemo), [esDemo]);
  const [paso, setPaso] = useState(0);
  const [rect, setRect] = useState(null);
  const esUltimo = paso === pasos.length - 1;
  const actual = pasos[paso];

  // Navega a la pantalla del paso actual y, recién cuando React ya aplicó
  // ese cambio Y volvió a pintar (de ahí el doble rAF: el primero corre
  // apenas se aplica el nuevo estado, el layout todavía puede no estar
  // actualizado), mide dónde quedó el elemento real para poner el globo y
  // el recorte de foco ahí. Si el elemento no existe (por ejemplo el aviso
  // de demo ya no está porque se cargó música real entre pasos), rect queda
  // en null y el globo cae al centro sin recorte, en vez de romperse.
  useEffect(() => {
    onIrADestino(actual.destino);
    let cancelado = false;
    function medir() {
      if (cancelado) return;
      const el = document.querySelector(actual.selector);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    // Además del doble rAF inicial, remide varias veces durante el primer
    // segundo: en el primer paso (justo al abrir la app) la ventana de
    // Electron todavía puede estar terminando de acomodar su tamaño real, y
    // eso corría el menú principal después de la primera medición — se veía
    // como que "el globo se mueve solo" (reportado explícitamente). Estas
    // remediciones tempranas absorben ese corrimiento antes de que la
    // persona llegue a fijarse en la posición del globo.
    const id0 = requestAnimationFrame(() => requestAnimationFrame(medir));
    const ids = [150, 350, 700].map((ms) => setTimeout(medir, ms));
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      cancelado = true;
      cancelAnimationFrame(id0);
      ids.forEach(clearTimeout);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  function siguiente() {
    if (esUltimo) onCerrar();
    else setPaso((p) => p + 1);
  }

  let estiloGlobo;
  let estiloFlecha = null;
  let claseFlecha = 'onboarding-tour-flecha-arriba';
  if (rect) {
    const espacioAbajo = window.innerHeight - rect.bottom;
    const vaArriba = espacioAbajo < 200 && rect.top > espacioAbajo;
    let left = rect.left + rect.width / 2 - ANCHO_GLOBO_TOUR / 2;
    left = Math.max(MARGEN_GLOBO_TOUR, Math.min(left, window.innerWidth - ANCHO_GLOBO_TOUR - MARGEN_GLOBO_TOUR));
    estiloGlobo = vaArriba
      ? { left, bottom: window.innerHeight - rect.top + MARGEN_GLOBO_TOUR }
      : { left, top: rect.bottom + MARGEN_GLOBO_TOUR };
    claseFlecha = vaArriba ? 'onboarding-tour-flecha-abajo' : 'onboarding-tour-flecha-arriba';
    const flechaLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - left, ANCHO_GLOBO_TOUR - 16));
    estiloFlecha = { left: flechaLeft };
  } else {
    estiloGlobo = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  }

  return (
    <div className="onboarding-tour" role="dialog" aria-modal="true" aria-label="Bienvenida a Musicsippi">
      {rect ? (
        <div
          className="onboarding-tour-foco"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : (
        <div className="onboarding-tour-fondo-completo" />
      )}
      <div className="onboarding-tarjeta onboarding-globo" style={estiloGlobo}>
        {estiloFlecha && <span className={`onboarding-tour-flecha ${claseFlecha}`} style={estiloFlecha} />}
        <button className="onboarding-saltar" onClick={onCerrar}>
          Saltar
        </button>
        <div className="onboarding-icono">
          <Icono nombre={actual.icono} tamano={24} />
        </div>
        <h2>{actual.titulo}</h2>
        <p>{actual.texto}</p>
        <div className="onboarding-puntos">
          {pasos.map((_, i) => (
            <span key={i} className={i === paso ? 'activo' : ''} />
          ))}
        </div>
        <div className="onboarding-acciones">
          {paso > 0 && (
            <button className="onboarding-atras" onClick={() => setPaso((p) => p - 1)}>
              Atrás
            </button>
          )}
          <button className="onboarding-siguiente" onClick={siguiente}>
            {esUltimo ? 'Empezar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Pantalla de revisión de modos descubiertos: por cada modo candidato del
 * descubrimiento automático (Tareas 12-14) la persona puede renombrar,
 * fusionar con otro o descartarlo, y además activar de forma opcional los
 * modos transversales (Entrenar/Dormir/Caminar/Nostalgia/Trabajar — ver
 * fuentes.json) — ver spec 4.3/4.4 en
 * docs/superpowers/specs/2026-09-04-modos-dinamicos-design.md.
 *
 * Se muestra al aceptar el banner `avisoModosNuevos` (import por terminal,
 * ver aceptarAvisoModosNuevos más arriba) — un import hecho desde la app
 * (CSV o mp3 local) ya no la dispara, ver
 * docs/superpowers/specs/2026-09-11-quitar-revision-modos-post-import-design.md.
 * Como antes, no se escribe nada a ejes.json/biblioteca.json hasta confirmar.
 *
 * `transversalesDisponibles` ya viene con el conteo de tracks que tendría
 * cada transversal SI se activara (calculado en el servidor, POST
 * /api/descubrir-modos, propagando por embeddings la descripción de cada
 * transversal contra la biblioteca — no se descubren solos). Si un
 * transversal no llega a `masaMinima` se muestra igual, pero advirtiendo,
 * para que la decisión de activarlo sea informada.
 */
export function PantallaRevisionModos({ modosIniciales, transversalesDisponibles, masaMinima, onConfirmar, onCancelar }) {
  const [modos, setModos] = useState(() => modosIniciales.map((m) => ({ ...m, descartado: false })));
  const [transversalesActivos, setTransversalesActivos] = useState(new Set());
  // Índice (en `modos`) del modo que se está por fusionar hacia otro, o null
  // si no hay ninguna fusión en curso. Fusionar es de dos pasos (elegir
  // origen, después elegir destino) para no necesitar un <select> por fila.
  const [fusionDesde, setFusionDesde] = useState(null);

  function renombrar(indice, nuevoNombre) {
    setModos((prev) => prev.map((m, i) => (i === indice ? { ...m, nombre: nuevoNombre } : m)));
  }

  function fusionar(indiceOrigen, indiceDestino) {
    setModos((prev) => {
      const copia = [...prev];
      // Set, no concat directo: un track puede matchear el vocabulario de
      // ambos modos a la vez (candidatos de descubrir-modos.mjs no son
      // disjuntos), así que sin esto el conteo mostrado acá quedaría más
      // alto que el real (confirmar-modos ya deduplica por ejeId al asignar,
      // ver asignarTrack en vite.config.js).
      copia[indiceDestino] = {
        ...copia[indiceDestino],
        trackIds: [...new Set([...copia[indiceDestino].trackIds, ...copia[indiceOrigen].trackIds])],
      };
      copia[indiceOrigen] = { ...copia[indiceOrigen], descartado: true };
      return copia;
    });
  }

  function descartar(indice) {
    setModos((prev) => prev.map((m, i) => (i === indice ? { ...m, descartado: true } : m)));
    if (fusionDesde === indice) setFusionDesde(null);
  }

  function confirmar() {
    onConfirmar({
      modosConfirmados: modos.filter((m) => !m.descartado).map(({ nombre, trackIds }) => ({ nombre, trackIds })),
      transversalesActivados: transversalesDisponibles.filter((t) => transversalesActivos.has(t.id)),
    });
  }

  // Se conserva el índice original de `modos` (no el de este array filtrado)
  // porque renombrar/fusionar/descartar operan sobre esa posición real.
  const modosActivos = modos.map((m, i) => ({ ...m, indice: i })).filter((m) => !m.descartado);

  return (
    <div className="revision-modos-fondo" role="dialog" aria-modal="true" aria-label="Revisar modos descubiertos">
      <div className="revision-modos-tarjeta">
        <h2>Encontré estos grupos en tu música</h2>
        <p className="ayuda">
          Renombrá, fusioná o descartá lo que no te sirva. No se aplica nada hasta que confirmes.
        </p>
        {modosActivos.length === 0 && <p className="ayuda">No queda ningún modo por confirmar.</p>}
        {modosActivos.map((modo) => (
          <div key={modo.indice} className="revision-modo-fila">
            <input
              className="revision-modo-nombre"
              value={modo.nombre}
              onChange={(e) => renombrar(modo.indice, e.target.value)}
              aria-label="Nombre del modo"
            />
            <span className="revision-modo-conteo">{modo.trackIds.length} tracks</span>
            {fusionDesde === modo.indice ? (
              <button className="revision-modo-boton" onClick={() => setFusionDesde(null)}>
                Cancelar fusión
              </button>
            ) : fusionDesde !== null ? (
              <button
                className="revision-modo-boton"
                onClick={() => {
                  fusionar(fusionDesde, modo.indice);
                  setFusionDesde(null);
                }}
              >
                Fusionar acá
              </button>
            ) : (
              modosActivos.length > 1 && (
                <button className="revision-modo-boton" onClick={() => setFusionDesde(modo.indice)}>
                  Fusionar con...
                </button>
              )
            )}
            <button className="revision-modo-descartar" onClick={() => descartar(modo.indice)}>
              Descartar
            </button>
          </div>
        ))}
        {transversalesDisponibles.length > 0 && (
          <>
            <h3>Modos transversales (opcionales)</h3>
            <p className="ayuda">
              Cruzan a los de arriba: un tema puede estar a la vez en un modo descubierto y en un transversal.
            </p>
            {transversalesDisponibles.map((t) => {
              const cantidad = t.trackIds?.length ?? 0;
              const pocaMasa = cantidad < masaMinima;
              return (
                <label key={t.id} className="revision-transversal-fila">
                  <input
                    type="checkbox"
                    checked={transversalesActivos.has(t.id)}
                    onChange={(e) =>
                      setTransversalesActivos((prev) => {
                        const copia = new Set(prev);
                        if (e.target.checked) copia.add(t.id);
                        else copia.delete(t.id);
                        return copia;
                      })
                    }
                  />
                  <span>
                    {t.nombre} ({cantidad} tracks si se activa)
                    {pocaMasa && (
                      <span className="revision-transversal-aviso">
                        {' '}
                        ({cantidad === 0 ? 'ningún track coincide' : 'pocos tracks, puede no valer la pena'})
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </>
        )}
        <div className="revision-modos-acciones">
          <button className="onboarding-atras" onClick={onCancelar}>
            Ahora no
          </button>
          <button className="onboarding-siguiente" onClick={confirmar}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Clasificación manual asistida (Tarea 17): lo que quedó en
 * 'sin-clasificar' nunca pregunta "¿de qué género es esto?" — muestra UN
 * track a la vez con la sugerencia ya calculada por el servidor (mejor
 * candidato por embeddings, aunque no llegue al umbral de clasificación
 * automática — ver POST /api/sugerencia-clasificacion, mejorCandidato en
 * scripts/lib/clasificar-embeddings.mjs) y tres acciones: aprobar, elegir
 * otro modo de la lista, o saltar.
 *
 * Se abre solo on-demand (botón "Clasificar ahora" en Configuración →
 * Administrar, junto al contador pasivo) — nunca sola: no hay pantalla
 * dedicada de "Para clasificar" desde que se sacó por baja señal (ver el
 * comentario junto a `pendientesDeClasificar` más arriba), así que esto
 * respeta el mismo pedido explícito de no aparecer en el Home ni en la
 * navegación global.
 *
 * Saltar no llama a ningún endpoint: solo avanza local (`saltados`), y ese
 * track no vuelve a aparecer mientras esta pantalla siga abierta (spec:
 * "nunca insiste ni repregunta el mismo track después de saltarlo en la
 * misma sesión de la pantalla").
 */
export function ClasificacionAsistida({
  tracks,
  ejes,
  metadataDe,
  onAsignar,
  onCrearEje,
  onCerrar,
  sonandoPrincipal,
  onPausarPrincipal,
}) {
  // Mismo filtro que pendientesDeClasificar (más arriba en este archivo):
  // para que el número que la persona vio en el botón "Clasificar ahora"
  // coincida con lo que esta pantalla realmente va a mostrarle.
  const tracksPendientes = useMemo(
    () => tracks.filter((t) => t.ejes.some((a) => a.ejeId === 'sin-clasificar') && !t.generoSimple),
    [tracks]
  );

  // Espejo de ejesClasificables (scripts/lib/clasificar-embeddings.mjs): esa
  // lib no se importa directa en el navegador porque arrastra el pipeline de
  // @huggingface/transformers (el modelo de embeddings), que solo corre
  // server-side (Hueco 2 de la Tarea 17) — misma condición replicada acá a
  // mano en vez de traer esa dependencia pesada al bundle del cliente.
  const ejesDisponibles = useMemo(
    () =>
      ejes
        .filter((e) => e.activo && !e.sistema && (e.tipo === 'gusto' || e.tipo === 'funcional'))
        // Pedido explícito: con 30+ modos descubiertos, el orden de creación
        // (que es como quedaban antes) no ayuda a encontrar uno puntual en
        // el desplegable — alfabético sí.
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [ejes]
  );

  // Tracks saltados O ya resueltos en esta apertura de la pantalla — en
  // ambos casos, no se vuelven a mostrar. Para los resueltos es en realidad
  // redundante con que `tracks` ya no los va a incluir en tracksPendientes
  // (asignarManual actualiza ese track en el estado del padre), pero
  // marcarlo acá también evita depender del timing de ese re-render.
  const [saltados, setSaltados] = useState(() => new Set());
  const [sugerenciasPorTrackId, setSugerenciasPorTrackId] = useState(new Map());
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cola = useMemo(
    () => tracksPendientes.filter((t) => !saltados.has(t.id)),
    [tracksPendientes, saltados]
  );
  const trackActual = cola[0] ?? null;

  // Preview de audio: pedido explícito (sin poder escuchar la canción, elegir
  // a qué modo va es "decidir a ciegas" — con 115 canciones por revisar y
  // muchas de artistas desconocidos, era prácticamente imposible). Es un
  // reproductor de YouTube SEPARADO del principal (un <iframe> propio, no el
  // que maneja useYouTube.js): así aprobar/saltar/cerrar nunca puede tocar la
  // reproducción real, en ningún sentido — ni pisarla, ni heredar sus bugs.
  // 'inactivo' | 'cargando' | 'sonando' | 'error'.
  const [previewEstado, setPreviewEstado] = useState('inactivo');
  const [previewVideoId, setPreviewVideoId] = useState(null);
  // Refleja trackActual.id en un ref para poder comparar contra el track
  // vigente desde dentro de la promesa de resolverVideoId: sin esto, un
  // resultado que llega tarde (el usuario ya aprobó/saltó y avanzó) pisaría
  // el estado del preview con el video de un track que ya no se está viendo.
  const trackActualIdRef = useRef(trackActual?.id ?? null);
  useEffect(() => {
    trackActualIdRef.current = trackActual?.id ?? null;
    // Cambiar de track (aprobar, saltar) corta cualquier preview en curso —
    // desmontar el <iframe> de abajo es lo que de verdad para el audio.
    setPreviewEstado('inactivo');
    setPreviewVideoId(null);
  }, [trackActual?.id]);

  async function alternarPreview() {
    if (previewEstado === 'sonando' || previewEstado === 'cargando') {
      setPreviewEstado('inactivo');
      setPreviewVideoId(null);
      return;
    }
    if (!trackActual) return;
    // No tiene sentido escuchar dos cosas a la vez — se pausa la principal
    // una sola vez, al arrancar el preview, nunca de forma espontánea.
    if (sonandoPrincipal) onPausarPrincipal?.();

    const idAlPedir = trackActual.id;
    if (trackActual.youtubeVideoId) {
      setPreviewVideoId(trackActual.youtubeVideoId);
      setPreviewEstado('sonando');
      return;
    }
    setPreviewEstado('cargando');
    try {
      const { videoId } = await resolverVideoId(trackActual.youtubeQuery, trackActual.id);
      if (trackActualIdRef.current !== idAlPedir) return;
      if (!videoId) {
        setPreviewEstado('error');
        return;
      }
      setPreviewVideoId(videoId);
      setPreviewEstado('sonando');
    } catch {
      if (trackActualIdRef.current === idAlPedir) setPreviewEstado('error');
    }
  }

  // Se piden TODAS las sugerencias de una sola vez al abrir la pantalla (un
  // solo POST por lote, no uno por track a medida que se van mostrando) —
  // mismo espíritu que calcularTransversalesDisponibles en vite.config.js:
  // calcular una vez, comparar contra el índice de vectores ya poblado.
  // Deliberadamente solo al montar: si `tracks` cambia mientras la pantalla
  // está abierta (aprobar dispara setTracks para ESE track puntual), no hace
  // falta volver a pedir sugerencias para el resto de la cola.
  useEffect(() => {
    let cancelado = false;
    const trackIds = tracksPendientes.map((t) => t.id);
    if (trackIds.length === 0) {
      setCargando(false);
      return undefined;
    }
    obtenerSugerenciasClasificacion(trackIds)
      .then((sugerencias) => {
        if (cancelado) return;
        setSugerenciasPorTrackId(new Map(sugerencias.map((s) => [s.trackId, s])));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function aplicar(ejeId) {
    if (!trackActual || enviando) return;
    setEnviando(true);
    setAviso(null);
    const trackId = trackActual.id;
    try {
      const propagadas = await onAsignar(trackId, ejeId);
      setSaltados((s) => new Set(s).add(trackId));
      if (propagadas > 0) {
        setAviso(
          `Además reclasifiqué ${propagadas} ${propagadas === 1 ? 'canción más' : 'canciones más'} del mismo artista.`
        );
      }
    } catch (e) {
      window.alert(`No se pudo guardar: ${traducirError(e)}`);
    } finally {
      setEnviando(false);
    }
  }

  function saltar() {
    if (!trackActual) return;
    setAviso(null);
    setSaltados((s) => new Set(s).add(trackActual.id));
  }

  // Pedido explícito: antes, si ninguno de los modos existentes encajaba, no
  // había forma de resolverlo sin salir a Administrar modos/listas, crear el
  // modo ahí, y volver a "Clasificar ahora" a buscar de nuevo el mismo
  // track. Crea el modo (tipo "gusto", igual que el default del formulario
  // de Administrar) y de una lo asigna al track actual.
  const [creandoModo, setCreandoModo] = useState(false);
  const [nombreModoNuevo, setNombreModoNuevo] = useState('');

  async function crearYAsignar() {
    const nombre = nombreModoNuevo.trim();
    if (!nombre || !onCrearEje) return;
    const nuevoId = await onCrearEje(nombre, 'gusto');
    setNombreModoNuevo('');
    setCreandoModo(false);
    if (nuevoId) aplicar(nuevoId);
  }

  if (tracksPendientes.length === 0) {
    return (
      <div className="revision-modos-fondo" role="dialog" aria-modal="true" aria-label="Clasificación asistida">
        <div className="revision-modos-tarjeta clasificacion-asistida-tarjeta">
          <h2>Nada para clasificar</h2>
          <p className="ayuda">No queda ninguna canción sin modo por ahora.</p>
          <div className="revision-modos-acciones">
            <button className="revision-modo-boton" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!trackActual) {
    return (
      <div className="revision-modos-fondo" role="dialog" aria-modal="true" aria-label="Clasificación asistida">
        <div className="revision-modos-tarjeta clasificacion-asistida-tarjeta">
          <h2>Por ahora es todo</h2>
          <p className="ayuda">
            Saltaste el resto. Seguís teniendo {tracksPendientes.length}{' '}
            {tracksPendientes.length === 1 ? 'canción sin clasificar' : 'canciones sin clasificar'}, podés volver
            cuando quieras.
          </p>
          <div className="revision-modos-acciones">
            <button className="revision-modo-boton" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sugerencia = sugerenciasPorTrackId.get(trackActual.id);
  // Pedido explícito: en el lote de "sin clasificar" hay muchas canciones de
  // bandas sonoras de películas/series, y el nombre del ÁLBUM suele ser el
  // dato que más rápido delata eso a simple vista (el álbum es literalmente
  // el nombre de la película) — antes esta pantalla no mostraba el álbum
  // en absoluto, solo artista y título.
  const metaActual = metadataDe(trackActual.id);

  return (
    <div className="revision-modos-fondo" role="dialog" aria-modal="true" aria-label="Clasificación asistida">
      <div className="revision-modos-tarjeta clasificacion-asistida-tarjeta">
        <h2>Clasificación asistida</h2>
        <p className="ayuda">
          {tracksPendientes.length - cola.length + 1} de {tracksPendientes.length}
        </p>
        <p className="clasificacion-asistida-track">
          <button
            type="button"
            className="clasificacion-asistida-preview"
            onClick={alternarPreview}
            disabled={previewEstado === 'cargando'}
            title={previewEstado === 'sonando' ? 'Detener' : 'Escuchar'}
            aria-label={previewEstado === 'sonando' ? 'Detener' : 'Escuchar'}
          >
            {previewEstado === 'cargando' ? '…' : previewEstado === 'sonando' ? '❚❚' : '▶'}
          </button>
          <Portada coverUrl={metaActual.coverUrl} nombreFallback={metaActual.album || trackActual.titulo} />
          <span className="clasificacion-asistida-track-texto">
            <span>
              {trackActual.artista} · {trackActual.titulo}
            </span>
            {metaActual.album && (
              <span className="clasificacion-asistida-track-album">{formatearTitulo(metaActual.album)}</span>
            )}
          </span>
        </p>
        {previewEstado === 'error' && (
          <p className="ayuda">No encontré este track en YouTube para escucharlo.</p>
        )}
        {previewEstado === 'sonando' && previewVideoId && (
          <iframe
            key={previewVideoId}
            className="clasificacion-asistida-preview-iframe"
            src={`https://www.youtube.com/embed/${previewVideoId}?autoplay=1`}
            allow="autoplay"
            title="Preview"
          />
        )}
        {cargando ? (
          <p className="ayuda">Buscando la mejor sugerencia…</p>
        ) : sugerencia?.ejeId ? (
          <p className="clasificacion-asistida-sugerencia">
            Creo que este va en <strong>{sugerencia.nombre ?? sugerencia.ejeId}</strong>
          </p>
        ) : (
          <p className="ayuda">No tengo una sugerencia clara todavía.</p>
        )}
        {/* Pedido explícito: no todo el mundo reconoce el género a oído — un
            link a una búsqueda ya armada da una pista sin salir de la app.
            Soundcharts no se puede pre-rellenar (su buscador es un POST con
            token, no una URL con parámetros) — por eso el texto de abajo le
            dice a la persona qué pegar ahí a mano. Google sí queda
            pre-armado del todo. */}
        <p className="clasificacion-asistida-buscar-genero">
          ¿No sabés el género?{' '}
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(
              `${trackActual.artista} ${trackActual.titulo} género musical`
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            Buscar en Google
          </a>{' '}
          o pegá "{trackActual.artista} {trackActual.titulo}" en{' '}
          <a href="https://soundcharts.com/es/genre-finder" target="_blank" rel="noreferrer">
            Soundcharts
          </a>
          .
        </p>
        {aviso && <p className="clasificacion-asistida-aviso">{aviso}</p>}
        <div className="clasificacion-asistida-acciones">
          {sugerencia?.ejeId && (
            <button className="revision-modo-boton" disabled={enviando} onClick={() => aplicar(sugerencia.ejeId)}>
              Aprobar
            </button>
          )}
          <select
            key={trackActual.id}
            disabled={enviando}
            defaultValue=""
            onChange={(e) => {
              const ejeId = e.target.value;
              if (ejeId) aplicar(ejeId);
            }}
          >
            <option value="" disabled>
              Elegir otro modo…
            </option>
            {ejesDisponibles.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <button className="revision-modo-descartar" disabled={enviando} onClick={saltar}>
            Saltar
          </button>
        </div>
        {/* Pedido explícito: si ninguno de los modos existentes encaja, antes
            había que salir a Administrar modos/listas, crearlo ahí, y volver
            acá a buscar de nuevo el mismo track. */}
        {creandoModo ? (
          <div className="clasificacion-asistida-crear-modo">
            <input
              autoFocus
              value={nombreModoNuevo}
              placeholder="Nombre del modo nuevo"
              disabled={enviando}
              onChange={(e) => setNombreModoNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') crearYAsignar();
                if (e.key === 'Escape') setCreandoModo(false);
              }}
            />
            <button
              className="revision-modo-boton"
              disabled={enviando || !nombreModoNuevo.trim()}
              onClick={crearYAsignar}
            >
              Crear y asignar
            </button>
            <button className="revision-modo-descartar" disabled={enviando} onClick={() => setCreandoModo(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button className="clasificacion-asistida-crear-modo-toggle" onClick={() => setCreandoModo(true)}>
            ¿No existe el modo que buscás? Crear uno nuevo
          </button>
        )}
        <div className="revision-modos-acciones">
          <button className="onboarding-atras" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export function BarraReproductor({
  track,
  ejesTrack,
  ejes,
  sonando,
  tiempo,
  duracion,
  buscar,
  reiniciar,
  alternarPausa,
  volumen,
  cambiarVolumen,
  alternarSilencio,
  anterior,
  siguiente,
  repetir,
  setRepetir,
  aleatorio,
  setAleatorio,
  posicion,
  metadata,
  favorito,
  onFavorito,
  onAbrirCola,
  cola,
  indice,
  setIndice,
  onQuitarDeCola,
  onMoverAPosicion,
  onGuardarOverride,
  onQuitarTrack,
  onAbrirAlbum,
  onAbrirArtista,
  onAgregarExterno,
  temporizador,
  fijarTemporizador,
  onRadio,
  onVerLetras,
}) {
  const pct = duracion > 0 ? (tiempo / duracion) * 100 : 0;
  const [guardandoFavorito, setGuardandoFavorito] = useState(false);

  async function clickFavorito() {
    setGuardandoFavorito(true);
    try {
      await onFavorito(track.id, !favorito);
    } catch {
      // Silencioso a propósito: es un botón de un solo símbolo sin lugar para
      // mostrar un error de texto. Si falla, el corazón simplemente no
      // cambia — el usuario lo nota y puede reintentar.
    } finally {
      setGuardandoFavorito(false);
    }
  }

  // Track "de mentira" (vista previa del buscador externo, o de un álbum que
  // todavía no está en la biblioteca) — mismo criterio que esSintetico en
  // Reproductor/enBiblioteca en FichaTrack. El corazón normal pegaría contra
  // un trackId que el servidor no conoce (404 en silencio), así que se
  // ofrece agregar a la biblioteca en su lugar, mismo patrón que la cola.
  const esSintetico = String(track.id).startsWith('preview-') || String(track.id).startsWith('album-');
  const [estadoAgregar, setEstadoAgregar] = useState({ id: null, estado: null });
  const estadoAgregarActual = estadoAgregar.id === track.id ? estadoAgregar.estado : null;

  async function agregarActualDesdePreview(conFavorito) {
    setEstadoAgregar({ id: track.id, estado: 'agregando' });
    try {
      const json = await onAgregarExterno({
        titulo: track.titulo,
        artista: track.artista,
        videoId: track.youtubeVideoId,
      });
      if (conFavorito && json.track?.id) {
        await onFavorito(json.track.id, true);
      }
      setEstadoAgregar({ id: track.id, estado: 'ok' });
    } catch {
      setEstadoAgregar({ id: track.id, estado: 'error' });
    }
  }

  // Portada/álbum llevan a la misma vista que "Álbum →" en la ficha — solo
  // cuando ya se sabe qué álbum es (si no, no hay a dónde ir).
  const abrirAlbumDeEsteTrack = metadata.album
    ? () => onAbrirAlbum(track.artista, track.titulo, metadata.album)
    : undefined;

  return (
    <div className="barra">
      <div className="barra-interior">
      <div className="barra-info">
        <FotoOIniciales
          foto={metadata.coverUrl}
          nombre={metadata.album || track.titulo}
          className="barra-portada"
          claseVacia="barra-portada barra-portada-vacia"
          onClick={abrirAlbumDeEsteTrack}
          style={abrirAlbumDeEsteTrack ? { cursor: 'pointer' } : undefined}
        />
        <div className="barra-info-texto">
          <button className="barra-titulo-cancion" onClick={onAbrirCola} title="Ver la cola completa">
            {formatearTitulo(track.titulo)}
          </button>
          <span className="barra-titulo-artista">
            <ArtistaTexto artista={track.artista} onAbrirArtista={onAbrirArtista} />
          </span>
          {metadata.album && (
            <button className="barra-titulo-album" onClick={abrirAlbumDeEsteTrack} title="Ver álbum">
              {formatearTitulo(metadata.album)}
            </button>
          )}
        </div>
      </div>

      <div className="barra-controles">
        {/* Los "íconos principales" (pedido explícito): me gusta + transporte
            + cola con su número. Van centrados, con la línea de tiempo
            centrada debajo cubriendo el mismo ancho — volumen y el menú
            "..." son secundarios y viven aparte, pegados al borde derecho
            (ver .barra-derecha). */}
        <div className="barra-controles-iconos">
          {esSintetico ? (
            estadoAgregarActual === 'ok' ? (
              <span className="c-preview-estado" title="Agregada a tu biblioteca">✓ Agregada</span>
            ) : estadoAgregarActual === 'error' ? (
              <span className="c-preview-estado c-preview-error" title="No se pudo agregar">Error</span>
            ) : (
              <>
                <button
                  onClick={() => agregarActualDesdePreview(true)}
                  disabled={estadoAgregarActual === 'agregando'}
                  title="Agregar a mi biblioteca y a me gusta"
                  aria-label="Agregar a mi biblioteca y a me gusta"
                >
                  ♡
                </button>
                <button
                  onClick={() => agregarActualDesdePreview(false)}
                  disabled={estadoAgregarActual === 'agregando'}
                  title="Agregar a mi biblioteca"
                  aria-label="Agregar a mi biblioteca"
                >
                  {estadoAgregarActual === 'agregando' ? '…' : '＋'}
                </button>
              </>
            )
          ) : (
            <button
              className={favorito ? 'activo' : ''}
              onClick={clickFavorito}
              disabled={guardandoFavorito}
              title={favorito ? 'Quitar de me gusta' : 'Agregar a me gusta'}
              aria-label={favorito ? 'Quitar de me gusta' : 'Agregar a me gusta'}
            >
              {favorito ? '♥' : '♡'}
            </button>
          )}

          <div className="barra-botones">
            <button
              className={aleatorio ? 'activo' : ''}
              onClick={() => setAleatorio()}
              title={aleatorio ? 'Desactivar aleatorio' : 'Activar aleatorio'}
              aria-label={aleatorio ? 'Desactivar aleatorio' : 'Activar aleatorio'}
            >
              <Icono nombre="aleatorio" />
            </button>
            <button onClick={anterior} title="Anterior" aria-label="Track anterior">
              ⏮
            </button>
            <button
              className="principal"
              onClick={alternarPausa}
              title="Reproducir / pausar"
              aria-label={sonando ? 'Pausar' : 'Reproducir'}
            >
              {sonando ? '❚❚' : '▶'}
            </button>
            <button onClick={siguiente} title="Siguiente" aria-label="Siguiente track">
              ⏭
            </button>
            <button
              className={repetir ? 'activo' : ''}
              onClick={() => setRepetir((r) => !r)}
              title="Repetir"
              aria-label={repetir ? 'Desactivar repetición' : 'Activar repetición'}
            >
              <Icono nombre="repetir" />
            </button>
            {/* Estaba dentro del menú "⋮", con los secundarios. Es una acción
                de transporte como ⏮/⏭ (seekTo(0) del track que suena, lo
                mismo que hace `repetir` al terminar), así que su lugar es
                acá, a la vista, junto al resto. */}
            <button className="barra-reiniciar" onClick={reiniciar} title="Volver a empezar" aria-label="Volver a empezar">
              ↺
            </button>
          </div>

          <div className="barra-cola-grupo">
            <span className="barra-pos">{posicion}</span>
            <IndicadorTemporizador temporizador={temporizador} onApagar={() => fijarTemporizador?.(null)} />
            <ColaFlotante
              cola={cola}
              indice={indice}
              setIndice={setIndice}
              onQuitar={onQuitarDeCola}
              onMoverAPosicion={onMoverAPosicion}
              onAbrirCola={onAbrirCola}
              onAbrirArtista={onAbrirArtista}
            />
          </div>
        </div>

        <div className="barra-progreso">
          <span className="t">{reloj(tiempo)}</span>
          <input
            type="range"
            min={0}
            max={duracion || 0}
            step={1}
            value={Math.min(tiempo, duracion || 0)}
            onChange={(e) => buscar(Number(e.target.value))}
            disabled={!duracion}
          />
          <span className="t">{reloj(duracion)}</span>
        </div>
      </div>

      <div className="barra-derecha">
        {/* Oculto en iOS: setVolume() ahi no hace nada, el volumen es solo por
            hardware (ver esIOS arriba). Mostrar un slider inerte confunde mas
            que no mostrar nada. */}
        {!esIOS && (
          <div className="barra-volumen">
            <button
              onClick={alternarSilencio}
              title={volumen === 0 ? 'Activar sonido' : 'Silenciar'}
              aria-label={volumen === 0 ? 'Activar sonido' : 'Silenciar'}
            >
              <Icono nombre={volumen === 0 ? 'silencio' : volumen < 50 ? 'volumen-bajo' : 'volumen-alto'} />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volumen}
              onChange={(e) => cambiarVolumen(Number(e.target.value))}
              aria-label="Volumen"
            />
          </div>
        )}

        {/* Todo lo que no entra en la fila principal (menos usado: reiniciar,
            ver en YouTube, ficha completa con "corregir datos") vive acá —
            pedido explícito de no saturar la barra con más de un puñado de
            botones a la vista. */}
        <BarraMas
          onRadio={onRadio}
          onVerLetras={onVerLetras}
          temporizador={temporizador}
          fijarTemporizador={fijarTemporizador}
          track={track}
          ejesTrack={ejesTrack}
          ejes={ejes}
          metadata={metadata}
          onGuardarOverride={onGuardarOverride}
          onAbrirAlbum={onAbrirAlbum}
          onAbrirArtista={onAbrirArtista}
          onQuitarTrack={onQuitarTrack}
        />
      </div>
      </div>
    </div>
  );
}

/**
 * Menú "⋮" de la barra: todo lo que no entra en la fila principal (ver en
 * YouTube, la ficha completa con "corregir datos"). Mismo patrón
 * details/summary + posicionar() que MenuListas/FichaTrack más abajo.
 */

// "🌙 23 min" / "🌙 fin" mientras hay temporizador para dormir; tocarlo lo apaga.
export function IndicadorTemporizador({ temporizador, onApagar }) {
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!temporizador?.finMs) return undefined;
    const id = setInterval(() => setTic((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [temporizador?.finMs]);
  if (!temporizador) return null;
  const texto = temporizador.finMs
    ? `${Math.max(1, Math.ceil((temporizador.finMs - Date.now()) / 60_000))}′`
    : 'fin';
  return (
    <button className="barra-temporizador" onClick={onApagar} title="Temporizador para dormir (tocar para apagar)">
      🌙 {texto}
    </button>
  );
}

export const OPCIONES_TEMPORIZADOR = [15, 30, 45, 60];

export function BarraMas({
  onRadio,
  onVerLetras,
  temporizador,
  fijarTemporizador,
  track,
  ejesTrack,
  ejes,
  metadata,
  onGuardarOverride,
  onAbrirAlbum,
  onAbrirArtista,
  onQuitarTrack,
}) {
  const detallesRef = useRef(null);
  const panelRef = useRef(null);
  const cerrar = () => detallesRef.current?.removeAttribute('open');

  function posicionar() {
    const boton = detallesRef.current?.querySelector('summary');
    const panel = panelRef.current;
    if (!boton || !panel) return;
    const r = boton.getBoundingClientRect();
    const espacioAbajo = window.innerHeight - r.bottom;
    if (espacioAbajo < 220 && r.top > espacioAbajo) {
      panel.style.top = 'auto';
      panel.style.bottom = `${window.innerHeight - r.top + 4}px`;
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = `${r.bottom + 4}px`;
    }
    panel.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  }

  return (
    <details className="barra-mas" ref={detallesRef} onToggle={(e) => e.target.open && posicionar()}>
      <summary title="Más opciones" aria-label="Más opciones">
        ⋮
      </summary>
      <div className="barra-mas-panel" ref={panelRef}>
        {/* "Volver a empezar" se mudó a la fila principal de la barra (ver
            .barra-botones). Acá quedan solo los secundarios de verdad. */}
        {onVerLetras && (
          <button onClick={() => (cerrar(), onVerLetras())}>
            <span aria-hidden="true">🎤</span> Ver letra
          </button>
        )}
        {onRadio && (
          <button onClick={() => (cerrar(), onRadio())}>
            <span aria-hidden="true">📻</span> Radio desde esta canción
          </button>
        )}
        {fijarTemporizador && (
          <div className="barra-temporizador-opciones" role="group" aria-label="Temporizador para dormir">
            <span>🌙 Dormir:</span>
            {OPCIONES_TEMPORIZADOR.map((m) => (
              <button key={m} onClick={() => (cerrar(), fijarTemporizador({ minutos: m }))}>
                {m}′
              </button>
            ))}
            <button onClick={() => (cerrar(), fijarTemporizador({ alFinal: true }))}>fin de canción</button>
            {temporizador && <button onClick={() => (cerrar(), fijarTemporizador(null))}>apagar</button>}
          </div>
        )}
        {track.youtubeVideoId && (
          <a
            href={`https://www.youtube.com/watch?v=${track.youtubeVideoId}`}
            target="_blank"
            rel="noreferrer"
          >
            <span aria-hidden="true">↗</span> Ver video en YouTube
          </a>
        )}
        <FichaTrack
          track={track}
          ejesTrack={ejesTrack}
          ejes={ejes}
          metadata={metadata}
          onGuardarOverride={onGuardarOverride}
          onAbrirAlbum={onAbrirAlbum}
          onAbrirArtista={onAbrirArtista}
          onQuitarTrack={onQuitarTrack}
        />
      </div>
    </details>
  );
}

/**
 * Desplegable flotante de la cola — pedido explícito: el botón ☰ de la barra
 * abría siempre la vista completa (navegaba, cortaba lo que se estuviera
 * mirando). Ahora abre esto en el lugar, mismo patrón details/summary +
 * position:fixed que BarraMas/FichaTrack. "Ver todo →" adentro sigue
 * llevando a la vista completa. Drag-to-reorder acá también, mismo
 * mecanismo (moverACola) que la vista completa.
 */
export function ColaFlotante({ cola, indice, setIndice, onQuitar, onMoverAPosicion, onAbrirCola, onAbrirArtista }) {
  const detallesRef = useRef(null);
  const panelRef = useRef(null);
  const [arrastrandoIdx, setArrastrandoIdx] = useState(null);
  const [sobreIdx, setSobreIdx] = useState(null);

  // Panel lateral pegado al borde derecho, no un globito colgando del botón.
  // Antes era una caja de 320x368 flotando en el medio de la pantalla: con
  // una cola de 98 tracks se veía diminuta y encima tapaba justo la lista que
  // se estaba mirando. Ahora ocupa todo el alto útil, que es el que queda
  // entre el encabezado fijo y la barra de reproducción.
  //
  // Los dos bordes se miden en vivo en vez de fijarse en CSS porque ninguno
  // de los dos es una constante: arriba, .fijo-arriba cambia de alto según
  // haya o no aviso de enriquecimiento; abajo, la barra crece cuando el ancho
  // de la ventana le apila los controles.
  function posicionar() {
    const panel = panelRef.current;
    if (!panel) return;
    const arriba = document.querySelector('.fijo-arriba')?.getBoundingClientRect().bottom ?? 0;
    const barra = detallesRef.current?.closest('.barra')?.getBoundingClientRect().top ?? window.innerHeight;
    const topeArriba = Math.max(8, arriba + 8);
    const topeAbajo = Math.max(topeArriba + 120, barra - 8);

    // `position: fixed` NO siempre se mide contra el viewport: cualquier
    // ancestro con transform, filter o backdrop-filter se vuelve su bloque
    // contenedor, y .barra usa backdrop-filter para el vidrio esmerilado. Con
    // las coordenadas de pantalla derechas, el panel se iba 85px por debajo
    // del borde inferior (medido).
    //
    // En vez de adivinar cuál ancestro manda y dónde empieza su caja, se
    // pregunta: se lo manda al origen (0,0) de lo que sea que lo contenga y se
    // mira dónde cayó en pantalla. Esa diferencia es el corrimiento a
    // descontar. Funciona igual si mañana ese backdrop-filter se va, o si
    // aparece en otro ancestro.
    panel.style.top = '0px';
    panel.style.bottom = 'auto';
    panel.style.right = '0px';
    const origen = panel.getBoundingClientRect();
    const corrimientoY = origen.top;
    const corrimientoDerecha = window.innerWidth - origen.right;

    panel.style.top = `${topeArriba - corrimientoY}px`;
    panel.style.height = `${topeAbajo - topeArriba}px`;
    panel.style.right = `${8 - corrimientoDerecha}px`;
  }

  return (
    <details className="barra-cola-flotante" ref={detallesRef} onToggle={(e) => e.target.open && posicionar()}>
      <summary className="barra-cola" title="Ver cola" aria-label="Ver cola">
        ☰
      </summary>
      <div className="barra-cola-panel" ref={panelRef}>
        <div className="barra-cola-panel-cabecera">
          <span>{cola.length} en cola</span>
          <button onClick={onAbrirCola}>Ver todo →</button>
        </div>
        <ol className="barra-cola-panel-lista">
          {cola.map((t, i) => (
            <li
              key={`${t.id}-${i}`}
              className={[
                i === indice && 'activo',
                arrastrandoIdx === i && 'cola-arrastrando',
                sobreIdx === i && arrastrandoIdx !== null && arrastrandoIdx !== i && 'cola-drop-sobre',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={(e) => {
                e.preventDefault();
                if (sobreIdx !== i) setSobreIdx(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const origen = Number(e.dataTransfer.getData('text/plain'));
                if (!Number.isNaN(origen)) onMoverAPosicion(origen, i);
                setArrastrandoIdx(null);
                setSobreIdx(null);
              }}
            >
              <span
                className="c-arrastrar"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(i));
                  setArrastrandoIdx(i);
                }}
                onDragEnd={() => {
                  setArrastrandoIdx(null);
                  setSobreIdx(null);
                }}
                title="Arrastrar para reordenar"
                aria-hidden="true"
              >
                ⠿
              </span>
              {/* div, no button — adentro van DOS botones (reproducir, ir al
                  artista) y un botón no puede anidar otro. Pedido explícito:
                  el artista siempre clickable, antes texto plano acá. */}
              <div className="barra-cola-panel-track">
                <button className="barra-cola-panel-titulo barra-cola-panel-titulo-btn" onClick={() => setIndice(i)}>
                  {formatearTitulo(t.titulo)}
                </button>
                <button className="barra-cola-panel-artista barra-cola-panel-artista-btn" onClick={() => onAbrirArtista(t.artista)}>
                  {formatearTitulo(t.artista)}
                </button>
              </div>
              <button
                className="barra-cola-panel-quitar"
                onClick={() => onQuitar(i)}
                title="Quitar de la cola"
                aria-label="Quitar de la cola"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

/**
 * El popover ⓘ con álbum/año/duración/modos + edición manual — antes vivía
 * fijo dentro de BarraReproductor (solo el track que está sonando). Ahora es
 * un componente aparte para poder abrirlo desde CUALQUIER fila de track en
 * cualquier lista (ver el botón ⓘ en ListaTracks y en la cola), no solo el
 * que está sonando en ese momento.
 *
 * Es de SOLO LECTURA a propósito — editar modos/listas vive en el menú "..."
 * (MenuListas), no acá: tener las dos cosas en dos lugares distintos
 * confundía qué popover hacía qué.
 */
export function FichaTrack({ track, ejesTrack, ejes, metadata, onGuardarOverride, onAbrirAlbum, onAbrirArtista, onQuitarTrack }) {
  // El id "de mentira" (preview-*/album-*) de una vista previa que todavía no
  // se agregó a la biblioteca no se puede borrar — mismo criterio que
  // esSintetico en Reproductor. Si el track viene de ahí, no se ofrece la
  // acción.
  const enBiblioteca = !String(track.id).startsWith('preview-') && !String(track.id).startsWith('album-');
  const [quitando, setQuitando] = useState(false);

  async function quitarDeLaBiblioteca() {
    setQuitando(true);
    try {
      await onQuitarTrack(track.id);
    } catch {
      // Silencioso a propósito, mismo criterio que el resto de las acciones
      // de esta ficha: si falla, se puede reintentar sin más ceremonia.
      setQuitando(false);
    }
  }

  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [errorEdicion, setErrorEdicion] = useState(null);
  const detallesRef = useRef(null);
  const panelRef = useRef(null);

  const nombresEjes = ejesTrack
    .map((a) => formatearTitulo(ejes.find((e) => e.id === a.ejeId)?.nombre))
    .filter(Boolean);

  // Mismo cálculo que MenuListas (ver el comentario largo ahí): esto vive en
  // filas dentro de listas largas, así que un bottom:42px fijo (pensado para
  // cuando esto SOLO vivía en la
  // barra de reproducción, abajo de todo) se recorta apenas la fila no
  // tiene 300px libres arriba — el bug real que se vio con un track cerca
  // del principio de una lista larga.
  function posicionar() {
    const boton = detallesRef.current?.querySelector('summary');
    const panel = panelRef.current;
    if (!boton || !panel) return;
    const r = boton.getBoundingClientRect();
    const espacioArriba = r.top;
    const espacioAbajo = window.innerHeight - r.bottom;
    if (espacioArriba < 340 && espacioAbajo > espacioArriba) {
      panel.style.bottom = 'auto';
      panel.style.top = `${r.bottom + 4}px`;
    } else {
      panel.style.top = 'auto';
      panel.style.bottom = `${window.innerHeight - r.top + 4}px`;
    }
    panel.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  }

  function abrirEdicion() {
    // Se precarga con lo que se ve HOY (ya sea el dato original o una
    // corrección previa): editar arrancando de un campo vacío obligaría a
    // retipear lo que ya estaba bien.
    setBorrador({
      titulo: track.titulo,
      artista: track.artista,
      album: metadata.album ?? '',
      anio: metadata.anio ?? '',
    });
    setErrorEdicion(null);
    setEditando(true);
  }

  // El formulario de edición es bastante más alto que la ficha de lectura —
  // sin recalcular acá, el panel se queda con el `top`/`bottom` medido para
  // el contenido corto de antes.
  useLayoutEffect(() => {
    if (detallesRef.current?.open) posicionar();
  }, [editando]);

  async function guardarEdicion(e) {
    e.preventDefault();
    setErrorEdicion(null);
    try {
      await onGuardarOverride(track.id, borrador);
      setEditando(false);
    } catch (err) {
      setErrorEdicion(traducirError(err));
    }
  }

  // `name` comparte el grupo entre TODOS los <details> de ficha en la
  // página: el navegador cierra solo cualquier otro que haya quedado abierto
  // (abrir uno nuevo nunca cerraba los previos, así que dos podían quedar
  // abiertos a la vez, superpuestos con position:fixed — de ahí el texto
  // amontonado y los clics que parecían no hacer nada, porque caían sobre el
  // panel viejo tapado encima).
  return (
    <details
      className="barra-detalles"
      name="ficha-track"
      ref={detallesRef}
      onToggle={(e) => e.target.open && posicionar()}
    >
      <summary title="Información" aria-label="Información del track">
        ⓘ
      </summary>
      <div className="ficha" ref={panelRef}>
        {editando ? (
          <form className="ficha-edicion" onSubmit={guardarEdicion}>
            <label>
              Canción
              <input
                type="text"
                value={borrador.titulo}
                onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })}
              />
            </label>
            <label>
              Artista
              <input
                type="text"
                value={borrador.artista}
                onChange={(e) => setBorrador({ ...borrador, artista: e.target.value })}
              />
            </label>
            <label>
              Álbum
              <input
                type="text"
                value={borrador.album}
                onChange={(e) => setBorrador({ ...borrador, album: e.target.value })}
              />
            </label>
            <label>
              Año
              <input
                type="number"
                min="1900"
                max="2100"
                value={borrador.anio}
                onChange={(e) => setBorrador({ ...borrador, anio: e.target.value })}
              />
            </label>
            {errorEdicion && <p className="aviso">{errorEdicion}</p>}
            <p className="nota">
              Se guarda aparte del import original: una reimportación no lo pisa. Vaciar un campo
              quita la corrección y vuelve al dato original.
            </p>
            <div className="ficha-edicion-botones">
              <button type="submit">Guardar</button>
              <button type="button" onClick={() => setEditando(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="ficha-encabezado">
              {metadata.coverUrl && <FotoOIniciales foto={metadata.coverUrl} nombre={metadata.album || track.titulo} />}
              <p>
                <strong>{formatearTitulo(track.titulo)}</strong>
                <br />
                <button className="ficha-artista-link" onClick={() => onAbrirArtista(track.artista)}>
                  {formatearTitulo(track.artista)}
                </button>
              </p>
            </div>
            <dl>
              <dt>Álbum</dt>
              <dd>
                {metadata.album ? (
                  <button
                    className="ficha-album-link"
                    onClick={() => onAbrirAlbum(track.artista, track.titulo, metadata.album)}
                  >
                    {formatearTitulo(metadata.album)} →
                  </button>
                ) : (
                  'sin resolver todavía'
                )}
              </dd>
              <dt>Año</dt>
              <dd>{metadata.anio ?? 'sin resolver todavía'}</dd>
              <dt>Duración</dt>
              <dd>{metadata.duracionMs ? reloj(metadata.duracionMs / 1000) : 'sin resolver todavía'}</dd>
              <dt>Modos</dt>
              <dd>{nombresEjes.join(', ') || '-'}</dd>
              {metadata.generos?.length > 0 && (
                <>
                  <dt>Géneros</dt>
                  <dd>{metadata.generos.slice(0, 5).join(', ')}</dd>
                </>
              )}
              {/* "Fuentes" (spotify/tunemymusic/amazon…) se saca a propósito de
                  la ficha: es un detalle de la importación, no del track, y
                  nombrar servicios de terceros en la UI de una app que se
                  distribuye es un riesgo innecesario. El campo sigue en los
                  datos (track.fuentes) — solo deja de mostrarse. */}
              <dt>Video</dt>
              <dd>
                {track.youtubeVideoId ? (
                  <a href={`https://www.youtube.com/watch?v=${track.youtubeVideoId}`} target="_blank" rel="noreferrer">
                    ver en YouTube
                  </a>
                ) : (
                  'sin resolver'
                )}
              </dd>
            </dl>
            <button className="ficha-editar" onClick={abrirEdicion}>
              ✎ Corregir datos
            </button>
            {enBiblioteca && (
              <button className="ficha-quitar" onClick={quitarDeLaBiblioteca} disabled={quitando}>
                － Quitar de mi biblioteca
              </button>
            )}
          </>
        )}
        {/*
          "sin resolver todavía" en vez de un texto fijo tipo "no
          disponible": el enriquecimiento de MusicBrainz sigue corriendo
          de fondo, así que este dato puede aparecer más tarde sin que el
          usuario haga nada — no es una limitación permanente.
        */}
      </div>
    </details>
  );
}

/**
 * Tracklist COMPLETO de un álbum, vía Deezer — no solo los tracks que el
 * usuario ya tiene guardados (ver GET /api/album). Se puede escuchar el
 * álbum entero (los tracks nuevos se resuelven a YouTube solos, igual que
 * la vista previa del buscador externo) y agregarlo completo a un modo o
 * lista de una — "me gusta todo el álbum" no debería ser canción por canción.
 */
export function VistaAlbum({
  album,
  ejes,
  tracks,
  favoritos,
  onVolver,
  onReproducir,
  onAgregarAlbum,
  onAlternarColeccion,
  onAlternarFavoritoAlbum,
  onAgregarTrackSuelto,
  onQuitarTrack,
  onAbrirArtista,
  onAbrirAlbum,
  trackActualId,
}) {
  const [agregando, setAgregando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  // Agregar UN track suelto del álbum es una acción aparte de "agregar el
  // álbum completo" — estado por track, no el `agregando` de arriba.
  const [estadosTrack, setEstadosTrack] = useState({});

  async function manejarAgregar() {
    setAgregando(true);
    setError(null);
    setResultado(null);
    try {
      // Sin elegir modo/lista a mano: el álbum se clasifica solo con la misma
      // lógica automática que cualquier track nuevo (anclas + YouTube), igual
      // que ya pasaba antes con el desplegable vacío — el desplegable era
      // trabajo extra sin beneficio real.
      const json = await onAgregarAlbum();
      setResultado(json);
    } catch (e) {
      setError(traducirError(e));
    } finally {
      setAgregando(false);
    }
  }

  async function agregarUno(t, favorito) {
    setEstadosTrack((s) => ({ ...s, [t.trackId]: 'agregando' }));
    try {
      await onAgregarTrackSuelto(
        { artista: t.artista, titulo: t.titulo, duracionMs: t.duracionMs },
        { favorito, albumTitulo: album.titulo, anio: album.anio }
      );
      setEstadosTrack((s) => ({ ...s, [t.trackId]: 'ok' }));
    } catch {
      setEstadosTrack((s) => ({ ...s, [t.trackId]: 'error' }));
    }
  }

  // `t.yaEnBiblioteca` es una foto fija de cuando se abrió el álbum — sin
  // este estado aparte, sacar un track dejaría la fila mostrando "en tu
  // biblioteca" para siempre, con un corazón/quitar que ya no aplican a nada.
  async function quitarUno(t) {
    try {
      await onQuitarTrack(t.trackId);
      setEstadosTrack((s) => ({ ...s, [t.trackId]: 'quitado' }));
    } catch {
      // Silencioso a propósito, mismo criterio que el corazón de la barra:
      // si falla, el botón simplemente no cambia y se puede reintentar.
    }
  }

  if (!album || album.cargando) {
    return (
      <main className="album">
        <button className="volver" onClick={onVolver}>
          ← Volver
        </button>
        <p className="ayuda buscando">Buscando el álbum…</p>
      </main>
    );
  }

  if (!album.encontrado) {
    return (
      <main className="album">
        <button className="volver" onClick={onVolver}>
          ← Volver
        </button>
        <p className="aviso">
          {album.error ? `No se pudo buscar el álbum: ${album.error}` : 'No encontramos este álbum.'}
        </p>
      </main>
    );
  }

  const duracionTotal = duracionLarga(album.tracks.reduce((suma, t) => suma + (t.duracionMs || 0), 0));
  // Se chequea contra `tracks` (biblioteca real, en vivo) en vez de
  // `t.yaEnBiblioteca` (foto fija de cuando se buscó el álbum): agregar el
  // álbum entero de una actualiza `tracks` pero no pasaba por `agregarUno`,
  // así que la lista se quedaba mostrando "nuevo" hasta salir y volver a
  // entrar al álbum.
  const idsEnBiblioteca = new Set(tracks.map((t) => t.id));
  const nuevos = album.tracks.filter((t) => !idsEnBiblioteca.has(t.trackId)).length;
  const claveAlbum = `${album.artista.trim().toLowerCase()}||${album.titulo.trim().toLowerCase()}`;
  const esFavorito = favoritos.albumes.includes(claveAlbum);

  return (
    <main className="album modos-layout">
    <div className="modos-principal">
      <button className="volver" onClick={onVolver}>
        ← Volver
      </button>
      <div className="album-encabezado">
        <FotoOIniciales foto={album.coverUrl} nombre={album.titulo} claseVacia="album-cover-vacia" loading="eager" />
        <div>
          <p className="eyebrow">Álbum</p>
          <h2>{formatearTitulo(album.titulo)}</h2>
          <button
            className="album-artista album-artista-link"
            onClick={() => onAbrirArtista(album.artista)}
            title={`Ver artista: ${formatearTitulo(album.artista)}`}
          >
            {formatearTitulo(album.artista)} →
          </button>
          <p className="ayuda">
            {album.anio && `${album.anio} · `}
            {album.tracks.length} canciones{duracionTotal && ` · ${duracionTotal}`}
            {nuevos > 0 && ` · ${nuevos} que todavía no tenés`}
          </p>
          <div className="album-botones">
            <button className="album-reproducir" onClick={() => onReproducir(0)}>
              ▶ Reproducir álbum
            </button>
            <button className="album-agregar" onClick={manejarAgregar} disabled={agregando}>
              {agregando ? 'Agregando…' : 'Agregar álbum a mi biblioteca'}
            </button>
            <button
              className={esFavorito ? 'album-favorito activo' : 'album-favorito'}
              onClick={() => onAlternarFavoritoAlbum(album.artista, album.titulo, !esFavorito)}
              title={esFavorito ? 'Quitar de me gusta' : 'Agregar a me gusta'}
              aria-label={esFavorito ? 'Quitar álbum de me gusta' : 'Agregar álbum a me gusta'}
            >
              {esFavorito ? '♥' : '♡'}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="aviso">{error}</p>}
      {resultado && (
        <p className="ayuda">
          ✓ {resultado.agregados} canciones nuevas agregadas
          {resultado.noEncontrados > 0 && ` (${resultado.noEncontrados} no se encontraron en YouTube)`}.
        </p>
      )}

      <ol className="album-tracklist">
        {album.tracks.map((t, i) => {
          const estado = estadosTrack[t.trackId];
          const yaEsta = estado === 'quitado' ? false : estado === 'ok' ? true : idsEnBiblioteca.has(t.trackId);
          // El track sonando puede ser el real (ya en biblioteca) o el "de
          // mentira" armado por onReproducir para uno que todavía no está
          // (mismo prefijo `album-` que usa reproducirAlbum/reproducirLista).
          const sonando = trackActualId === t.trackId || trackActualId === `album-${t.trackId}`;
          return (
            <li key={i} className={sonando ? 'actual' : ''}>
              <button
                className="album-track-numero"
                onClick={() => onReproducir(i)}
                title="Reproducir"
                aria-label="Reproducir"
              >
                <span className="num">{t.numero}</span>
                <span className="play">{sonando ? '♪' : '▶'}</span>
              </button>
              <span className="album-track-titulo">
                <span onClick={() => onReproducir(i)}>{formatearTitulo(t.titulo)}</span>
                {t.artista !== album.artista && (
                  <>
                    {' · '}
                    {/* Pedido explícito: el nombre de artista siempre clickable —
                        acá es el crédito de UN track dentro de un álbum
                        compilado (distinto del artista del álbum), antes texto
                        plano sin forma de llegar a su ficha. */}
                    <button
                      className="c-anio-inline album-track-artista-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAbrirArtista(t.artista);
                      }}
                    >
                      {formatearTitulo(t.artista)}
                    </button>
                  </>
                )}
              </span>
              <span className="album-track-duracion">{t.duracionMs ? reloj(t.duracionMs / 1000) : '-'}</span>
              <span className={`album-track-estado ${yaEsta ? 'en-biblioteca' : ''}`}>
                {estado === 'error' ? 'error' : yaEsta ? '✓ en tu biblioteca' : 'nuevo'}
              </span>
              <div className="album-track-acciones">
                {yaEsta ? (
                  <>
                    <BotonMeGusta
                      track={{ id: t.trackId, ejes: t.ejes }}
                      tracks={tracks}
                      onAlternar={onAlternarColeccion}
                    />
                    <button
                      onClick={() => quitarUno(t)}
                      title="Quitar de mi biblioteca"
                      aria-label="Quitar de mi biblioteca"
                    >
                      －
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="c-favorito"
                      onClick={() => agregarUno(t, true)}
                      disabled={estado === 'agregando'}
                      title="Agregar a mi biblioteca y a me gusta"
                      aria-label="Agregar a mi biblioteca y a me gusta"
                    >
                      ♡
                    </button>
                    <button
                      onClick={() => agregarUno(t, false)}
                      disabled={estado === 'agregando'}
                      title="Agregar a mi biblioteca"
                      aria-label="Agregar a mi biblioteca"
                    >
                      {estado === 'agregando' ? '…' : '＋'}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>

    {album.otrosAlbumes?.length > 0 && (
      <aside className="modos-lateral">
        <h2>Más álbumes de {formatearTitulo(album.artista)}</h2>
        <ul className="lateral-lista">
          {album.otrosAlbumes.map((a) => (
            <li key={a.titulo}>
              <button
                className="lateral-item"
                onClick={() => onAbrirAlbum(album.artista, a.titulo, a.titulo)}
              >
                <FotoOIniciales
                  foto={a.coverUrl}
                  nombre={a.titulo}
                  className="lateral-item-cover"
                  claseVacia="lateral-item-cover lateral-item-cover-vacia"
                />
                <span className="lateral-item-texto">
                  <span className="lateral-item-nombre">{formatearTitulo(a.titulo)}</span>
                  <span className="lateral-item-total">
                    {[a.anio, a.nbTracks && `${a.nbTracks} canciones`].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    )}
    </main>
  );
}

/**
 * Perfil de artista (Deezer): sus álbumes (cada uno navega a VistaAlbum,
 * pasando el título ya conocido como albumConocido para que la búsqueda no
 * confunda un single con el álbum real) y sus canciones más populares —
 * mismo patrón de filas que VistaAlbum (reproducir / me gusta / agregar).
 */
export function VistaArtista({
  artista,
  ejes,
  tracks,
  artistasBiblioteca,
  artistasSolos,
  metadataDe,
  favoritos,
  onVolver,
  onAbrirAlbum,
  onAbrirArtista,
  onReproducir,
  onReproducirDeBiblioteca,
  onAlternarColeccion,
  onAlternarFavoritoArtista,
  onAgregarTrackSuelto,
  onQuitarTrack,
  trackActualId,
}) {
  const [estadosTrack, setEstadosTrack] = useState({});
  // "Canciones populares" de acá abajo es el catálogo de Deezer, no tu
  // biblioteca — para un artista que Deezer no reconoce de verdad (ej. el
  // nombre de un canal de música de fondo genérica, no un acto musical
  // catalogado), esa lista puede no tener NINGUNA relación con lo que
  // realmente tenés. Sin esto no había forma de ver ni gestionar en bloque
  // tus propias canciones de un artista así — pedido explícito.
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [quitando, setQuitando] = useState(false);
  const [pestanaCanciones, setPestanaCanciones] = useState('populares');
  const misCanciones = useMemo(() => {
    if (!artista?.nombre) return [];
    const clave = artista.nombre.trim().toLowerCase();
    return tracks
      .filter((t) => separarArtistas(t.artista, artistasSolos).some((n) => n.toLowerCase() === clave))
      // "Populares" ya viene ordenado por Deezer (más a menos popular); acá
      // no hay ninguna señal de popularidad propia, así que alfabético es lo
      // único que da un orden predecible — pedido explícito.
      .sort((a, b) => formatearTitulo(a.titulo).localeCompare(formatearTitulo(b.titulo)));
  }, [tracks, artistasSolos, artista?.nombre]);

  // El comentario original de vite.config.js decía "ya ordenado por fecha
  // por la API" — medido en vivo, no es cierto de forma consistente (ej.
  // Christoffer Moe Ditlevsen: 2025, 2021, 2024, 2022, 2022... salteado).
  // Pedido explícito: más reciente primero. Sin año (null) al final, no
  // se descarta.
  const albumesOrdenados = useMemo(() => {
    return [...(artista?.albumes ?? [])].sort((a, b) => (b.anio ?? -1) - (a.anio ?? -1));
  }, [artista?.albumes]);

  function alternarSeleccion(id) {
    setSeleccionadas((s) => {
      const copia = new Set(s);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function alternarTodas() {
    setSeleccionadas((s) => (s.size === misCanciones.length ? new Set() : new Set(misCanciones.map((t) => t.id))));
  }

  // Secuencial a propósito, no Promise.all: /api/quitar-track lee y reescribe
  // biblioteca.json completo en cada llamada — varias en paralelo pueden
  // pisarse (la última en terminar gana, deshaciendo las demás). Mismo motivo
  // por el que el resto de la app nunca dispara dos escrituras a la vez.
  async function quitarSeleccionadas() {
    if (seleccionadas.size === 0) return;
    if (
      !window.confirm(
        `¿Eliminar ${seleccionadas.size} canciones de ${formatearTitulo(artista.nombre)} de tu biblioteca? ` +
          'Se borran del todo (podés volver a importarlas después si te arrepentís).'
      )
    ) {
      return;
    }
    setQuitando(true);
    try {
      for (const id of seleccionadas) {
        await onQuitarTrack(id);
      }
      setSeleccionadas(new Set());
    } finally {
      setQuitando(false);
    }
  }

  // Artistas nuevos (que todavía no tenés) primero, los que ya están en tu
  // biblioteca después — "sobre todo artistas nuevos... dejaría también los
  // que estén en la biblioteca dentro de las opciones" (pedido explícito).
  // Dentro de cada grupo, por popularidad (nb_fan de Deezer).
  const idsBiblioteca = useMemo(
    () => new Set((artistasBiblioteca ?? []).map((a) => a.nombre.toLowerCase())),
    [artistasBiblioteca]
  );
  const similaresOrdenados = useMemo(() => {
    const lista = artista?.similares ?? [];
    const nuevos = lista.filter((a) => !idsBiblioteca.has(a.nombre.toLowerCase()));
    const enBiblioteca = lista.filter((a) => idsBiblioteca.has(a.nombre.toLowerCase()));
    const porFans = (a, b) => b.nbFans - a.nbFans;
    // Sin scroll: 8 entra cómodo en el alto disponible del lateral (medido
    // en vivo a 720px de viewport — 10 ya pedía scroll).
    return [...nuevos.sort(porFans), ...enBiblioteca.sort(porFans)].slice(0, 8);
  }, [artista, idsBiblioteca]);

  async function agregarUno(c, favorito) {
    setEstadosTrack((s) => ({ ...s, [c.trackId]: 'agregando' }));
    try {
      await onAgregarTrackSuelto(
        { artista: c.artista, titulo: c.titulo, duracionMs: c.duracionMs },
        { favorito, albumTitulo: c.albumTitulo }
      );
      setEstadosTrack((s) => ({ ...s, [c.trackId]: 'ok' }));
    } catch {
      setEstadosTrack((s) => ({ ...s, [c.trackId]: 'error' }));
    }
  }

  async function quitarUno(c) {
    try {
      await onQuitarTrack(c.trackId);
      setEstadosTrack((s) => ({ ...s, [c.trackId]: 'quitado' }));
    } catch {
      // Silencioso a propósito, mismo criterio que el corazón de la barra.
    }
  }

  if (!artista || artista.cargando) {
    return (
      <main className="album">
        <button className="volver" onClick={onVolver}>
          ← Volver
        </button>
        <p className="ayuda buscando">Buscando el artista…</p>
      </main>
    );
  }

  // Antes, no encontrado en Deezer devolvía acá mismo un error genérico y
  // nada más — ni siquiera decía QUÉ artista no encontró, y de paso tapaba
  // por completo la pestaña "En tu biblioteca" de más abajo, que no depende
  // de Deezer para nada. Para un nombre casero/de nicho (canales de música
  // de fondo, no actos catalogados: "Lowfie", "Chilled Pig") esto dejaba sin
  // forma de ver ni gestionar tus propias canciones de ese artista — pedido
  // explícito. Ahora sigue de largo al render normal; lo que sí depende de
  // Deezer (álbumes, populares, parecidos, foto) se oculta más abajo.
  const encontrado = artista.encontrado;
  const esFavoritoArtista = favoritos.artistas.includes(artista.nombre.trim().toLowerCase());

  return (
    <main className="album modos-layout">
    <div className="modos-principal">
      <button className="volver" onClick={onVolver}>
        ← Volver
      </button>
      <div className="album-encabezado">
        {/* Deezer no tiene foto para bastantes artistas de la biblioteca (Kerry
            Muzzey, por ejemplo, viene con foto null). Antes no se renderizaba
            nada y la ficha quedaba coja: el título arrancaba pegado al borde,
            sin nada a su izquierda. Ahora cae al mismo fallback que ya usan las
            portadas sin carátula — iniciales sobre un color derivado del
            nombre — con el tamaño y la sombra de la foto real, así el bloque
            ocupa idéntico lugar tenga foto o no. */}
        <FotoOIniciales
          foto={encontrado ? artista.fotoUrl : null}
          nombre={artista.nombre}
          className="artista-foto"
          claseVacia="artista-foto artista-foto-vacia"
          loading="eager"
        />
        <div>
          <p className="eyebrow">Artista</p>
          <h2>{formatearTitulo(artista.nombre)}</h2>
          <p className="ayuda">
            {encontrado
              ? `${artista.albumes.length} álbumes · ${artista.canciones.length} canciones populares`
              : `No encontramos "${formatearTitulo(artista.nombre)}" en Deezer. Mostrando solo tu biblioteca.`}
          </p>
          <div className="album-botones">
            {encontrado ? (
              <button className="album-reproducir" onClick={() => onReproducir(0)}>
                ▶ Reproducir populares
              </button>
            ) : (
              misCanciones.length > 0 && (
                <button
                  className="album-reproducir"
                  onClick={() => onReproducirDeBiblioteca(misCanciones[0], misCanciones, formatearTitulo(artista.nombre))}
                >
                  ▶ Reproducir tu biblioteca
                </button>
              )
            )}
            <button
              className={esFavoritoArtista ? 'album-favorito activo' : 'album-favorito'}
              onClick={() => onAlternarFavoritoArtista(artista.nombre, !esFavoritoArtista)}
              title={esFavoritoArtista ? 'Quitar de me gusta' : 'Agregar a me gusta'}
              aria-label={esFavoritoArtista ? 'Quitar artista de me gusta' : 'Agregar artista a me gusta'}
            >
              {esFavoritoArtista ? '♥' : '♡'}
            </button>
          </div>
        </div>
      </div>

      {encontrado && artista.albumes.length > 0 && (
        <>
          <p className="menu-listas-titulo artista-seccion-titulo">Álbumes</p>
          {/* "-carousel" acá y solo acá — pedido explícito para esta pantalla
              puntual (artistas con muchos álbumes, ej. Blondie con 39, se
              hacían difíciles de navegar en grilla). Las otras 3 apariciones
              de .artista-albumes (Explorar) siguen siendo grilla, sin tocar. */}
          <div className="artista-albumes artista-albumes-carousel">
            {albumesOrdenados.map((a) => (
              <button
                key={a.titulo}
                className="artista-album-tile"
                onClick={() => onAbrirAlbum(artista.nombre, a.titulo, a.titulo)}
              >
                <FotoOIniciales foto={a.coverUrl} nombre={a.titulo} claseVacia="artista-album-tile-vacia" />
                <span className="artista-album-tile-titulo">{formatearTitulo(a.titulo)}</span>
                {a.anio && <span className="artista-album-tile-anio">{a.anio}</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Dos pestañas en vez de una lista sola: "Populares" es el catálogo de
          Deezer (puede no tener ninguna relación real con lo tuyo si Deezer
          no reconoce al artista de verdad — ver comentario más arriba), "En
          tu biblioteca" son tus propias canciones, para poder ubicarlas y
          gestionarlas en bloque sin depender de que Deezer las conozca. Sin
          `encontrado`, Deezer no devolvió `canciones` (queda `undefined`):
          antes esto igual intentaba leer `artista.canciones.length` acá
          mismo y tiraba abajo toda la pantalla en negro sin nada que lo
          frene (confirmado en vivo con "Lowfie"/"Chilled Pig" — nombres que
          Deezer no reconoce, así que SIEMPRE llegan sin canciones). Sin
          Deezer no hay nada que mostrar en "Populares", así que directo se
          muestra "En tu biblioteca". */}
      {encontrado && (
        <div className="tabs">
          <button
            className={pestanaCanciones === 'populares' ? 'activo' : ''}
            onClick={() => setPestanaCanciones('populares')}
          >
            Populares ({artista.canciones.length})
          </button>
          <button
            className={pestanaCanciones === 'biblioteca' ? 'activo' : ''}
            onClick={() => setPestanaCanciones('biblioteca')}
          >
            En tu biblioteca ({misCanciones.length})
          </button>
        </div>
      )}

      {(!encontrado || pestanaCanciones === 'biblioteca') && (
        <>
          {misCanciones.length > 0 && (
            <div className="artista-biblioteca-acciones">
              <label className="artista-biblioteca-todas">
                <input
                  type="checkbox"
                  checked={seleccionadas.size === misCanciones.length}
                  onChange={alternarTodas}
                />
                Seleccionar todas
              </label>
              <button
                className="album-track-numero-quitar-lote"
                disabled={seleccionadas.size === 0 || quitando}
                onClick={quitarSeleccionadas}
              >
                {quitando ? 'Eliminando…' : `Eliminar de mi biblioteca (${seleccionadas.size})`}
              </button>
            </div>
          )}
          <ol className="album-tracklist">
            {misCanciones.length === 0 && (
              <li className="ayuda">No tenés canciones de {formatearTitulo(artista.nombre)} en tu biblioteca.</li>
            )}
            {misCanciones.map((t) => {
              const sonando = trackActualId === t.id;
              const meta = metadataDe(t.id);
              return (
                <li key={t.id} className={sonando ? 'actual' : ''}>
                  {/* Mismo círculo (.album-track-numero/.play) que Álbum y
                      Populares — pedido explícito de que el play viva
                      siempre en el mismo lugar en todas las listas. El
                      checkbox de selección en lote se corre a .album-track-acciones,
                      es una acción secundaria frente a reproducir. */}
                  <button
                    className="album-track-numero"
                    onClick={() => onReproducirDeBiblioteca(t, misCanciones, formatearTitulo(artista.nombre))}
                    title="Reproducir"
                    aria-label="Reproducir"
                  >
                    <span className="play">{sonando ? '♪' : '▶'}</span>
                  </button>
                  <span
                    className="album-track-titulo"
                    onClick={() => onReproducirDeBiblioteca(t, misCanciones, formatearTitulo(artista.nombre))}
                  >
                    {formatearTitulo(t.titulo)}
                  </span>
                  <span className="album-track-duracion">
                    {meta.duracionMs ? reloj(meta.duracionMs / 1000) : '-'}
                  </span>
                  <span className="ayuda">{meta.album ? formatearTitulo(meta.album) : '-'}</span>
                  <div className="album-track-acciones">
                    <label className="album-track-checkbox" title="Seleccionar">
                      <input
                        type="checkbox"
                        checked={seleccionadas.has(t.id)}
                        onChange={() => alternarSeleccion(t.id)}
                      />
                    </label>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {encontrado && pestanaCanciones === 'populares' && (
      <ol className="album-tracklist">
        {artista.canciones.map((c, i) => {
          const estado = estadosTrack[c.trackId];
          const yaEsta = (c.yaEnBiblioteca && estado !== 'quitado') || estado === 'ok';
          const sonando = trackActualId === c.trackId || trackActualId === `album-${c.trackId}`;
          return (
            <li key={i} className={sonando ? 'actual' : ''}>
              <button
                className="album-track-numero"
                onClick={() => onReproducir(i)}
                title="Reproducir"
                aria-label="Reproducir"
              >
                <span className="num">{i + 1}</span>
                <span className="play">{sonando ? '♪' : '▶'}</span>
              </button>
              <span className="album-track-titulo" onClick={() => onReproducir(i)}>
                {formatearTitulo(c.titulo)}
              </span>
              <span className="album-track-duracion">{c.duracionMs ? reloj(c.duracionMs / 1000) : '-'}</span>
              <span className={`album-track-estado ${yaEsta ? 'en-biblioteca' : ''}`}>
                {estado === 'error' ? 'error' : yaEsta ? '✓ en tu biblioteca' : 'nuevo'}
              </span>
              <div className="album-track-acciones">
                {yaEsta ? (
                  <>
                    <BotonMeGusta
                      track={{ id: c.trackId, ejes: c.ejes }}
                      tracks={tracks}
                      onAlternar={onAlternarColeccion}
                    />
                    <button
                      onClick={() => quitarUno(c)}
                      title="Quitar de mi biblioteca"
                      aria-label="Quitar de mi biblioteca"
                    >
                      －
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="c-favorito"
                      onClick={() => agregarUno(c, true)}
                      disabled={estado === 'agregando'}
                      title="Agregar a mi biblioteca y a me gusta"
                      aria-label="Agregar a mi biblioteca y a me gusta"
                    >
                      ♡
                    </button>
                    <button
                      onClick={() => agregarUno(c, false)}
                      disabled={estado === 'agregando'}
                      title="Agregar a mi biblioteca"
                      aria-label="Agregar a mi biblioteca"
                    >
                      {estado === 'agregando' ? '…' : '＋'}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      )}
    </div>

    {similaresOrdenados.length > 0 && (
      <aside className="modos-lateral">
        <h2>Parecidos a {formatearTitulo(artista.nombre)}</h2>
        <ul className="lateral-lista">
          {similaresOrdenados.map((a) => {
            const enBiblioteca = idsBiblioteca.has(a.nombre.toLowerCase());
            return (
              <li key={a.nombre}>
                <button className="lateral-item" onClick={() => onAbrirArtista(a.nombre)}>
                  <FotoOIniciales
                    foto={a.fotoUrl}
                    nombre={a.nombre}
                    className="lateral-item-cover lateral-item-cover-redonda"
                    claseVacia="lateral-item-avatar"
                  />
                  <span className="lateral-item-texto">
                    <span className="lateral-item-nombre">{formatearTitulo(a.nombre)}</span>
                    <span className="lateral-item-total">{enBiblioteca ? 'ya en tu biblioteca' : 'nuevo para vos'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    )}
    </main>
  );
}

/**
 * Fila compacta — pedido explícito de simplificar "Seguí escuchando"/"Mis
 * listas" (y por extensión el resto de tarjetas de modo del Home, mismo
 * componente): antes cada una mostraba un collage de hasta 4 carátulas, que
 * "genera una sensación visual recargada". Ahora es una sola miniatura +
 * nombre + conteo, con el play SIEMPRE visible (no solo al hover) para poder
 * arrancar sin entrar primero. Las carátulas grandes quedan para Explorar,
 * Álbumes y contenido destacado — no para navegación de todos los días.
 */
export function TarjetaModo({
  eje,
  total,
  subEjes,
  conteos,
  onEntrar,
  onReproducir,
  onOcultar,
  duracionMs,
  covers,
  artistas,
}) {
  const duracion = duracionLarga(duracionMs);
  const cover = covers && covers.length > 0 ? covers[0] : null;
  const [coverFallo, setCoverFallo] = useState(false);
  const mostrarCover = cover && !coverFallo;
  const detallesRef = useRef(null);
  const panelRef = useRef(null);

  // Mismo patrón que MenuListas (ver el comentario largo ahí). Acá hacía
  // falta por otro motivo: .fila-tarjetas usa `overflow: hidden` para
  // esconder las tarjetas de la fila 2+ que no entran, y ese recorte también
  // se come cualquier panel `position: absolute` que cuelgue de una tarjeta.
  // Medido en pantalla: de los 45px del panel, 29 quedaban afuera — se veía
  // como que el "⋮" no hacía nada, o que abría algo cortado encima de lo de
  // abajo. `position: fixed` no lo clipea ningún ancestro con overflow.
  function posicionar() {
    const boton = detallesRef.current?.querySelector('summary');
    const panel = panelRef.current;
    if (!boton || !panel) return;
    const r = boton.getBoundingClientRect();
    const alto = panel.offsetHeight;
    const espacioAbajo = window.innerHeight - r.bottom;
    // Si no entra hacia abajo, abre hacia arriba en vez de quedar cortado.
    if (espacioAbajo < alto + 12 && r.top > espacioAbajo) {
      panel.style.top = 'auto';
      panel.style.bottom = `${window.innerHeight - r.top + 4}px`;
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = `${r.bottom + 4}px`;
    }
    panel.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  }

  return (
    <div className="tarjeta-fila-contenedor">
    <div className="tarjeta-fila">
      <button className="tarjeta-fila-principal" onClick={() => onEntrar(eje)}>
        <span
          className="tarjeta-fila-miniatura"
          style={mostrarCover ? undefined : { background: colorDeEje(eje) }}
          aria-hidden="true"
        >
          {mostrarCover && (
            <img src={cover} alt="" loading="lazy" onError={() => setCoverFallo(true)} />
          )}
        </span>
        <span className="tarjeta-fila-texto">
          <span className="tarjeta-fila-nombre">{formatearTitulo(eje.nombre)}</span>
          {/* Solo la vista completa de "Listas" pasa `artistas` — pedido
              explícito puntual de esa pantalla, no para el resto de tarjetas
              del Home (ver comentario de arriba: ahí ya se sacó a propósito
              todo lo que sea más que miniatura+nombre+conteo). Una sola
              línea, se corta con "…" si no entra — sin más vueltas. */}
          {artistas && artistas.length > 0 && (
            <span className="tarjeta-fila-artistas">{artistas.map(formatearTitulo).join(', ')}</span>
          )}
          <span className="tarjeta-fila-total">
            {total} canciones{duracion && ` · ${duracion}`}
          </span>
        </span>
      </button>
      {onReproducir && total > 0 && (
        <button
          className="tarjeta-fila-play"
          onClick={(e) => {
            e.stopPropagation();
            onReproducir(eje);
          }}
          title="Reproducir"
          aria-label={`Reproducir ${formatearTitulo(eje.nombre)}`}
        >
          ▶
        </button>
      )}
      {onOcultar && !eje.sistema && (
        <details
          className="tarjeta-fila-mas"
          ref={detallesRef}
          onToggle={(e) => e.target.open && posicionar()}
        >
          <summary title="Más opciones" aria-label="Más opciones">
            ⋮
          </summary>
          <div className="tarjeta-fila-mas-panel" ref={panelRef}>
            <button onClick={() => onOcultar(eje.id)}>Ocultar del Inicio</button>
          </div>
        </details>
      )}
    </div>
      {subEjes.length > 0 && (
        <div className="subejes">
          {subEjes.map((s) => (
            <button key={s.id} onClick={() => onEntrar(s)}>
              {formatearTitulo(s.nombre)} <span>{conteos.get(s.id) ?? 0}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Agregar a lista" por track, inspirado directo en el menú contextual de
 * Spotify (clic derecho en un track → Añadir a lista). Un track puede estar
 * en varias playlists a la vez, por eso son checkboxes, no radio buttons.
 *
 * Usa `tracks` (estado vivo de App) para el estado de pertenencia, no el
 * objeto `track` recibido por prop — el mismo motivo que ya obligó a
 * resolver `ejesDelTrackActual` en vivo para el corazón de "me gusta": si
 * este track está en la cola Y se lo agrega a una lista desde el buscador
 * en otra pestaña de la UI, la copia que vive en `cola`/`resultados` queda
 * vieja y el checkbox mentiría.
 */
/**
 * Miniatura de portada para una fila de canción (cola, búsqueda, historial)
 * — antes esas filas eran la única zona de la app sin ninguna imagen.
 * Mismo fallback que .barra-portada-vacia: color + iniciales del ÁLBUM (no
 * del artista), para que dos álbumes distintos del mismo artista igual se
 * distingan de un vistazo.
 */
export function Portada({ coverUrl, nombreFallback }) {
  return (
    <span className="c-portada" aria-hidden="true">
      <FotoOIniciales foto={coverUrl} nombre={nombreFallback} claseVacia="c-portada-vacia" />
    </span>
  );
}

/**
 * Corazón de "me gusta" por fila, mismo patrón que MenuListas: resuelve la
 * pertenencia contra `tracks` (estado vivo), no contra el `track` de la
 * fila, que puede haber quedado desactualizado si el track cambió de
 * estado en otra parte de la UI mientras esta lista seguía montada.
 */
export function BotonMeGusta({ track, tracks, onAlternar }) {
  const trackVivo = tracks.find((t) => t.id === track.id) ?? track;
  const favorito = trackVivo.ejes.some((e) => e.ejeId === 'favoritos');
  return (
    <button
      className={favorito ? 'c-favorito activo' : 'c-favorito'}
      onClick={() => onAlternar(track.id, 'favoritos', !favorito)}
      title={favorito ? 'Quitar de me gusta' : 'Agregar a me gusta'}
      aria-label={favorito ? 'Quitar de me gusta' : 'Agregar a me gusta'}
    >
      {favorito ? '♥' : '♡'}
    </button>
  );
}

export function MenuListas({ track, ejes, tracks, onAlternar, onAsignarModo, onQuitarModo }) {
  const listas = ejes.filter((e) => (e.tipo === 'playlist' || e.id === 'favoritos') && e.activo);
  const modos = ejes.filter((e) => (e.tipo === 'gusto' || e.tipo === 'funcional') && e.activo && !e.sistema);
  const trackVivo = tracks.find((t) => t.id === track.id) ?? track;
  const perteneceA = new Set(trackVivo.ejes.map((e) => e.ejeId));

  async function alternarModo(ejeId, marcado) {
    if (marcado) await onAsignarModo(track.id, ejeId);
    else await onQuitarModo(track.id, ejeId);
  }
  const detallesRef = useRef(null);
  const panelRef = useRef(null);

  // Se calcula acá (no en CSS puro) porque este menú vive dentro de listas
  // largas que scrollean con la página: position:absolute ahí se recorta
  // contra el borde de la ventana o se solapa con la fila propia cuando no
  // hay espacio debajo. position:fixed
  // no lo clipea ningún ancestro con overflow — solo hace falta decirle
  // dónde va.
  function posicionar() {
    const boton = detallesRef.current?.querySelector('summary');
    const panel = panelRef.current;
    if (!boton || !panel) return;
    const r = boton.getBoundingClientRect();
    const espacioAbajo = window.innerHeight - r.bottom;
    // Si no entra hacia abajo (menú pegado al final de la pantalla o de una
    // lista corta), abre hacia arriba en vez de quedar cortado.
    if (espacioAbajo < 220 && r.top > espacioAbajo) {
      panel.style.top = 'auto';
      panel.style.bottom = `${window.innerHeight - r.top + 4}px`;
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = `${r.bottom + 4}px`;
    }
    panel.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  }

  return (
    <details className="menu-listas" ref={detallesRef} onToggle={(e) => e.target.open && posicionar()}>
      <summary title="Agregar a lista" aria-label="Agregar a lista">
        ⋯
      </summary>
      <div className="menu-listas-panel" ref={panelRef}>
        <p className="menu-listas-titulo">Modos</p>
        {modos.map((m) => (
          <label key={m.id}>
            <input
              type="checkbox"
              checked={perteneceA.has(m.id)}
              onChange={(e) => alternarModo(m.id, e.target.checked)}
            />
            {formatearTitulo(m.nombre)}
          </label>
        ))}
        <p className="menu-listas-titulo menu-listas-titulo-listas">Listas</p>
        {listas.length === 0 && <p className="ayuda">Todavía no tenés listas.</p>}
        {listas.map((l) => (
          <label key={l.id}>
            <input
              type="checkbox"
              checked={perteneceA.has(l.id)}
              onChange={(e) => onAlternar(track.id, l.id, e.target.checked)}
            />
            {formatearTitulo(l.nombre)}
          </label>
        ))}
      </div>
    </details>
  );
}

/**
 * Desplegable propio para "Agrupar por artista/álbum/orden actual" — mismo
 * patrón details/summary que el resto de menús de la app (ColaFlotante,
 * BarraMas), position:absolute sin JS de posicionamiento porque vive en
 * `.cola-controles`, que no tiene scroll propio (mismo criterio que
 * .tarjeta-fila-mas-panel). Reemplaza a un <select> nativo puntualmente
 * porque el listado de opciones de un <select> lo pinta el navegador/SO
 * (el azul nativo de Windows/Chrome en una captura real), fuera del
 * alcance de la paleta de colores de la app.
 */
export function SelectorAgrupar({ valor, onCambiar }) {
  const opciones = [
    { valor: null, etiqueta: 'Orden actual' },
    { valor: 'artista', etiqueta: 'Agrupar por artista' },
    { valor: 'album', etiqueta: 'Agrupar por álbum' },
  ];
  const actual = opciones.find((o) => o.valor === valor) ?? opciones[0];

  return (
    <details className={valor ? 'selector-agrupar activo' : 'selector-agrupar'}>
      <summary>{actual.etiqueta}</summary>
      <div className="selector-agrupar-panel">
        {opciones.map((o) => (
          <button
            key={o.valor ?? 'actual'}
            className={o.valor === valor ? 'activo' : ''}
            onClick={(e) => {
              onCambiar(o.valor);
              e.currentTarget.closest('details').open = false;
            }}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </details>
  );
}

export function Reproductor({
  ejeVista,
  ejeActivo,
  tracksVista,
  artistasSolos,
  cola,
  indice,
  setIndice,
  estadoResolucion,
  avisoSalto,
  metadataDe,
  aleatorio,
  setAleatorio,
  onQuitar,
  onMoverAPosicion,
  onAgregar,
  onReproducirDesdeVista,
  ejes,
  tracks,
  onAlternarColeccion,
  onVolver,
  onAgregarExterno,
  onGuardarOverride,
  onAsignarModo,
  onQuitarModo,
  onAbrirAlbum,
  onAbrirArtista,
  onQuitarTrack,
}) {
  const [ordenPor, setOrdenPor] = useState(null); // null | 'titulo' | 'artista' | 'album' | 'anio'
  const [ordenAsc, setOrdenAsc] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [agruparPor, setAgruparPor] = useState(null); // null | 'artista' | 'album'
  const [arrastrandoIdx, setArrastrandoIdx] = useState(null);
  const [sobreIdx, setSobreIdx] = useState(null);
  const filaActualRef = useRef(null);
  // "Vista previa" (BuscadorExterno.escuchar) arma una cola con tracks que
  // TODAVÍA no están en la biblioteca — necesitan su propio botón "agregar"
  // acá mismo, sin volver al buscador, para poder decidir mientras se
  // escucha. trackId -> 'agregando' | 'ok' | 'error'.
  const [estadosPreview, setEstadosPreview] = useState({});

  async function agregarDesdePreview(track, favorito = false) {
    setEstadosPreview((s) => ({ ...s, [track.id]: 'agregando' }));
    try {
      const json = await onAgregarExterno({
        titulo: track.titulo,
        artista: track.artista,
        videoId: track.youtubeVideoId,
      });
      // El id "de mentira" (preview-*/album-*) no sirve para marcar favorito —
      // el servidor devuelve el track real ya creado, con su id de biblioteca.
      if (favorito && json.track?.id) {
        await onAlternarColeccion(json.track.id, 'favoritos', true);
      }
      setEstadosPreview((s) => ({ ...s, [track.id]: 'ok' }));
    } catch {
      setEstadosPreview((s) => ({ ...s, [track.id]: 'error' }));
    }
  }

  // Estás viendo la cola que REALMENTE suena cuando: no hay un modo real de
  // por medio (búsqueda/artista/historial, donde la cola ES la vista), o el
  // modo que mirás es el mismo que está sonando. En ese caso se edita/navega
  // `cola` en vivo, igual que siempre. Si no, esto es solo un modo que estás
  // mirando sin haber arrancado a reproducirlo — no hay nada que reordenar
  // todavía, solo tracks para elegir.
  const esActiva = !ejeVista?.id || ejeVista.id === ejeActivo?.id;
  const listaBase = esActiva ? cola : tracksVista;
  // La columna de acciones angosta (110px) alcanza para 2-3 íconos. Se queda
  // corta en dos casos, no solo uno: la cola activa (suma subir/bajar/quitar,
  // ya arreglado) y mirar una lista de tipo "playlist" (suma el botón "－"
  // de sacar de esa lista puntual) — a este segundo caso no le había tocado
  // el ancho extra todavía, y los íconos se aplastaban igual que antes.
  const colaAncha = esActiva || ejeVista?.tipo === 'playlist';

  // Antes esto era cola.slice(indice, indice + 40): solo se podía "ver" hacia
  // adelante escuchando de verdad, track por track — no había forma de
  // navegar una cola de cientos de temas. Ahora se arma la lista completa
  // una sola vez, con el índice REAL en `listaBase` pegado a cada fila (idx),
  // que es lo que usan el click-to-jump y los botones de editar.
  const filas = useMemo(
    () => listaBase.map((t, idx) => ({ track: t, idx, meta: metadataDe(t.id) })),
    [listaBase, metadataDe]
  );
  const duracionListaLarga = duracionLarga(filas.reduce((acc, f) => acc + (f.meta.duracionMs ?? 0), 0));

  const filtroNorm = filtro.trim().toLowerCase();
  const filasFiltradas = filtroNorm
    ? filas.filter(
        (f) =>
          f.track.titulo.toLowerCase().includes(filtroNorm) ||
          f.track.artista.toLowerCase().includes(filtroNorm) ||
          (f.meta.album ?? '').toLowerCase().includes(filtroNorm)
      )
    : filas;

  function valorDe(f, campo) {
    if (campo === 'titulo') return f.track.titulo || null;
    if (campo === 'artista') return f.track.artista || null;
    if (campo === 'album') return f.meta.album || null;
    if (campo === 'anio') return f.meta.duracionMs || null;
    return null;
  }

  // Vacíos siempre al final, sea cual sea la dirección — invertir el orden
  // no debería hacer que "—" salte a estar primero.
  function comparar(a, b) {
    const va = valorDe(a, ordenPor);
    const vb = valorDe(b, ordenPor);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp =
      typeof va === 'number' ? va - vb : String(va).toLowerCase().localeCompare(String(vb).toLowerCase());
    return ordenAsc ? cmp : -cmp;
  }

  const filasOrdenadas = ordenPor ? [...filasFiltradas].sort(comparar) : filasFiltradas;

  // Ordenar/filtrar la VISTA no reordena `cola`: son cosas distintas. `cola`
  // sigue siendo el orden real de reproducción (lo que decide "siguiente");
  // esto es solo para encontrar un track más rápido. Por eso mover ▲▼ se
  // desactiva acá — "subir" en una lista ordenada por año no tiene un
  // significado claro sobre el orden real de reproducción.
  const vistaModificada = ordenPor !== null || filtroNorm !== '';

  function alternarOrden(campo) {
    if (ordenPor === campo) {
      setOrdenAsc((a) => !a);
    } else {
      setOrdenPor(campo);
      setOrdenAsc(true);
    }
  }

  function flecha(campo) {
    if (ordenPor !== campo) return '';
    return ordenAsc ? ' ▲' : ' ▼';
  }

  useEffect(() => {
    filaActualRef.current?.scrollIntoView({ block: 'nearest' });
  }, [indice]);

  // Clickear UN track puntual es "quiero escuchar justo este", no "mezclá
  // todo" — pero reproducirModo() sin forzarAleatorio caía en la preferencia
  // global (`aleatorio`, que arranca en true por defecto), así que el track
  // clickeado terminaba mezclado en cualquier posición de la lista entera
  // (reportado: click en el primer track de Favoritas con 359 canciones
  // sonó en la posición 189). Fuerza secuencial siempre acá, y sincroniza el
  // toggle para que el ícono de la barra no quede mostrando "aleatorio"
  // mientras en realidad suena en orden — mismo criterio que los botones
  // Play/Aleatorio de arriba.
  function clickFila(f) {
    if (esActiva) setIndice(f.idx);
    else {
      setAleatorio(false);
      onReproducirDesdeVista(ejeVista, listaBase, f.track, false);
    }
  }

  function fila(f) {
    const esActual = esActiva && f.idx === indice;
    // Tracks "de mentira" (vista previa del buscador externo, o de un álbum
    // que todavía no está en la biblioteca) no existen en `tracks` — pedirles
    // MenuListas/FichaTrack o el corazón de me gusta pegaría contra un
    // trackId que el servidor no conoce (404). Se les ofrece agregar a la
    // biblioteca en su lugar, mismo botón para ambos casos.
    const esSintetico = f.track.id.startsWith('preview-') || f.track.id.startsWith('album-');
    const puedeReordenar = esActiva && !vistaModificada;
    return (
      <li
        key={f.track.id}
        ref={esActual ? filaActualRef : null}
        className={[
          esActual && 'actual',
          puedeReordenar && arrastrandoIdx === f.idx && 'cola-arrastrando',
          puedeReordenar && sobreIdx === f.idx && arrastrandoIdx !== null && arrastrandoIdx !== f.idx && 'cola-drop-sobre',
        ]
          .filter(Boolean)
          .join(' ')}
        onDragOver={
          puedeReordenar
            ? (e) => {
                e.preventDefault();
                if (sobreIdx !== f.idx) setSobreIdx(f.idx);
              }
            : undefined
        }
        onDrop={
          puedeReordenar
            ? (e) => {
                e.preventDefault();
                // Lee el origen del propio evento nativo (dataTransfer), no
                // del estado de React: dragstart->drop puede llegar a
                // dispararse antes de que el estado se haya re-renderizado
                // (batching), y ese closure de onDrop quedaría con el valor
                // viejo (null) en vez del índice recién seteado.
                const origen = Number(e.dataTransfer.getData('text/plain'));
                if (!Number.isNaN(origen)) onMoverAPosicion(origen, f.idx);
                setArrastrandoIdx(null);
                setSobreIdx(null);
              }
            : undefined
        }
      >
        <Portada coverUrl={f.meta.coverUrl} nombreFallback={f.meta.album || f.track.titulo} />
        <button className="c-play" onClick={() => clickFila(f)} title="Reproducir" aria-label="Reproducir">
          {esActual ? '♪' : '▶'}
        </button>
        <span className="c-titulo" onClick={() => clickFila(f)}>
          <span className="c-titulo-texto">{formatearTitulo(f.track.titulo)}</span>
          <span className="c-artista">
            <ArtistaTexto artista={f.track.artista} onAbrirArtista={onAbrirArtista} />
            {f.meta.anio && <span className="c-anio-inline"> · {f.meta.anio}</span>}
          </span>
        </span>
        <span
          className={f.meta.album ? 'c-album' : 'c-album c-album-vacio'}
          onClick={
            f.meta.album ? () => onAbrirAlbum(f.track.artista, f.track.titulo, f.meta.album) : () => clickFila(f)
          }
          title={f.meta.album ? `Ver álbum: ${formatearTitulo(f.meta.album)}` : undefined}
        >
          {f.meta.album ? formatearTitulo(f.meta.album) : '-'}
        </span>
        {/* El año ya se muestra junto al artista (pedido explícito, "como en las
            demás plataformas") — acá va la duración, más útil que dejar la
            columna vacía. El header "Año" sigue ordenando esta vista igual,
            solo cambió qué texto se ve en la fila. */}
        <span className="c-anio" onClick={() => clickFila(f)}>
          {f.meta.duracionMs ? reloj(f.meta.duracionMs / 1000) : '-'}
        </span>
        <div className="c-acciones">
          {/* Reemplaza a las flechas ▲▼ que estaban acá — el drag ya cubre
              subir/bajar, no hacía falta duplicar la acción con dos
              botones aparte. Handle explícito (no la fila entera) porque
              la fila ya tiene varios clicks propios adentro. */}
          {puedeReordenar && (
            <span
              className="c-arrastrar"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(f.idx));
                setArrastrandoIdx(f.idx);
              }}
              onDragEnd={() => {
                setArrastrandoIdx(null);
                setSobreIdx(null);
              }}
              title="Arrastrar para reordenar"
              aria-label="Arrastrar para reordenar"
            >
              ⠿
            </span>
          )}
          {!esSintetico && <BotonMeGusta track={f.track} tracks={tracks} onAlternar={onAlternarColeccion} />}
          {/* Mirando una lista puntual (no un modo, que se reclasifica desde
              "..."): sacar un track de ACÁ tiene que ser un solo click, no
              abrir el menú y buscar el checkbox correcto entre modos y
              listas — mismo criterio que el "－" de álbum/artista. */}
          {!esSintetico && ejeVista?.tipo === 'playlist' && (
            <button
              onClick={() => onAlternarColeccion(f.track.id, ejeVista.id, false)}
              title={`Quitar de "${formatearTitulo(ejeVista.nombre)}"`}
              aria-label={`Quitar de ${formatearTitulo(ejeVista.nombre)}`}
            >
              －
            </button>
          )}
          {esActiva ? (
            <button onClick={() => onQuitar(f.idx)} title="Quitar de la cola" aria-label="Quitar de la cola">
              ✕
            </button>
          ) : (
            <button
              onClick={() => onAgregar(f.track)}
              title="Agregar a lo que está sonando"
              aria-label="Agregar a lo que está sonando"
            >
              ＋
            </button>
          )}
          {esSintetico ? (
            <>
              {estadosPreview[f.track.id] === 'ok' && <span className="c-preview-estado">✓ Agregada</span>}
              {estadosPreview[f.track.id] === 'error' && <span className="c-preview-estado c-preview-error">Error</span>}
              {(!estadosPreview[f.track.id] || estadosPreview[f.track.id] === 'agregando') && (
                <>
                  <button
                    className="c-favorito"
                    onClick={() => agregarDesdePreview(f.track, true)}
                    disabled={estadosPreview[f.track.id] === 'agregando'}
                    title="Agregar a mi biblioteca y a me gusta"
                    aria-label="Agregar a mi biblioteca y a me gusta"
                  >
                    ♡
                  </button>
                  <button
                    onClick={() => agregarDesdePreview(f.track)}
                    disabled={estadosPreview[f.track.id] === 'agregando'}
                    title="Agregar a mi biblioteca"
                    aria-label="Agregar a mi biblioteca"
                  >
                    {estadosPreview[f.track.id] === 'agregando' ? '…' : '＋'}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <MenuListas
                track={f.track}
                ejes={ejes}
                tracks={tracks}
                onAlternar={onAlternarColeccion}
                onAsignarModo={onAsignarModo}
                onQuitarModo={onQuitarModo}
              />
              <FichaTrack
                track={f.track}
                ejesTrack={f.track.ejes}
                ejes={ejes}
                metadata={f.meta}
                onGuardarOverride={onGuardarOverride}
                onAbrirAlbum={onAbrirAlbum}
                onAbrirArtista={onAbrirArtista}
                onQuitarTrack={onQuitarTrack}
              />
            </>
          )}
        </div>
      </li>
    );
  }

  // Agrupar reordena SIEMPRE (agrupar sin reordenar no tendría sentido
  // visual), pero conserva el filtro que ya se haya aplicado. Los dos modos
  // son excluyentes — no hay "agrupar por artista Y álbum" a la vez, mismo
  // criterio que el resto de la UI (una sola forma de mirar la lista por vez).
  // Por artista SEPARADO (ver separarArtistas): una colaboración cae en la
  // carpeta de CADA artista que la integra, no en una carpeta propia — así
  // "Zedd · Troye Sivan" aparece junto al resto de Zedd, no aparte.
  let grupos = null;
  if (agruparPor === 'artista') {
    const porArtista = new Map(); // clave en minúscula -> { nombre, filas }
    for (const f of filasFiltradas) {
      for (const nombre of separarArtistas(f.track.artista, artistasSolos)) {
        const clave = nombre.toLowerCase();
        if (!porArtista.has(clave)) porArtista.set(clave, { nombre, filas: [] });
        porArtista.get(clave).filas.push(f);
      }
    }
    grupos = [...porArtista.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((g) => [g.nombre, g.filas]);
  } else if (agruparPor === 'album') {
    // Sin separarArtistas acá: el álbum ya es la unidad de agrupación, no
    // hace falta partir colaboraciones — "Zedd · Troye Sivan" en un álbum
    // de Zedd va en la carpeta de ESE álbum, no en dos carpetas distintas.
    const porAlbum = new Map();
    for (const f of filasFiltradas) {
      const nombre = f.meta.album ? formatearTitulo(f.meta.album) : 'Sin álbum';
      if (!porAlbum.has(nombre)) porAlbum.set(nombre, []);
      porAlbum.get(nombre).push(f);
    }
    grupos = [...porAlbum.entries()].sort(([a], [b]) => {
      if (a === 'Sin álbum') return 1;
      if (b === 'Sin álbum') return -1;
      return a.localeCompare(b, 'es');
    });
  }

  return (
    <main className="reproductor">
      <button className="volver" onClick={onVolver}>
        ← Inicio
      </button>
      <p className="eyebrow">{esActiva ? 'Ahora suena' : 'Explorando'}</p>
      <h2>{formatearTitulo(esActiva ? ejeActivo?.nombre : ejeVista?.nombre)}</h2>
      {/* El nombre de la cola ("Troye Sivan", "Favoritas") no dice qué track
          puntual está sonando — la barra de abajo lo muestra chico, pero acá
          arriba, donde se ve de lejos, faltaba. Este bloque se reserva
          SIEMPRE (con visibility, no con montaje condicional) para que
          activar el play no corra el resto del contenido hacia abajo. */}
      <p
        className="reproductor-track-actual"
        style={esActiva && cola[indice] ? undefined : { visibility: 'hidden' }}
      >
        {esActiva && cola[indice] ? (
          <>
            {formatearTitulo(cola[indice].titulo)} ·{' '}
            <button className="reproductor-track-actual-artista" onClick={() => onAbrirArtista(cola[indice].artista)}>
              {formatearTitulo(cola[indice].artista)}
            </button>
          </>
        ) : (
          ' '
        )}
      </p>
      {/* Cantidad + duración de ESTA lista puntual — antes solo se veía en
          las tarjetas del Home, no acá adentro viéndola de verdad. Suma la
          lista completa (`filas`, sin el filtro de texto), no lo filtrado —
          el total de la lista no cambia porque estés buscando algo dentro. */}
      {listaBase.length > 0 && (
        <p className="reproductor-conteo">
          {listaBase.length} canciones{duracionListaLarga && ` · ${duracionListaLarga}`}
        </p>
      )}

      {esActiva && avisoSalto && <p className="aviso">{avisoSalto}</p>}

      {esActiva && estadoResolucion && estadoResolucion !== 'buscando' && (
        <p className="aviso">
          {/* El mensaje depende del modo: en escritorio la clave se pone en
              .env.local, pero en el build local (celular/navegador) ese
              archivo no existe en el dispositivo del usuario — se carga desde
              Configuración. Mandarlo a editar un .env en el teléfono es una
              instrucción imposible de seguir. */}
          {estadoResolucion === 'sin_api_key' &&
            (MODO_LOCAL ? (
              'Falta configurar tu clave de YouTube en Configuración.'
            ) : (
              <>
                Falta <code>YOUTUBE_API_KEY</code> en <code>.env.local</code>
              </>
            ))}
          {estadoResolucion === 'no_encontrado' && 'YouTube no encontró este track.'}
          {estadoResolucion === 'no_reproducible' &&
            'Ninguna versión de este track se puede reproducir acá (el dueño lo tiene restringido).'}
          {estadoResolucion === 'youtube_error' && 'Error al buscar en YouTube. El detalle quedó en la consola.'}
          {estadoResolucion === 'cuota_agotada' &&
            'Se agotó la cuota diaria de YouTube. Las canciones ya resueltas siguen sonando; las nuevas, mañana.'}
          {estadoResolucion === 'error_red' && 'Sin conexión para buscar en YouTube.'}
          {estadoResolucion === 'error' && 'No se pudo conectar con el servidor para resolver este track.'}
        </p>
      )}
      {esActiva && estadoResolucion === 'buscando' && <p className="aviso buscando">Buscando en YouTube…</p>}

      <div className="cola-cabecera">
        <p className="cola-titulo">{esActiva ? 'Cola' : 'Canciones'}</p>
      </div>

      <div className="cola-controles">
        <input
          className="cola-filtro"
          type="text"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar esta cola…"
        />
        {/* Antes eran dos botones sueltos (Agrupar por artista / por álbum) —
            pedido explícito de fusionarlos: son mutuamente excluyentes (nunca
            los dos a la vez), así que un solo selector ocupa menos espacio y
            deja igual de claro cuál está activo. Desplegable propio en vez de
            <select> nativo: el listado de opciones de un <select> lo pinta el
            navegador/SO (el azul de Windows/Chrome), no hay forma de
            llevarlo a la paleta de la app con CSS — mismo patrón
            details/summary que ya se usa en el resto de menús. */}
        <SelectorAgrupar valor={agruparPor} onCambiar={setAgruparPor} />
        {/* Antes esto era UN botón que alternaba modo Y reproducía a la vez —
            confuso: la etiqueta mostraba el modo ACTUAL, pero clickear hacía
            lo contrario. Pedido explícito de separarlo: Play siempre
            reproduce en orden, Aleatorio siempre mezcla — cada uno hace
            exactamente lo que dice, sin alternar nada. Los dos dejan
            `aleatorio` (la preferencia persistida, la que lee el toggle de
            la barra de abajo) en el estado que corresponde, para que ese
            ícono no quede mostrando el modo viejo después de tocar uno de
            estos. */}
        <button
          className="toggle-orden accion-reproducir"
          onClick={() => {
            setAleatorio(false);
            onReproducirDesdeVista(ejeVista ?? ejeActivo, listaBase, null, false);
          }}
          disabled={listaBase.length === 0}
          title="Reproducir en orden"
        >
          ▶ Play
        </button>
        <button
          className="toggle-orden"
          onClick={() => {
            setAleatorio(true);
            onReproducirDesdeVista(ejeVista ?? ejeActivo, listaBase, null, true);
          }}
          disabled={listaBase.length === 0}
          title="Reproducir mezclado"
        >
          <Icono nombre="aleatorio" tamano={14} /> Aleatorio
        </button>
        {vistaModificada && (
          <span className="cola-conteo-filtrado">
            {filasFiltradas.length} de {listaBase.length}
          </span>
        )}
      </div>

      {/*
        Álbum/año vienen del enriquecimiento de MusicBrainz: hoy cubre una
        parte de la biblioteca, no toda. "—" es honesto ahí — no es un
        error, es "todavía no resuelto para este track puntual". Cada
        columna es clickeable para ordenar la VISTA (no reordena `cola`,
        ver el comentario en vistaModificada más arriba).
      */}
      <div className={colaAncha ? 'cola-header cola-header-ancha' : 'cola-header'}>
        <span />
        <span />
        <span className="cola-header-titulo">
          <span className="ordenable" onClick={() => alternarOrden('titulo')}>
            Canción{flecha('titulo')}
          </span>
          <span className="ordenable ordenable-sub" onClick={() => alternarOrden('artista')}>
            Artista{flecha('artista')}
          </span>
        </span>
        <span className="ordenable" onClick={() => alternarOrden('album')}>
          Álbum{flecha('album')}
        </span>
        <span
          className="ordenable"
          onClick={() => alternarOrden('anio')}
          title="Tiempo"
          aria-label="Ordenar por tiempo"
        >
          <Icono nombre="cronometro" tamano={13} />
          {flecha('anio')}
        </span>
        <span />
      </div>

      {/*
        Antes de sacar el límite de 40 tracks visibles, esta lista nunca
        pasaba de una pantalla. Ahora puede tener cientos de filas (covers
        piano/lo-fi tiene más de 700) — el nombre de la clase queda como
        referencia histórica, pero ya no tiene scroll propio: crece con su
        contenido y quien scrollea es `body`, como el resto de la página
        (ver docs/superpowers/specs/2026-09-15-shell-scroll-unico-design.md).
      */}
      <div className="cola-scroll">
        {agruparPor ? (
          <div className="cola-grupos">
            {grupos.map(([nombre, fs]) => (
              <div key={nombre} className="grupo-artista">
                <p className="grupo-artista-titulo">
                  {nombre} <span>{fs.length}</span>
                </p>
                <ol className={colaAncha ? 'cola cola-ancha' : 'cola'}>{fs.map(fila)}</ol>
              </div>
            ))}
            {grupos.length === 0 && <p className="ayuda">Sin resultados para "{filtro}".</p>}
          </div>
        ) : (
          <ol className={colaAncha ? 'cola cola-ancha' : 'cola'}>{filasOrdenadas.map(fila)}</ol>
        )}
      </div>

      {vistaModificada && filasOrdenadas.length === 0 && !agruparPor && (
        <p className="ayuda">Sin resultados para "{filtro}".</p>
      )}

      {/* El total ya se muestra arriba en .reproductor-conteo — acá solo vale
          la pena la posición dentro de la cola cuando está sonando. */}
      {esActiva && <p className="pie">{indice + 1} de {listaBase.length}</p>}
    </main>
  );
}

/**
 * El nombre de artista en una fila de track era texto plano — para ir a esa
 * página había que abrir el track primero. Separa por los mismos separadores
 * "fuertes" que separarArtistas() (·, coma, " vs ") y hace cada nombre
 * clickeable por separado, así "Calvin Harris · Sam Smith" lleva a cada uno
 * de los dos en vez de intentar buscar un artista que no existe con ese
 * nombre combinado. stopPropagation porque vive adentro de .c-titulo, que
 * ya tiene su propio onClick para reproducir la fila.
 */
export function ArtistaTexto({ artista, onAbrirArtista }) {
  const partes = artista
    .split(/\s*·\s*|\s*,\s*|\s+vs\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return partes.map((p, i) => (
    <span key={i}>
      {i > 0 && ' · '}
      <button
        type="button"
        className="c-artista-link"
        onClick={(e) => {
          e.stopPropagation();
          onAbrirArtista(p);
        }}
      >
        {formatearTitulo(p)}
      </button>
    </span>
  ));
}

/**
 * Busca DENTRO de la biblioteca, no en un catálogo externo.
 * Buscar algo que no tenés todavía es otra funcionalidad, más grande —
 * requiere clasificar el track nuevo y resolverlo contra YouTube — y queda
 * pendiente aparte.
 */
/** Lista de tracks reutilizada por texto/artista en Buscador (misma cabecera y filas). */
export function ListaTracks({
  tracks: filas,
  ejes,
  tracksTodos,
  metadataDe,
  onReproducir,
  onAgregar,
  onAlternarColeccion,
  etiqueta,
  onGuardarOverride,
  onAsignarModo,
  onQuitarModo,
  onAbrirAlbum,
  onAbrirArtista,
  onQuitarTrack,
  trackActualId,
}) {
  return (
    <>
      <div className="cola-header">
        <span />
        <span />
        <span>Canción</span>
        <span>Álbum</span>
        <span title="Tiempo" aria-label="Tiempo">
          <Icono nombre="cronometro" tamano={13} />
        </span>
        <span />
      </div>
      <div className="cola-scroll">
        <ol className="cola">
          {filas.map((t) => {
            const meta = metadataDe(t.id);
            const sonando = t.id === trackActualId;
            return (
              <li key={t.id} className={sonando ? 'actual' : ''}>
                <Portada coverUrl={meta.coverUrl} nombreFallback={meta.album || t.titulo} />
                <button
                  className="c-play"
                  onClick={() => onReproducir(t, filas, etiqueta)}
                  title="Reproducir"
                  aria-label="Reproducir"
                >
                  {sonando ? '♪' : '▶'}
                </button>
                <span className="c-titulo" onClick={() => onReproducir(t, filas, etiqueta)}>
                  <span className="c-titulo-texto">{formatearTitulo(t.titulo)}</span>
                  <span className="c-artista">
                    <ArtistaTexto artista={t.artista} onAbrirArtista={onAbrirArtista} />
                    {meta.anio && <span className="c-anio-inline"> · {meta.anio}</span>}
                  </span>
                </span>
                <span
                  className={meta.album ? 'c-album' : 'c-album c-album-vacio'}
                  onClick={meta.album ? () => onAbrirAlbum(t.artista, t.titulo, meta.album) : undefined}
                  title={meta.album ? `Ver álbum: ${formatearTitulo(meta.album)}` : undefined}
                >
                  {meta.album ? formatearTitulo(meta.album) : '-'}
                </span>
                <span className="c-anio">{meta.duracionMs ? reloj(meta.duracionMs / 1000) : '-'}</span>
                <div className="c-acciones">
                  <BotonMeGusta track={t} tracks={tracksTodos} onAlternar={onAlternarColeccion} />
                  <button onClick={() => onAgregar(t)} title="Agregar a la cola" aria-label="Agregar a la cola">
                    ＋
                  </button>
                  <MenuListas
                    track={t}
                    ejes={ejes}
                    tracks={tracksTodos}
                    onAlternar={onAlternarColeccion}
                    onAsignarModo={onAsignarModo}
                    onQuitarModo={onQuitarModo}
                  />
                  <FichaTrack
                    track={t}
                    ejesTrack={t.ejes}
                    ejes={ejes}
                    metadata={meta}
                    onGuardarOverride={onGuardarOverride}
                    onAbrirAlbum={onAbrirAlbum}
                    onAbrirArtista={onAbrirArtista}
                    onQuitarTrack={onQuitarTrack}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

export function Buscador({
  tracks,
  ejes,
  busqueda,
  setBusqueda,
  modo,
  setModo,
  artistas,
  metadataDe,
  listas,
  albumes,
  conteos,
  duracionesTotales,
  coversDeEje,
  artistasDeEje,
  onEntrar,
  onReproducirModo,
  onReproducir,
  onAgregar,
  onAlternarColeccion,
  onAgregarExterno,
  onAsignar,
  onGuardarOverride,
  onQuitarModo,
  onAbrirAlbum,
  onAbrirArtista,
  onQuitarTrack,
  trackActualId,
  fotoDeArtista,
}) {
  // Persistido en localStorage — pedido explícito: sin esto, volver a esta
  // pantalla (el componente se desmonta al cambiar de vista) reseteaba
  // siempre a "Alfabético", obligando a apretar "Por tracks" de nuevo cada
  // vez, aunque fuera la preferencia real de la persona.
  const [ordenArtistas, setOrdenArtistas] = useState(() => {
    try {
      return localStorage.getItem('musicsippi-orden-artistas') === 'tracks' ? 'tracks' : 'alfabetico';
    } catch {
      return 'alfabetico';
    }
  });
  function cambiarOrdenArtistas(valor) {
    setOrdenArtistas(valor);
    try {
      localStorage.setItem('musicsippi-orden-artistas', valor);
    } catch {
      // Sin localStorage (modo privado, cuota llena) la preferencia
      // simplemente no sobrevive a un cambio de pantalla — no es crítico.
    }
  }
  // Mismo mecanismo que ordenArtistas — Álbumes no tenía ninguna forma de
  // ordenar más que alfabético fijo, sin filtro adicional (pedido explícito).
  // "Año" en vez de "Por tracks": la cantidad de canciones no dice mucho de
  // un álbum (casi todos rondan 10-15), pero el año sí sirve para navegar
  // cronológicamente. "Artista" para agrupar sin salir de esta pantalla.
  const ORDENES_ALBUMES_VALIDOS = ['alfabetico', 'anio', 'artista'];
  const [ordenAlbumes, setOrdenAlbumes] = useState(() => {
    try {
      const guardado = localStorage.getItem('musicsippi-orden-albumes');
      return ORDENES_ALBUMES_VALIDOS.includes(guardado) ? guardado : 'alfabetico';
    } catch {
      return 'alfabetico';
    }
  });
  function cambiarOrdenAlbumes(valor) {
    setOrdenAlbumes(valor);
    try {
      localStorage.setItem('musicsippi-orden-albumes', valor);
    } catch {
      // Ídem ordenArtistas: sin localStorage, no persiste, no es crítico.
    }
  }
  const q = busqueda.trim().toLowerCase();

  // "Canciones" ahora es un destino de NAVEGACIÓN (submenú fijo), no solo un
  // resultado de haber escrito algo — sin query se navega la biblioteca
  // entera (ordenada), no se muestra vacío esperando 2+ letras.
  const resultadosBusqueda =
    q.length >= 2
      ? tracks.filter((t) => t.titulo.toLowerCase().includes(q) || t.artista.toLowerCase().includes(q)).slice(0, 200)
      : [];
  const todasOrdenadas = useMemo(
    () => [...tracks].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')),
    [tracks]
  );
  const resultados = modo === 'texto' ? (q.length >= 2 ? resultadosBusqueda : todasOrdenadas) : [];

  const artistasOrdenados = useMemo(
    () =>
      [...artistas].sort((a, b) =>
        ordenArtistas === 'tracks'
          ? b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es')
          : a.nombre.localeCompare(b.nombre, 'es')
      ),
    [artistas, ordenArtistas]
  );

  const artistasFiltrados =
    q.length === 0 ? artistasOrdenados : artistasOrdenados.filter((a) => a.nombre.toLowerCase().includes(q));

  const albumesOrdenados = useMemo(() => {
    const porTitulo = (a, b) => a.titulo.localeCompare(b.titulo, 'es');
    return [...albumes].sort((a, b) => {
      if (ordenAlbumes === 'anio') return (b.anio ?? -1) - (a.anio ?? -1) || porTitulo(a, b);
      if (ordenAlbumes === 'artista') return a.artista.localeCompare(b.artista, 'es') || porTitulo(a, b);
      return porTitulo(a, b);
    });
  }, [albumes, ordenAlbumes]);
  const albumesFiltrados =
    q.length === 0
      ? albumesOrdenados
      : albumesOrdenados.filter((a) => a.titulo.toLowerCase().includes(q) || a.artista.toLowerCase().includes(q));

  const eyebrows = {
    texto: 'Buscar',
    artistas: 'Artistas',
    listas: 'Listas',
    albumes: 'Álbumes',
    agregar: 'Explorar',
  };

  return (
    <main className="buscador">
      <p className="eyebrow">{eyebrows[modo] ?? 'Buscar en tu biblioteca'}</p>

      {modo === 'texto' && (
        <>
          {q.length >= 2 && <p className="menu-listas-titulo artista-seccion-titulo">En tu biblioteca</p>}
          <ListaTracks
            tracks={resultados}
            ejes={ejes}
            tracksTodos={tracks}
            metadataDe={metadataDe}
            onReproducir={onReproducir}
            onAgregar={onAgregar}
            onAlternarColeccion={onAlternarColeccion}
            etiqueta={q.length >= 2 ? `En tu biblioteca: "${busqueda}"` : 'Canciones'}
            onGuardarOverride={onGuardarOverride}
            onAsignarModo={onAsignar}
            onQuitarModo={onQuitarModo}
            trackActualId={trackActualId}
            onAbrirAlbum={onAbrirAlbum}
            onAbrirArtista={onAbrirArtista}
            onQuitarTrack={onQuitarTrack}
          />
          {q.length >= 2 && resultados.length === 0 && (
            <p className="ayuda">Nada en tu biblioteca para "{busqueda}".</p>
          )}
          {q.length >= 2 && resultados.length === 200 && (
            <p className="ayuda">Mostrando los primeros 200 resultados: afiná la búsqueda.</p>
          )}
          {/* Búsqueda unificada, pedido explícito: el cuadro de texto de
              arriba muestra SIEMPRE lo de adentro Y lo de afuera de la
              biblioteca juntos — no hace falta cambiar de pantalla para
              agregar algo que encontraste buscando. */}
          {q.length >= 2 && (
            <>
              <p className="menu-listas-titulo artista-seccion-titulo">Para agregar</p>
              <BuscadorExterno
                busqueda={busqueda}
                ejes={ejes}
                tracks={tracks}
                onAgregarExterno={onAgregarExterno}
                onReproducir={onReproducir}
                onAlternarColeccion={onAlternarColeccion}
                onAsignar={onAsignar}
                onQuitarModo={onQuitarModo}
                onAbrirArtista={onAbrirArtista}
              />
            </>
          )}
        </>
      )}

      {modo === 'listas' && (
        <>
          <p className="ayuda buscador-filtro-total buscador-filtro-total-sola">{listas.length} listas</p>
          <div className="grid fila-tarjetas expandida tarjeta-fila-grande">
          {listas.map((eje) => (
            <TarjetaModo
              key={eje.id}
              eje={eje}
              total={conteos.get(eje.id) ?? 0}
              duracionMs={duracionesTotales.get(eje.id) ?? 0}
              subEjes={[]}
              conteos={conteos}
              onEntrar={onEntrar}
              onReproducir={onReproducirModo}
              covers={coversDeEje.get(eje.id) ?? []}
              artistas={artistasDeEje.get(eje.id) ?? []}
            />
          ))}
          {listas.length === 0 && <p className="ayuda">Todavía no tenés listas. Creá una desde Configuración.</p>}
          </div>
        </>
      )}

      {modo === 'albumes' && (
        <>
          <div className="buscador-filtro-fila">
            <input
              className="buscador-input"
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Filtrar álbumes…"
              autoFocus
            />
            <p className="ayuda buscador-filtro-total">
              {albumesFiltrados.length === albumes.length
                ? `${albumes.length} álbumes`
                : `${albumesFiltrados.length} de ${albumes.length} álbumes`}
            </p>
            <div className="buscador-artistas-orden">
              <button
                className={ordenAlbumes === 'alfabetico' ? 'toggle-orden activo' : 'toggle-orden'}
                onClick={() => cambiarOrdenAlbumes('alfabetico')}
              >
                Alfabético
              </button>
              <button
                className={ordenAlbumes === 'anio' ? 'toggle-orden activo' : 'toggle-orden'}
                onClick={() => cambiarOrdenAlbumes('anio')}
              >
                Año
              </button>
              <button
                className={ordenAlbumes === 'artista' ? 'toggle-orden activo' : 'toggle-orden'}
                onClick={() => cambiarOrdenAlbumes('artista')}
              >
                Artista
              </button>
            </div>
          </div>
          <div className="artista-albumes">
          {albumesFiltrados.map((a) => (
            <div key={`${a.artista.toLowerCase()}||${a.titulo.toLowerCase()}`} className="artista-album-tile">
              {/* Portada+título y artista son dos botones separados (mismo
                  patrón que Tendencias/Explorar): el artista tiene que poder
                  llevar a su ficha sin disparar la apertura del álbum. */}
              <button className="artista-album-tile-btn" onClick={() => onAbrirAlbum(a.artista, a.titulo, a.titulo)}>
                <FotoOIniciales foto={a.coverUrl} nombre={a.titulo} claseVacia="artista-album-tile-vacia" />
                <span className="artista-album-tile-titulo">{formatearTitulo(a.titulo)}</span>
              </button>
              {/* ArtistaTexto, no un botón único con el crédito entero: a.artista
                  puede ser una colaboración ("Calvin Harris · Ellie Goulding").
                  Mandado tal cual a la ficha de artista, Deezer no encuentra nada
                  y el artista "no abría" — verificado contra la API: el crédito
                  combinado da cero resultados, cada nombre por separado sí.
                  ArtistaTexto ya separa los créditos y es lo que usa el resto de
                  la app (ficha de track, listas, historial). */}
              <div className="artista-album-tile-artista">
                <ArtistaTexto artista={a.artista} onAbrirArtista={onAbrirArtista} />
                {a.anio && ` · ${a.anio}`}
              </div>
            </div>
          ))}
          {albumesFiltrados.length === 0 && <p className="ayuda">Sin álbumes para "{busqueda}".</p>}
          </div>
        </>
      )}

      {modo === 'artistas' && (
        <>
          <div className="buscador-filtro-fila">
            <input
              className="buscador-input"
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Filtrar artistas…"
              autoFocus
            />
            <p className="ayuda buscador-filtro-total">
              {artistasFiltrados.length === artistasOrdenados.length
                ? `${artistasOrdenados.length} artistas`
                : `${artistasFiltrados.length} de ${artistasOrdenados.length} artistas`}
            </p>
            <div className="buscador-artistas-orden">
              <button
                className={ordenArtistas === 'alfabetico' ? 'toggle-orden activo' : 'toggle-orden'}
                onClick={() => cambiarOrdenArtistas('alfabetico')}
              >
                Alfabético
              </button>
              <button
                className={ordenArtistas === 'tracks' ? 'toggle-orden activo' : 'toggle-orden'}
                onClick={() => cambiarOrdenArtistas('tracks')}
              >
                Por tracks
              </button>
            </div>
          </div>
          <div className="grid grid-artistas">
            {artistasFiltrados.map((a) => {
              const foto = fotoDeArtista(a.nombre);
              return (
                <button key={a.nombre} className="tarjeta-artista" onClick={() => onAbrirArtista(a.nombre)}>
                  <span className="tarjeta-artista-foto" style={{ background: colorDeArtista(a.nombre) }}>
                    <FotoOIniciales foto={foto} nombre={a.nombre} />
                  </span>
                  <span className="tarjeta-artista-nombre">{formatearTitulo(a.nombre)}</span>
                  <span className="tarjeta-artista-total">{a.cantidad} canciones</span>
                </button>
              );
            })}
          </div>
          {artistasFiltrados.length === 0 && <p className="ayuda">Sin artistas para "{busqueda}".</p>}
        </>
      )}

      {modo === 'agregar' && (
        <Explorar
          artistas={artistas}
          onAbrirArtista={onAbrirArtista}
          onAbrirAlbum={onAbrirAlbum}
          ejes={ejes}
          tracks={tracks}
          onAgregarExterno={onAgregarExterno}
          onReproducir={onReproducir}
          onAlternarColeccion={onAlternarColeccion}
          onAsignar={onAsignar}
          onQuitarModo={onQuitarModo}
        />
      )}
    </main>
  );
}

// Géneros reales de Deezer (/genre), no una selección propia — la lista
// completa tal cual la devuelve la API, para no decidir por el usuario qué
// género "importa". /chart/{id} funciona para los 25 (probado); en cambio
// /editorial/{id}/releases ("nuevos lanzamientos") da 0 resultados siempre
// sin auth de partner, así que esa parte del pedido no se puede ofrecer con
// datos reales — no está en esta lista ni en ningún lado de Explorar.
/**
 * "Explorar" — puerta al descubrimiento, no búsqueda. Pedido explícito:
 * reemplaza a la búsqueda externa (BuscadorExterno) como destino fijo del
 * submenú — esa función de agregar música que no está en la biblioteca sigue
 * viva, pero ahora vive DENTRO de la búsqueda de texto unificada (ver
 * Buscador arriba, modo 'texto'), no acá.
 *
 * Dos fuentes reales, ninguna inventada:
 *  - Tendencias/artistas/álbumes destacados: /api/tendencias, que envuelve
 *    /chart de Deezer (global o por género — pill de géneros arriba).
 *  - Recomendado para vos: /api/recomendaciones, ya existía (artistas
 *    parecidos a los tuyos que todavía no tenés, vía /related de Deezer).
 * Clickear un artista o álbum lleva a la ficha real del artista
 * (VistaArtista, que ya tiene el agregar por canción). Clickear una canción
 * de tendencias reusa BuscadorExterno (mismo flujo de "buscar afuera para
 * agregar" que ya existía) con la búsqueda pre-cargada — no se inventa otra
 * interfaz para agregar.
 */
export function Explorar({
  artistas,
  onAbrirArtista,
  onAbrirAlbum,
  ejes,
  tracks,
  onAgregarExterno,
  onReproducir,
  onAlternarColeccion,
  onAsignar,
  onQuitarModo,
}) {
  const [genero, setGenero] = useState('0');
  const [tendencias, setTendencias] = useState(null); // null = cargando
  const [errorTendencias, setErrorTendencias] = useState(null);
  const [trackSeleccionado, setTrackSeleccionado] = useState(null); // {artista, titulo}

  useEffect(() => {
    let cancelado = false;
    setTendencias(null);
    setErrorTendencias(null);
    obtenerTendencias(genero)
      .then((json) => {
        if (cancelado) return;
        if (json.error) throw new Error(json.mensaje ?? json.error);
        setTendencias(json);
      })
      .catch((e) => {
        if (!cancelado) setErrorTendencias(traducirError(e));
      });
    return () => {
      cancelado = true;
    };
  }, [genero]);

  const [recomendados, setRecomendados] = useState(null); // null = cargando
  const [errorRecomendados, setErrorRecomendados] = useState(null);

  useEffect(() => {
    let cancelado = false;
    setRecomendados(null);
    setErrorRecomendados(null);
    // `artistas` es TODA la biblioteca (puede ser miles) — pedirle a Deezer
    // "relacionados" de cada uno en paralelo (obtenerRecomendaciones hace 2
    // pedidos JSONP por nombre) fue lo que disparaba 403 en cadena ("muchos
    // artistas generan error en las imágenes"): Deezer rate-limita por IP y
    // un solo montaje de esta pantalla podía intentar miles de pedidos de
    // golpe. Una semilla acotada a los artistas con más tracks alcanza igual
    // para armar recomendaciones razonables, sin ese volumen.
    const SEMILLA_MAXIMA = 12;
    const semilla = [...artistas]
      .sort((a, b) => (b.cantidad ?? 0) - (a.cantidad ?? 0))
      .slice(0, SEMILLA_MAXIMA)
      .map((a) => a.nombre);
    obtenerRecomendaciones(semilla)
      .then((json) => {
        if (cancelado) return;
        if (json.error) throw new Error(json.mensaje ?? json.error);
        setRecomendados(json.artistas);
      })
      .catch((e) => {
        if (!cancelado) setErrorRecomendados(traducirError(e));
      });
    return () => {
      cancelado = true;
    };
    // Se recalcula solo si cambia la CANTIDAD de artistas (agregar/quitar
    // biblioteca) — no hace falta re-pedir por cada cambio de orden interno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistas.length]);

  return (
    <div className="explorar">
      <div className="explorar-generos">
        {GENEROS_DEEZER.map((g) => (
          <button
            key={g.id}
            className={genero === g.id ? 'activo' : ''}
            onClick={() => setGenero(g.id)}
          >
            {g.nombre}
          </button>
        ))}
      </div>

      {errorTendencias && <p className="aviso">No se pudieron cargar tendencias: {errorTendencias}</p>}
      {!tendencias && !errorTendencias && <p className="ayuda buscando">Cargando tendencias…</p>}

      {tendencias?.tracks.length > 0 && (
        <>
          <p className="menu-listas-titulo artista-seccion-titulo">Álbumes en tendencia</p>
          <div className="artista-albumes">
            {tendencias.tracks.map((t) => (
              <div key={t.id} className="artista-album-tile">
                {/* Portada+título agregan la canción; el artista es un botón
                    aparte que lleva a su ficha — antes todo el tile era un
                    solo botón y no había forma de ir al artista sin pasar
                    por el flujo de agregar. */}
                <button
                  className="artista-album-tile-btn"
                  onClick={() => setTrackSeleccionado({ artista: t.artista, titulo: t.titulo })}
                  title={`Agregar "${t.titulo}"`}
                >
                  <FotoOIniciales foto={t.cover} nombre={t.artista} claseVacia="artista-album-tile-vacia" />
                  <span className="artista-album-tile-titulo">{t.titulo}</span>
                </button>
                <button className="artista-album-tile-artista" onClick={() => onAbrirArtista(t.artista)}>
                  {formatearTitulo(t.artista)}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {trackSeleccionado && (
        <div className="explorar-agregar">
          <p className="menu-listas-titulo">
            Agregar: {trackSeleccionado.artista} · {trackSeleccionado.titulo}{' '}
            <button className="h2-accion" onClick={() => setTrackSeleccionado(null)}>
              Cerrar ×
            </button>
          </p>
          <BuscadorExterno
            busqueda={`${trackSeleccionado.artista} ${trackSeleccionado.titulo}`}
            ejes={ejes}
            tracks={tracks}
            onAgregarExterno={onAgregarExterno}
            onReproducir={onReproducir}
            onAlternarColeccion={onAlternarColeccion}
            onAsignar={onAsignar}
            onQuitarModo={onQuitarModo}
            onAbrirArtista={onAbrirArtista}
          />
        </div>
      )}

      {tendencias?.artists.length > 0 && (
        <>
          <p className="menu-listas-titulo artista-seccion-titulo">Artistas destacados</p>
          <div className="grid grid-artistas">
            {tendencias.artists.map((a) => (
              <button key={a.id} className="tarjeta-artista" onClick={() => onAbrirArtista(a.nombre)}>
                <span className="tarjeta-artista-foto" style={{ background: colorDeArtista(a.nombre) }}>
                  <FotoOIniciales foto={a.foto} nombre={a.nombre} />
                </span>
                <span className="tarjeta-artista-nombre">{formatearTitulo(a.nombre)}</span>
                <span className="tarjeta-artista-total">destacado</span>
              </button>
            ))}
          </div>
        </>
      )}

      {tendencias?.albums.length > 0 && (
        <>
          <p className="menu-listas-titulo artista-seccion-titulo">Álbumes destacados</p>
          <div className="artista-albumes">
            {tendencias.albums.map((a) => (
              // div, no button: adentro van DOS botones (álbum, artista) —
              // un botón no puede anidar otro botón (HTML inválido). Mismo
              // patrón que "Álbumes en tendencia" más arriba.
              <div key={a.id} className="artista-album-tile">
                <button
                  className="artista-album-tile-btn"
                  onClick={() => onAbrirAlbum(a.artista, a.titulo, a.titulo)}
                >
                  <FotoOIniciales
                    foto={a.cover}
                    nombreColor={a.artista}
                    nombreIniciales={a.titulo}
                    claseVacia="artista-album-tile-vacia"
                  />
                  <span className="artista-album-tile-titulo">{a.titulo}</span>
                </button>
                {/* Pedido explícito: artista siempre clickable — antes texto
                    plano dentro del mismo botón que abre el ÁLBUM, sin forma
                    de ir directo a la ficha del artista desde acá. */}
                <button className="artista-album-tile-artista" onClick={() => onAbrirArtista(a.artista)}>
                  {formatearTitulo(a.artista)}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="menu-listas-titulo artista-seccion-titulo">Recomendado para vos</p>
      {errorRecomendados && <p className="aviso">No se pudo cargar recomendaciones: {errorRecomendados}</p>}
      {!recomendados && !errorRecomendados && (
        <p className="ayuda buscando">Buscando artistas parecidos a los tuyos…</p>
      )}
      {recomendados?.length === 0 && (
        <p className="ayuda">
          Todavía no hay suficientes datos para recomendar. Visitá algunas páginas de artista y volvé.
        </p>
      )}
      {recomendados?.length > 0 && (
        <div className="grid grid-artistas">
          {recomendados.map((a) => (
            <button key={a.nombre} className="tarjeta-artista" onClick={() => onAbrirArtista(a.nombre)}>
              <span className="tarjeta-artista-foto" style={{ background: colorDeArtista(a.nombre) }}>
                <FotoOIniciales foto={a.fotoUrl} nombre={a.nombre} />
              </span>
              <span className="tarjeta-artista-nombre">{formatearTitulo(a.nombre)}</span>
              <span className="tarjeta-artista-total">nuevo para vos</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Busca en YouTube (vía InnerTube, sin cuota) algo que no está en la
 * biblioteca — Fase 9. A diferencia del buscador interno, acá cada resultado
 * es un candidato a elegir, no un track ya clasificado: el título/artista
 * sugeridos son una estimación (canal "X - Topic" → artista X; si el título
 * ya viene "Artista - Canción" se usa eso) que el usuario puede corregir
 * después con "✎ Corregir datos" una vez agregada.
 */
export function BuscadorExterno({
  busqueda,
  ejes,
  tracks,
  onAgregarExterno,
  onReproducir,
  onAlternarColeccion,
  onAsignar,
  onQuitarModo,
  onAbrirArtista,
}) {
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const [estados, setEstados] = useState({}); // videoId -> 'agregando' | 'ok' | 'yaExistia' | 'error'
  const paraEscuchar = ejes.filter((e) => e.tipo === 'gusto' && e.activo && !e.sistema);
  const deFondo = ejes.filter((e) => e.tipo === 'funcional' && e.activo && !e.sistema);

  // Índice título+artista -> track, para avisar ANTES de tocar "Agregar" que
  // un resultado ya está en la biblioteca — antes solo se sabía después de
  // intentar agregarlo (el servidor respondía yaExistia:true).
  const indiceBiblioteca = useMemo(() => {
    const m = new Map();
    for (const t of tracks) {
      m.set(`${tituloParaMatch(t.titulo)}|||${artistaParaMatch(t.artista)}`, t);
    }
    return m;
  }, [tracks]);

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    setError(null);
    // Debounce: sin esto, cada letra tipeada dispara su propia búsqueda —
    // acá cada una es una consulta real a InnerTube, no un filtro local.
    const t = setTimeout(async () => {
      try {
        const json = await buscarExterno(q);
        if (cancelado) return;
        if (json.error) throw new Error(json.mensaje ?? json.error);
        // Casing prolijo desde acá, no solo al mostrar: lo que se manda a
        // /api/agregar-track si se toca "Agregar" es esto mismo, así que
        // limpiarlo acá evita guardar "SAM SMITH" tal cual vino del título
        // del video. No afecta el id (idTrack normaliza a minúscula igual).
        setResultados((json.resultados ?? []).map((r) => ({
          ...r,
          tituloSugerido: formatearTitulo(r.tituloSugerido),
          artistaSugerido: formatearTitulo(r.artistaSugerido),
        })));
      } catch (e) {
        if (!cancelado) setError(traducirError(e));
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 500);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [busqueda]);

  // Escuchar un resultado ANTES de decidir si agregarlo — no crea nada en la
  // biblioteca. El videoId ya se conoce (vino de la búsqueda), así que no
  // hace falta pasar por /api/resolver: arma un track "de mentira" con el id
  // prefijado (nunca choca con un id real, que son hex de 12) y lo reproduce
  // con la infraestructura de siempre. Al no vivir en `tracks`, no ensucia
  // el historial ni ningún otro lado — Historial ya filtra los trackId que
  // no encuentra en `tracks`.
  function escuchar(r) {
    const preview = {
      id: `preview-${r.videoId}`,
      artista: r.artistaSugerido,
      titulo: r.tituloSugerido,
      fuentes: ['youtube'],
      youtubeQuery: `${r.artistaSugerido} ${r.tituloSugerido}`,
      youtubeVideoId: r.videoId,
      ejes: [],
    };
    onReproducir(preview, [preview], 'Vista previa');
  }

  async function agregar(r) {
    setEstados((s) => ({ ...s, [r.videoId]: 'agregando' }));
    try {
      const json = await onAgregarExterno({
        titulo: r.tituloSugerido,
        artista: r.artistaSugerido,
        videoId: r.videoId,
      });
      // El track queda disponible tanto si se creó como si ya existía —
      // en los dos casos hay un trackId real contra el que ya se puede
      // marcar me gusta, sumar a una lista o asignarle un modo.
      setEstados((s) => ({
        ...s,
        [r.videoId]: json.yaExistia ? 'yaExistia' : 'ok',
        [`${r.videoId}-track`]: json.track,
      }));
    } catch (e) {
      setEstados((s) => ({ ...s, [r.videoId]: 'error' }));
    }
  }

  // Me gusta / lista / modo actúan sobre el track YA creado (trackAgregado) —
  // parchea `[videoId-track].ejes` en el estado local con lo que devuelve el
  // servidor, para que el corazón y el checkbox reflejen el cambio ya, sin
  // esperar a que `tracks` (prop, más arriba en App) se vuelva a pasar acá.
  function patchearEjes(videoId, ejesNuevos) {
    setEstados((s) => ({
      ...s,
      [`${videoId}-track`]: { ...s[`${videoId}-track`], ejes: ejesNuevos },
    }));
  }

  async function darMeGusta(videoId, trackId) {
    await onAlternarColeccion(trackId, 'favoritos', true);
    patchearEjes(videoId, [
      ...(estados[`${videoId}-track`]?.ejes ?? []).filter((e) => e.ejeId !== 'favoritos'),
      { ejeId: 'favoritos', origen: 'manual', senal: 'usuario', score: 1 },
    ]);
  }

  async function asignarAModo(videoId, trackId, ejeId) {
    if (!ejeId) return;
    await onAsignar(trackId, ejeId);
    patchearEjes(videoId, [
      ...(estados[`${videoId}-track`]?.ejes ?? []).filter((e) => e.ejeId !== 'sin-clasificar' && e.ejeId !== ejeId),
      { ejeId, origen: 'manual', senal: 'usuario', score: 1 },
    ]);
  }

  return (
    <div className="buscador-externo">
      {busqueda.trim().length < 2 && (
        <p className="ayuda">Escribí el nombre de una canción que no esté en tu biblioteca.</p>
      )}
      {buscando && <p className="ayuda buscando">Buscando en YouTube…</p>}
      {error && <p className="aviso">No se pudo buscar: {error}</p>}

      <ul className="lista-externa">
        {resultados.map((r) => {
          const estado = estados[r.videoId];
          const trackAgregado = estados[`${r.videoId}-track`];
          const nombreEje = trackAgregado
            ? formatearTitulo(ejes.find((e) => e.id === trackAgregado.ejes[0]?.ejeId)?.nombre ?? null)
            : null;
          const yaEnBiblioteca = indiceBiblioteca.get(
            `${tituloParaMatch(r.tituloSugerido)}|||${artistaParaMatch(r.artistaSugerido)}`
          );

          return (
            <li key={r.videoId} className={yaEnBiblioteca && !estado ? 'externa-repetida' : ''}>
              {r.thumbnail && (
                <img
                  src={r.thumbnail}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              {/* Entre la portada y el título, mismo lugar que el resto de las
                  listas (Favoritos, cola, historial) — pedido explícito de
                  consistencia: antes vivía en .externa-acciones, a la
                  derecha, la única lista con el play en un lugar distinto. */}
              <button
                className="externa-escuchar"
                onClick={() => escuchar(r)}
                title="Escuchar antes de agregar"
                aria-label="Escuchar antes de agregar"
              >
                ▶
              </button>
              <div className="externa-info">
                <strong>{formatearTitulo(r.tituloSugerido)}</strong>
                <span>
                  {/* Pedido explícito: el artista siempre tiene enlace, ya
                      sea de tu biblioteca o todavía no. */}
                  <button className="externa-artista-link" onClick={() => onAbrirArtista(r.artistaSugerido)}>
                    {formatearTitulo(r.artistaSugerido)}
                  </button>
                  {r.duracionTexto && ` · ${r.duracionTexto}`}
                </span>
              </div>
              <div className="externa-acciones">
                {!estado && yaEnBiblioteca && (
                  <button
                    className="externa-ok"
                    onClick={() => onReproducir(yaEnBiblioteca, [yaEnBiblioteca], yaEnBiblioteca.artista)}
                    title="Ya está en tu biblioteca"
                  >
                    ✓ Ya en tu biblioteca · reproducir
                  </button>
                )}
                {!estado && !yaEnBiblioteca && (
                  <button onClick={() => agregar(r)} title="Agregar a mi biblioteca">
                    ＋ Agregar
                  </button>
                )}
                {estado === 'agregando' && <span className="externa-estado">Agregando…</span>}
                {estado === 'ok' && (
                  <button
                    className="externa-ok"
                    onClick={() => onReproducir(trackAgregado, [trackAgregado], nombreEje ?? trackAgregado.artista)}
                  >
                    ✓ Agregada{nombreEje ? ` a ${nombreEje}` : ''} · reproducir
                  </button>
                )}
                {estado === 'yaExistia' && <span className="externa-estado">Ya estaba en tu biblioteca</span>}
                {estado === 'error' && <span className="externa-estado externa-error">No se pudo agregar</span>}
                {trackAgregado && (
                  <div className="externa-clasificar">
                    <button
                      className="externa-favorito"
                      title="Me gusta"
                      aria-label="Me gusta"
                      disabled={trackAgregado.ejes.some((e) => e.ejeId === 'favoritos')}
                      onClick={() => darMeGusta(r.videoId, trackAgregado.id)}
                    >
                      {trackAgregado.ejes.some((e) => e.ejeId === 'favoritos') ? '♥' : '♡'}
                    </button>
                    <MenuListas
                      track={trackAgregado}
                      ejes={ejes}
                      tracks={tracks}
                      onAlternar={onAlternarColeccion}
                      onAsignarModo={onAsignar}
                      onQuitarModo={onQuitarModo}
                    />
                    <select
                      defaultValue=""
                      title="Asignar a un modo"
                      onChange={(e) => {
                        asignarAModo(r.videoId, trackAgregado.id, e.target.value);
                        e.target.value = '';
                      }}
                    >
                      <option value="">Asignar a un modo…</option>
                      <optgroup label="Para escuchar">
                        {paraEscuchar.map((e) => (
                          <option key={e.id} value={e.id}>
                            {formatearTitulo(e.nombre)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="De fondo">
                        {deFondo.map((e) => (
                          <option key={e.id} value={e.id}>
                            {formatearTitulo(e.nombre)}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!buscando && busqueda.trim().length >= 2 && resultados.length === 0 && !error && (
        <p className="ayuda">Sin resultados para "{busqueda}".</p>
      )}
    </div>
  );
}

/**
 * `historial` guarda {trackId, ejeId, ejeNombre, titulo, artista, ts} — el
 * trackId se resuelve contra `tracks` (vivo) para tener la ficha completa
 * (ejes, me gusta, listas). Si el track no está en la biblioteca (sonó desde
 * "Canciones populares" o un álbum sin agregar todavía), se arma un track
 * "de mentira" con el snapshot de título/artista guardado al momento de
 * sonar — así la entrada se sigue viendo completa en vez de desaparecer.
 * Entradas viejas (de antes de guardar ese snapshot) sin match en la
 * biblioteca sí se descartan, porque no hay con qué mostrarlas.
 */
export function Historial({
  historial,
  tracks,
  ejes,
  metadataDe,
  onReproducir,
  onAgregar,
  onAlternarColeccion,
  onAsignarModo,
  onQuitarModo,
  onAbrirArtista,
  onAbrirAlbum,
  onEntrarModo,
  onAgregarSuelto,
  trackActualId,
}) {
  const [tab, setTab] = useState('reciente');
  const [estadosAgregar, setEstadosAgregar] = useState({});

  async function agregarUno(h, favorito) {
    setEstadosAgregar((s) => ({ ...s, [h.trackId]: 'agregando' }));
    try {
      await onAgregarSuelto({ artista: h.artista, titulo: h.titulo }, { favorito });
      setEstadosAgregar((s) => ({ ...s, [h.trackId]: 'ok' }));
    } catch {
      setEstadosAgregar((s) => ({ ...s, [h.trackId]: 'error' }));
    }
  }

  const entradas = useMemo(() => {
    const porId = new Map(tracks.map((t) => [t.id, t]));
    return historial
      .map((h) => {
        const real = porId.get(h.trackId);
        if (real) return { ...h, track: real, sintetico: false };
        if (!h.titulo) return null;
        return {
          ...h,
          sintetico: true,
          track: {
            id: h.trackId,
            artista: h.artista ?? '',
            titulo: h.titulo,
            fuentes: ['historial'],
            youtubeQuery: `${h.artista ?? ''} ${h.titulo}`,
            youtubeVideoId: null,
            ejes: [],
          },
        };
      })
      .filter(Boolean);
  }, [historial, tracks]);

  const recientes = entradas.slice(0, 200);

  const rankingTracks = useMemo(() => {
    const porTrack = new Map();
    for (const e of entradas) {
      const actual = porTrack.get(e.trackId) ?? { track: e.track, sintetico: e.sintetico, n: 0 };
      // Si alguna reproducción del track ya es "real" (está en la
      // biblioteca), esa gana sobre un snapshot sintético más viejo.
      if (!e.sintetico) {
        actual.track = e.track;
        actual.sintetico = false;
      }
      actual.n += 1;
      porTrack.set(e.trackId, actual);
    }
    return [...porTrack.values()].sort((a, b) => b.n - a.n).slice(0, 50);
  }, [entradas]);

  const rankingModos = useMemo(() => {
    const idsValidos = new Set(ejes.map((e) => e.id));
    const porModo = new Map();
    for (const e of entradas) {
      // Un eje borrado deja atrás historial con un ejeId que ya no existe —
      // se excluye del ranking en vez de mostrarse como fila deshabilitada
      // para siempre (la limpieza real del registro pasa en el effect de
      // App, esto es solo la salvaguarda de render).
      if (!e.ejeId || !idsValidos.has(e.ejeId)) continue;
      const actual = porModo.get(e.ejeId) ?? { nombre: e.ejeNombre ?? e.ejeId, n: 0 };
      actual.n += 1;
      porModo.set(e.ejeId, actual);
    }
    return [...porModo.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  }, [entradas, ejes]);

  return (
    <main className="historial-vista">
      <p className="eyebrow">Tu actividad</p>
      <h2>Recientes</h2>

      <div className="tabs">
        <button className={tab === 'reciente' ? 'activo' : ''} onClick={() => setTab('reciente')}>
          Reciente
        </button>
        <button className={tab === 'sonados' ? 'activo' : ''} onClick={() => setTab('sonados')}>
          Más sonados
        </button>
      </div>

      {entradas.length === 0 && (
        <p className="ayuda">Todavía no escuchaste nada. Cuando reproduzcas algo va a aparecer acá.</p>
      )}

      {entradas.length > 0 && tab === 'reciente' && (
        <>
          <div className="cola-header cola-header-historial">
            <span />
            <span />
            <span>Canción</span>
            <span className="c-album">Álbum</span>
            <span className="c-anio">Cuándo</span>
            <span />
          </div>
          <div className="cola-scroll">
            <ol className="cola cola-historial">
              {recientes.map((e, i) => {
                const sonando = e.trackId === trackActualId;
                const meta = metadataDe(e.trackId);
                return (
                <li key={`${e.trackId}-${e.ts}-${i}`} className={sonando ? 'actual' : ''}>
                  <Portada coverUrl={meta.coverUrl} nombreFallback={meta.album || e.track.titulo} />
                  <button
                    className="c-play"
                    onClick={() => onReproducir(e.track, recientes.map((r) => r.track), 'Historial')}
                    title="Reproducir"
                    aria-label="Reproducir"
                  >
                    {sonando ? '♪' : '▶'}
                  </button>
                  <span
                    className="c-titulo"
                    onClick={() => onReproducir(e.track, recientes.map((r) => r.track), 'Historial')}
                  >
                    <span className="c-titulo-texto">{formatearTitulo(e.track.titulo)}</span>
                    <span className="c-artista">
                      <ArtistaTexto artista={e.track.artista} onAbrirArtista={onAbrirArtista} />
                    </span>
                  </span>
                  <span
                    className={meta.album ? 'c-album' : 'c-album c-album-vacio'}
                    onClick={meta.album ? () => onAbrirAlbum(e.track.artista, e.track.titulo, meta.album) : undefined}
                    title={meta.album ? `Ver álbum: ${formatearTitulo(meta.album)}` : undefined}
                  >
                    {meta.album ? formatearTitulo(meta.album) : '-'}
                  </span>
                  <span className="c-anio">{tiempoRelativo(e.ts)}</span>
                  <div className="c-acciones">
                    {e.sintetico ? (
                      // Sonó sin estar en la biblioteca (Canciones populares,
                      // álbum sin agregar) — Me Gusta/Listas pegarían contra
                      // un trackId que el servidor no conoce. Se ofrece
                      // agregar en su lugar, mismo criterio que Cola/VistaArtista.
                      <>
                        {estadosAgregar[e.trackId] === 'ok' && <span className="c-preview-estado">✓ Agregada</span>}
                        {estadosAgregar[e.trackId] === 'error' && (
                          <span className="c-preview-estado c-preview-error">Error</span>
                        )}
                        {(!estadosAgregar[e.trackId] || estadosAgregar[e.trackId] === 'agregando') && (
                          <button
                            onClick={() => agregarUno(e, false)}
                            disabled={estadosAgregar[e.trackId] === 'agregando'}
                            title="Agregar a mi biblioteca"
                            aria-label="Agregar a mi biblioteca"
                          >
                            {estadosAgregar[e.trackId] === 'agregando' ? '…' : '＋'}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <BotonMeGusta track={e.track} tracks={tracks} onAlternar={onAlternarColeccion} />
                        <button onClick={() => onAgregar(e.track)} title="Agregar a la cola" aria-label="Agregar a la cola">
                          ＋
                        </button>
                        <MenuListas
                          track={e.track}
                          ejes={ejes}
                          tracks={tracks}
                          onAlternar={onAlternarColeccion}
                          onAsignarModo={onAsignarModo}
                          onQuitarModo={onQuitarModo}
                        />
                      </>
                    )}
                  </div>
                </li>
                );
              })}
            </ol>
          </div>
        </>
      )}

      {entradas.length > 0 && tab === 'sonados' && (
        <>
          <section>
            <h3 className="historial-subtitulo">Canciones</h3>
            <div className="cola-header">
              <span />
              <span />
              <span>Canción</span>
              <span className="c-album">Reproducciones</span>
              <span />
              <span />
            </div>
            <div className="cola-scroll">
              <ol className="cola">
                {rankingTracks.map((r) => {
                  const sonando = r.track.id === trackActualId;
                  const meta = metadataDe(r.track.id);
                  return (
                  <li key={r.track.id} className={sonando ? 'actual' : ''}>
                    <Portada coverUrl={meta.coverUrl} nombreFallback={meta.album || r.track.titulo} />
                    <button
                      className="c-play"
                      onClick={() => onReproducir(r.track, rankingTracks.map((x) => x.track), 'Más sonadas')}
                      title="Reproducir"
                      aria-label="Reproducir"
                    >
                      {sonando ? '♪' : '▶'}
                    </button>
                    <span
                      className="c-titulo"
                      onClick={() => onReproducir(r.track, rankingTracks.map((x) => x.track), 'Más sonadas')}
                    >
                      <span className="c-titulo-texto">{formatearTitulo(r.track.titulo)}</span>
                      <span className="c-artista">
                        <ArtistaTexto artista={r.track.artista} onAbrirArtista={onAbrirArtista} />
                      </span>
                    </span>
                    <span className="c-album">{r.n} {r.n === 1 ? 'vez' : 'veces'}</span>
                    <span className="c-anio" />
                    <div className="c-acciones">
                      {r.sintetico ? (
                        <>
                          {estadosAgregar[r.track.id] === 'ok' && <span className="c-preview-estado">✓ Agregada</span>}
                          {estadosAgregar[r.track.id] === 'error' && (
                            <span className="c-preview-estado c-preview-error">Error</span>
                          )}
                          {(!estadosAgregar[r.track.id] || estadosAgregar[r.track.id] === 'agregando') && (
                            <button
                              onClick={() => agregarUno({ trackId: r.track.id, artista: r.track.artista, titulo: r.track.titulo }, false)}
                              disabled={estadosAgregar[r.track.id] === 'agregando'}
                              title="Agregar a mi biblioteca"
                              aria-label="Agregar a mi biblioteca"
                            >
                              {estadosAgregar[r.track.id] === 'agregando' ? '…' : '＋'}
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <BotonMeGusta track={r.track} tracks={tracks} onAlternar={onAlternarColeccion} />
                          <button onClick={() => onAgregar(r.track)} title="Agregar a la cola" aria-label="Agregar a la cola">
                            ＋
                          </button>
                          <MenuListas
                            track={r.track}
                            ejes={ejes}
                            tracks={tracks}
                            onAlternar={onAlternarColeccion}
                            onAsignarModo={onAsignarModo}
                            onQuitarModo={onQuitarModo}
                          />
                        </>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ol>
            </div>
          </section>

          {rankingModos.length > 0 && (
            <section>
              <h3 className="historial-subtitulo">Modos</h3>
              <ul className="ranking-modos">
                {rankingModos.map(([ejeId, r]) => {
                  const eje = ejes.find((e) => e.id === ejeId);
                  return (
                    <li key={ejeId}>
                      <button disabled={!eje} onClick={() => eje && onEntrarModo(eje)}>
                        <span>{formatearTitulo(r.nombre)}</span>
                        <span className="conteo">{r.n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

/**
 * Agrupa las pantallas de curador/ayuda detrás de una sola entrada de
 * navegación. `tab` es controlado por App (no local): el acceso directo
 * "Ayuda" del header necesita poder forzar esa pestaña puntual aunque
 * Administrar ya esté montado en otra.
 */
export function Administrar({
  ejes,
  conteos,
  pendientesDeClasificar,
  onClasificarAsistida,
  onGuardarEjes,
  onCrearEje,
  onEntrarAModo,
  onVolver,
  onImportarTuneMyMusic,
  onImportarMusicaLocal,
  onVerOnboarding,
  tab,
  onCambiarTab: setTab,
  onIrABuscar,
  onIrAExplorar,
  onIrAInicio,
  estadoEnriquecimiento,
}) {
  return (
    <main className="administrar">
      <button className="volver" onClick={onVolver}>
        ← Inicio
      </button>
      <h2>Configuración</h2>
      {/* Indicador pasivo, solo acá adentro — nunca en el Home ni en la
          barra de navegación global (pedido explícito). Neutro con 0,
          color de alerta cuando hay algo real para revisar. */}
      {/* Oculto mientras el enriquecimiento automático está activo — pedido
          explícito: ofrecer clasificación MANUAL en paralelo con el
          automático corriendo es la misma carrera que ya se evitó entre
          ambos caminos (ver 2026-09-11-quitar-revision-modos-post-import-design.md).
          Vuelve a aparecer solo cuando termina el ciclo. */}
      {pendientesDeClasificar > 0 && !estadoEnriquecimiento?.activo && (
        <p className="aviso-sin-clasificar">
          {pendientesDeClasificar} {pendientesDeClasificar === 1 ? 'canción' : 'canciones'} todavía sin
          clasificar
          {/* On-demand a propósito (Tarea 17): la pantalla de clasificación
              asistida solo se abre si la persona lo pide acá — mismo espíritu
              de "nunca molesta sola" que ya rige este indicador pasivo. */}
          <button className="clasificar-ahora" onClick={onClasificarAsistida}>
            Clasificar ahora
          </button>
        </p>
      )}

      {/* El aviso de enriquecimiento (spec
          2026-09-08-enriquecimiento-automatico-design.md) ya no vive acá — se
          movió a un solo lugar fijo arriba de <header>, visible en toda la
          app sin importar la pantalla (pedido explícito, ver el div .app). */}

      <div className="tabs">
        <button className={tab === 'modos' ? 'activo' : ''} onClick={() => setTab('modos')}>
          Administrar modos/listas
        </button>
        <button
          className={tab === 'cargar' ? 'activo' : ''}
          onClick={() => setTab('cargar')}
          data-tour="cargar-biblioteca"
        >
          Cargar biblioteca
        </button>
        <button className={tab === 'backup' ? 'activo' : ''} onClick={() => setTab('backup')}>
          Backup
        </button>
        <button className={tab === 'reproduccion' ? 'activo' : ''} onClick={() => setTab('reproduccion')}>
          Reproducción
        </button>
        <button className={tab === 'movil' ? 'activo' : ''} onClick={() => setTab('movil')}>
          Móvil
        </button>
        <button className={tab === 'acerca' ? 'activo' : ''} onClick={() => setTab('acerca')}>
          Acerca de
        </button>
        <button className={tab === 'ayuda' ? 'activo' : ''} onClick={() => setTab('ayuda')}>
          Ayuda
        </button>
        <button className={tab === 'escribinos' ? 'activo' : ''} onClick={() => setTab('escribinos')}>
          Escribinos
        </button>
        {/* Semi-oculto a propósito (spec, Reinicio total): no va en el menú
            principal ni tiene un ícono llamativo — solo otro tab más al
            fondo de Configuración, igual que los demás. */}
        <button className={tab === 'avanzado' ? 'activo' : ''} onClick={() => setTab('avanzado')}>
          Avanzado
        </button>
      </div>

      {tab === 'ayuda' && (
        <Ayuda
          onVerOnboarding={onVerOnboarding}
          onIrACargar={() => setTab('cargar')}
          onIrAModos={() => setTab('modos')}
          onIrABuscar={onIrABuscar}
          onIrAExplorar={onIrAExplorar}
          onIrAInicio={onIrAInicio}
        />
      )}
      {tab === 'escribinos' && <Escribinos />}
      {tab === 'modos' && (
        <EditorEjes
          ejes={ejes}
          conteos={conteos}
          onGuardar={onGuardarEjes}
          onCrear={onCrearEje}
          onEntrar={onEntrarAModo}
        />
      )}
      {tab === 'cargar' && (
        <>
          <CargarBiblioteca onImportar={onImportarTuneMyMusic} />
          <CargarMusicaLocal onImportar={onImportarMusicaLocal} />
        </>
      )}
      {tab === 'backup' && <Backup />}
      {tab === 'reproduccion' && <AjustesReproduccion />}
      {tab === 'movil' && <SincronizacionMovil />}
      {tab === 'avanzado' && <ReinicioTotal />}
      {tab === 'acerca' && <AcercaDe />}
    </main>
  );
}

// Ajustes de reproducción del escritorio. «Nivelar volumen» (activado por defecto) baja las
// canciones que YouTube marca más fuertes que su referencia, nunca sube ninguna.
export function AjustesReproduccion() {
  const [nivelar, setNivelar] = useState(() => leerNivelar());
  return (
    <section className="ayuda-seccion">
      <label className="ajuste-check">
        <input
          type="checkbox"
          checked={nivelar}
          onChange={(e) => {
            guardarNivelar(e.target.checked);
            setNivelar(e.target.checked);
          }}
        />{' '}
        Nivelar volumen
      </label>
      <p className="ayuda">Que todas las canciones suenen a un volumen parecido: solo baja las que vienen más fuertes.</p>
    </section>
  );
}

export function Backup() {
  const [estadoRestaurar, setEstadoRestaurar] = useState('inicial'); // inicial | restaurando | listo | error
  const [errorRestaurar, setErrorRestaurar] = useState(null);
  const [estadoFuentes, setEstadoFuentes] = useState('inicial'); // inicial | cargando | listo | error
  const [resultadoFuentes, setResultadoFuentes] = useState(null);

  async function manejarArchivoFuentes(e) {
    await conArchivoDeInput(e, async (archivo) => {
      setEstadoFuentes('cargando');
      setResultadoFuentes(null);
      try {
        const objetoFuentes = JSON.parse(await archivo.text());
        const resultado = await cargarFuentesManual(objetoFuentes);
        setResultadoFuentes(resultado);
        setEstadoFuentes(resultado.aplicado ? 'listo' : 'error');
      } catch (err) {
        setResultadoFuentes({ aplicado: false, errores: [traducirError(err)] });
        setEstadoFuentes('error');
      }
    });
  }

  async function manejarArchivoRestaurar(e) {
    await conArchivoDeInput(e, async (archivo) => {
      // Confirmación explícita: esto pisa toda la biblioteca/modos/favoritos
      // actuales. El backup previo de cada archivo queda guardado del lado
      // del servidor (*.pre-restaurar.json), pero mejor evitar el susto.
      if (
        !window.confirm(
          `Vas a reemplazar TODA tu biblioteca actual con el contenido de "${archivo.name}". Esto no se puede deshacer desde acá (aunque el servidor guarda una copia de lo anterior). ¿Seguir?`
        )
      ) {
        return;
      }
      try {
        setEstadoRestaurar('restaurando');
        setErrorRestaurar(null);
        const contenido = JSON.parse(await archivo.text());
        const r = await restaurarBackupApi(contenido);
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        setEstadoRestaurar('listo');
        // biblioteca/ejes se importan estáticos en App.jsx (ver el comentario
        // en electron/main.cjs) — no hay forma de que el estado ya cargado en
        // memoria refleje el archivo nuevo sin recargar la página entera.
        window.location.reload();
      } catch (err) {
        setErrorRestaurar(traducirError(err));
        setEstadoRestaurar('error');
      }
    });
  }

  return (
    <div className="backup">
      <p className="ayuda">
        Descarga tu biblioteca, tus modos/listas, tus me gusta y tus correcciones manuales. Sirve para
        guardar una copia o para llevarla a otra instalación de la app. No incluye portadas ni fotos
        cacheadas (esas se vuelven a pedir solas).
      </p>
      <div className="backup-opciones">
        <a className="backup-descargar" href="/api/backup" download="musicsippi-backup.json">
          <Icono nombre="descargar" tamano={15} /> JSON completo
        </a>
        <a className="backup-descargar-secundario" href="/api/backup?formato=csv" download="musicsippi-backup.csv">
          <Icono nombre="descargar" tamano={14} /> CSV
        </a>
        <a
          className="backup-descargar-secundario"
          href="/api/backup?formato=texto"
          download="musicsippi-backup.txt"
        >
          <Icono nombre="descargar" tamano={14} /> Texto
        </a>
      </div>
      <p className="ayuda">
        El JSON es el único que se puede restaurar entero (listas, me gusta, correcciones). El CSV trae
        canción/artista/lista en el mismo formato que ya sabe leer "Cargar tu biblioteca". Sirve para
        volver a importarlo. El texto es solo para leer o compartir.
      </p>

      <h3 className="backup-restaurar-titulo">Restaurar desde un backup</h3>
      <p className="ayuda">
        Subí un JSON completo generado acá arriba (de esta instalación o de otra) para reemplazar tu
        biblioteca actual. Pensado para llevar tu música a una instalación nueva, no para uso diario.
      </p>
      <label className="backup-restaurar-boton">
        <Icono nombre="subir" tamano={15} />
        {estadoRestaurar === 'restaurando' ? 'Restaurando…' : 'Elegir archivo JSON'}
        <input type="file" accept=".json,application/json" onChange={manejarArchivoRestaurar} disabled={estadoRestaurar === 'restaurando'} />
      </label>
      {estadoRestaurar === 'error' && <p className="aviso">No se pudo restaurar: {errorRestaurar}</p>}

      <h3 className="backup-restaurar-titulo">Cargar actualización de fuentes</h3>
      <p className="ayuda">
        La app revisa esto solo una vez por día en segundo plano. Usá esto solo si querés forzar una
        actualización del vocabulario/umbrales de clasificación (<code>fuentes.json</code>) a mano,
        subiendo un archivo con una versión más nueva que la actual.
      </p>
      <label className="backup-restaurar-boton">
        <Icono nombre="subir" tamano={15} />
        {estadoFuentes === 'cargando' ? 'Cargando…' : 'Elegir archivo JSON'}
        <input
          type="file"
          accept=".json,application/json"
          onChange={manejarArchivoFuentes}
          disabled={estadoFuentes === 'cargando'}
        />
      </label>
      {resultadoFuentes && resultadoFuentes.aplicado && (
        <p className="ayuda">Aplicado: ahora en versión {resultadoFuentes.version}.</p>
      )}
      {resultadoFuentes && !resultadoFuentes.aplicado && (
        <p className="aviso">
          No se aplicó: {(resultadoFuentes.errores ?? []).join(', ') || 'error desconocido'}
        </p>
      )}
    </div>
  );
}

// Reinicio total (Tarea 19): borra biblioteca/modos/historial/favoritos y
// deja la app como una instalación fresca. Doble confirmación real: el botón
// queda deshabilitado hasta escribir "BORRAR" literal, Y el servidor vuelve a
// exigir esa misma palabra en el body (ver /api/reiniciar en vite.config.js) —
// esto último es la confirmación que de verdad protege, la del cliente es
// solo para no confirmar por error de un click de más.
export function ReinicioTotal() {
  const [texto, setTexto] = useState('');
  const [borrarDescargado, setBorrarDescargado] = useState(false);
  const [estado, setEstado] = useState('inicial'); // inicial | reiniciando | error
  const [error, setError] = useState(null);

  async function confirmar() {
    if (texto !== 'BORRAR') return;
    setEstado('reiniciando');
    setError(null);
    try {
      await reiniciarTodoApi({ borrarDescargado });
      // biblioteca.json/ejes.json se importan estáticos en App.jsx (mismo
      // motivo que restaurarBackup, más arriba en este archivo): no hay forma
      // de que el estado ya cargado en memoria refleje el reinicio sin
      // recargar la página entera.
      window.location.reload();
    } catch (err) {
      setError(traducirError(err));
      setEstado('error');
    }
  }

  return (
    <div className="reinicio-total">
      <p className="ayuda">
        Sección avanzada: borra tu biblioteca, tus modos/listas, tu historial, tus me gusta (tracks y
        álbumes/artistas favoritos) y tus correcciones manuales. Deja la app en el mismo estado que una
        instalación recién hecha. No se puede deshacer desde acá.
      </p>
      <p className="ayuda">
        Se conservan los caches de red (portadas, fotos, videos ya resueltos) para que recargar la
        biblioteca no vuelva a tardar, salvo que tildes la opción de abajo.
      </p>
      <label className="reinicio-total-checkbox">
        <input
          type="checkbox"
          checked={borrarDescargado}
          onChange={(e) => setBorrarDescargado(e.target.checked)}
          disabled={estado === 'reiniciando'}
        />
        Borrar también lo descargado (caché de YouTube, MusicBrainz, Spotify y Deezer)
      </label>
      <p className="ayuda">Escribí <strong>BORRAR</strong> para habilitar el botón:</p>
      <input
        className="reinicio-total-input"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={estado === 'reiniciando'}
        placeholder="BORRAR"
      />
      <button
        className="reinicio-total-boton"
        disabled={texto !== 'BORRAR' || estado === 'reiniciando'}
        onClick={confirmar}
      >
        {estado === 'reiniciando' ? 'Reiniciando…' : 'Reiniciar todo'}
      </button>
      {estado === 'error' && <p className="aviso">No se pudo reiniciar: {error}</p>}
    </div>
  );
}

/**
 * Sube un CSV exportado desde tunemymusic.com (Spotify, Apple Music,
 * YouTube Music, Amazon Music, Deezer... TuneMyMusic normaliza todo al
 * mismo formato, así que sirve el mismo archivo sin importar la plataforma).
 * Se lee el archivo ACÁ, en el navegador, con FileReader — nunca sale del
 * dispositivo del usuario salvo hacia este mismo servidor.
 */
export function CargarBiblioteca({ onImportar }) {
  const [estado, setEstado] = useState('inicial'); // inicial | leyendo | listo | error
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  async function manejarArchivo(e) {
    await conArchivoDeInput(e, async (archivo) => {
      setEstado('leyendo');
      setError(null);
      setResultado(null);
      try {
        // `archivo.text()` decodifica siempre como UTF-8, sin detectar nada
        // — un CSV exportado en Windows-1252 (pasa con algunas plataformas
        // de origen o herramientas viejas) llega con los acentos rotos
        // (un "?" en el lugar de cada tilde) y sin ningún aviso. Caso real,
        // visto en una biblioteca importada: "De Música Ligera" guardado
        // como "De M?sica Ligera". decodificarTextoDeArchivo prueba UTF-8
        // primero y solo cae a Windows-1252 si esos bytes no son UTF-8
        // válido, así que un CSV genuinamente UTF-8 (la mayoría) no cambia
        // en nada.
        const contenido = decodificarTextoDeArchivo(await archivo.arrayBuffer());
        const json = await onImportar(contenido);
        setResultado(json);
        setEstado('listo');
      } catch (err) {
        setError(traducirError(err));
        setEstado('error');
      }
    });
  }

  return (
    <div className="cargar-biblioteca">
      <p className="ayuda">
        Exportá tu biblioteca (o cualquier playlist) desde{' '}
        <a href="https://www.tunemymusic.com/" target="_blank" rel="noreferrer">
          tunemymusic.com
        </a>
        . Funciona con Spotify, Apple Music, YouTube Music, Amazon Music, Deezer y más. Elegí tu
        plataforma como origen, "Archivo" como destino, y subí el CSV que te descargue acá.
      </p>
      <p className="ayuda">
        Podés subir varios archivos, uno por vez (una playlist a la vez, por ejemplo). Cada carga
        <strong> suma o actualiza</strong> sobre lo que ya tenés, nunca borra lo que ya cargaste antes.
        Tamaño máximo por archivo: <strong>50&nbsp;MB</strong>.
      </p>
      <p className="ayuda">
        ¿Preferís armar el CSV a mano en vez de exportarlo de una plataforma? Necesita estas columnas
        exactas: <code>Track name</code>, <code>Artist name</code>, <code>Album</code>,{' '}
        <code>Playlist name</code>, <code>Type</code> (esta última puede ir vacía).{' '}
        <a href="/ejemplo-biblioteca.csv" download="ejemplo-biblioteca.csv">
          Descargar un CSV de ejemplo
        </a>
        .
      </p>

      <label className="cargar-boton">
        <Icono nombre="subir" tamano={15} />
        {estado === 'leyendo' ? 'Procesando…' : 'Elegir archivo CSV'}
        <input type="file" accept=".csv,text/csv" onChange={manejarArchivo} disabled={estado === 'leyendo'} />
      </label>

      {estado === 'error' && <p className="aviso">No se pudo importar: {error}</p>}

      {estado === 'listo' && resultado && (
        <div className="cargar-resultado">
          <p>
            ✓ {resultado.filasLeidas} filas leídas
            {resultado.filasDescartadas > 0 &&
              ` (${resultado.filasDescartadas} descartadas: artistas/álbumes seguidos, o sin título/artista utilizable)`}
            .
          </p>
          <ul>
            <li>Canciones nuevas en tu biblioteca: {resultado.tracksNuevos}</li>
            <li>Álbumes completados: {resultado.albumesNuevos}</li>
            <li>Marcados como favoritos: {resultado.favoritosMarcados}</li>
            <li>Sumados a listas: {resultado.pertenenciasMarcadas}</li>
            {resultado.propagadas > 0 && (
              <li>Clasificados solos por artista: {resultado.propagadas}</li>
            )}
          </ul>
          {resultado.listasNuevas.length > 0 && (
            <p>Listas nuevas creadas: {resultado.listasNuevas.map(formatearTitulo).join(', ')}</p>
          )}
          {resultado.listasEliminadas?.length > 0 && (
            <p>Listas/modos vacíos eliminados: {resultado.listasEliminadas.map(formatearTitulo).join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Suma mp3 locales a la biblioteca. Igual que CargarBiblioteca, la canción
 * sigue sonando desde YouTube (el mp3 nunca se reproduce ni se sube) — este
 * componente solo le dice a la app "esto ya lo tenés".
 *
 * `webkitdirectory`/`directory` se setean vía ref (no como prop JSX): React
 * no reconoce ese atributo no-estándar y tirar warning por una prop
 * desconocida es peor que setearlo a mano una vez montado.
 */
export function CargarMusicaLocal({ onImportar }) {
  const inputRef = useRef(null);
  const [estado, setEstado] = useState('inicial'); // inicial | procesando | listo | error
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute('webkitdirectory', '');
      inputRef.current.setAttribute('directory', '');
    }
  }, []);

  async function manejarCarpeta(e) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite volver a elegir la misma carpeta si hace falta reintentar
    const mp3s = archivos.filter((f) => f.name.toLowerCase().endsWith('.mp3'));
    if (mp3s.length === 0) return; // carpeta sin mp3 (o el usuario canceló el selector): no hay nada que avisar

    // window.musicsippi lo expone electron/preload.cjs vía contextBridge —
    // solo existe corriendo dentro de la app de Electron real. File.path (la
    // vieja propiedad no estándar) ya no existe en esta versión de Electron,
    // y nunca existió en un navegador suelto (`npm run dev` sin Electron) —
    // así que fuera de la app empaquetada/electron:dev esta función no puede
    // funcionar, y hace falta avisarlo en vez de fallar en silencio.
    if (!window.musicsippi?.getPathForFile) {
      setError('esta función solo está disponible dentro de la app de Musicsippi (no en el navegador)');
      setEstado('error');
      return;
    }
    const rutas = mp3s.map((f) => window.musicsippi.getPathForFile(f)).filter(Boolean);
    if (rutas.length === 0) return;

    setEstado('procesando');
    setError(null);
    setResultado(null);
    try {
      const json = await onImportar(rutas);
      setResultado(json);
      setEstado('listo');
    } catch (err) {
      setError(traducirError(err));
      setEstado('error');
    }
  }

  return (
    <div className="cargar-musica-local">
      <p className="ayuda">
        ¿Tenés mp3 descargados en tu disco? Elegí la carpeta donde están (busca también en las
        subcarpetas) y Musicsippi lee el artista y título de cada archivo para sumarlos a tu
        biblioteca. La canción sigue sonando desde YouTube como el resto del catálogo, esto solo
        hace que la app sepa que ya la tenés.
      </p>

      <label className="cargar-boton">
        <Icono nombre="subir" tamano={15} />
        {estado === 'procesando' ? 'Procesando…' : 'Elegir carpeta de música'}
        <input ref={inputRef} type="file" multiple onChange={manejarCarpeta} disabled={estado === 'procesando'} />
      </label>

      {estado === 'error' && <p className="aviso">No se pudo importar: {error}</p>}

      {estado === 'listo' && resultado && (
        <div className="cargar-resultado">
          <p>✓ {resultado.total} archivo(s) mp3 procesados.</p>
          <ul>
            <li>Canciones nuevas en tu biblioteca: {resultado.agregados}</li>
            <li>Ya las tenías (sumadas como fuente local): {resultado.fusionados}</li>
            {resultado.sinClasificar > 0 && (
              <li>
                Sin datos suficientes para clasificar solas: {resultado.sinClasificar}, revisalas en
                "Sin clasificar"
              </li>
            )}
            {resultado.noLeidos > 0 && <li>No se pudieron leer: {resultado.noLeidos}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
