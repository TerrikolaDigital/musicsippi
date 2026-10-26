// src/movil/ShellMovil.jsx
// Raíz de la interfaz móvil: pantalla actual de la pestaña, mini-reproductor,
// barra inferior y capas (reproductor completo, hojas). Todo el estado y las
// acciones llegan de App.jsx por `ctx`; aquí solo se decide qué se ve.
import { AvisoActualizacion, SeccionActualizaciones } from './TarjetaActualizacion.jsx';
import { AvisoNovedades } from './TarjetaNovedades.jsx';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './movil.css';
import './noMeGusta.css';
import './tema.css';
import './albumes-acceso.css';
import { seguirSistema } from '../data/tema.js';
import NavInferior from './NavInferior.jsx';
import ToastMovil from './ToastMovil.jsx';
import MiniReproductor from './MiniReproductor.jsx';
import ReproductorCompleto from './ReproductorCompleto.jsx';
import HojaAcciones, { HojaModo, HojaArtista } from './HojaAcciones.jsx';
import { useNavegacionMovil } from './useNavegacionMovil.js';
import { clavePantalla } from './navegacion.js';
import { crearMemoriaScroll, esVuelta } from './scrollPantalla.js';
import { alturaInferior } from './disposicion.js';
import { coincideEntrada } from './noMeGusta.js';
import { useAnadirActual } from './useAnadirActual.js';
import { vaciarMood, restaurarMood } from './vaciarMood.js';
import { formatearTitulo } from '../ui/formato.js';
import ModosMovil from './pantallas/ModosMovil.jsx';
import DetalleModo from './pantallas/DetalleModo.jsx';
import InicioMovil from './pantallas/InicioMovil.jsx';
import BuscarMovil from './pantallas/BuscarMovil.jsx';
import BibliotecaMovil from './pantallas/BibliotecaMovil.jsx';
import ArtistaMovil from './pantallas/ArtistaMovil.jsx';
import AlbumMovil from './pantallas/AlbumMovil.jsx';
import SubpantallaMovil from './pantallas/SubpantallaMovil.jsx';
import EditorModosMovil from './pantallas/EditorModosMovil.jsx';
import * as dbLocal from '../data/lib/db.js';
import { repararPower } from '../data/migrar-moods-movil.js';
import { recalificarMovil } from '../data/recalificar-moods-movil.js';
import { obtenerMetadata } from '../data/biblioteca.js';
import AvisoProgreso from './AvisoProgreso.jsx';
import { escucharTextoCompartido } from '../data/nativo-movil.js';
import { abrirTextoCompartido } from './compartir.js';
import { debeMostrarBienvenida } from './bienvenida/bienvenida.js';
import { obtenerBienvenidaVista } from './bienvenida/estado-bienvenida.js';
import { sincronizarAlAbrir } from '../data/sincronizar-movil.js';
import { crearQuitarDiferido } from './quitarDiferido.js';
import { textoFranjaSinConexion } from '../data/sin-conexion.js';

// Pantallas y hojas poco usadas: se descargan al abrirlas (aligera el arranque del móvil).
const EstadisticasMovil = lazy(() => import('./pantallas/EstadisticasMovil.jsx'));
const AyudaMovil = lazy(() => import('./pantallas/AyudaMovil.jsx'));
const HistorialMovil = lazy(() => import('./pantallas/HistorialMovil.jsx'));
const ConfiguracionMovil = lazy(() => import('./pantallas/ConfiguracionMovil.jsx'));
const SinModoMovil = lazy(() => import('./pantallas/SinModoMovil.jsx'));
const SincronizarMovil = lazy(() => import('./pantallas/SincronizarMovil.jsx'));
const CopiaMovil = lazy(() => import('./pantallas/CopiaMovil.jsx'));
const ReorganizarMoods = lazy(() => import('./pantallas/ReorganizarMoods.jsx'));
const RevisarMoods = lazy(() => import('./pantallas/RevisarMoods.jsx'));
const ConfigInicioMovil = lazy(() => import('./pantallas/ConfigInicioMovil.jsx'));
const EditarEstadosMovil = lazy(() => import('./pantallas/EditarEstadosMovil.jsx'));
const NoMeGustaMovil = lazy(() => import('./pantallas/NoMeGustaMovil.jsx'));
const EcualizadorMovil = lazy(() => import('./pantallas/EcualizadorMovil.jsx'));
const SinConexionMovil = lazy(() => import('./pantallas/SinConexionMovil.jsx'));
const HojaConfig = lazy(() => import('./HojaConfig.jsx'));
const BienvenidaMovil = lazy(() => import('./bienvenida/BienvenidaMovil.jsx'));
const ResumenMovil = lazy(() => import('./resumen/ResumenMovil.jsx'));

const TITULOS = { inicio: 'Inicio', modos: 'Moods', buscar: 'Buscar', biblioteca: 'Biblioteca' };

// Se reemplaza pantalla a pantalla en las tareas siguientes del plan.
function Provisional({ titulo }) {
  return <h1 className="m-titulo">{titulo}</h1>;
}

// Subpantallas que reutilizan componentes de escritorio (vienen por ctx.componentes).
function SubpantallaConfig({ tipo, ctx, nav, ejeId }) {
  const { Escribinos, AcercaDe } = ctx.componentes;
  if (tipo === 'config-modos') return <EditorModosMovil ctx={ctx} nav={nav} ejeId={ejeId} />;
  if (tipo === 'config-ayuda') {
    return <AyudaMovil ctx={ctx} nav={nav} />;
  }
  if (tipo === 'config-escribinos') {
    return (
      <SubpantallaMovil titulo="Escríbenos" nav={nav}>
        <Escribinos />
      </SubpantallaMovil>
    );
  }
  if (tipo === 'config-acerca') {
    return (
      <SubpantallaMovil titulo="Acerca de" nav={nav}>
        <AcercaDe />
        <SeccionActualizaciones />
      </SubpantallaMovil>
    );
  }
  return <Provisional titulo={tipo} />;
}

function Pantalla({ pantalla, ctx, nav }) {
  if (pantalla.tipo === 'raiz' && pantalla.pestana === 'modos') return <ModosMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'raiz' && pantalla.pestana === 'inicio') return <InicioMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'raiz' && pantalla.pestana === 'buscar') return <BuscarMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'raiz' && pantalla.pestana === 'biblioteca') return <BibliotecaMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'raiz') return <Provisional titulo={TITULOS[pantalla.pestana]} />;
  if (pantalla.tipo === 'modo') return <DetalleModo ctx={ctx} nav={nav} ejeId={pantalla.ejeId} />;
  if (pantalla.tipo === 'artista') return <ArtistaMovil key={pantalla.nombre} ctx={ctx} nav={nav} nombre={pantalla.nombre} />;
  if (pantalla.tipo === 'album') {
    return <AlbumMovil key={`${pantalla.artista}||${pantalla.titulo}`} ctx={ctx} nav={nav} artista={pantalla.artista} titulo={pantalla.titulo} />;
  }
  if (pantalla.tipo === 'historial') return <HistorialMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'estadisticas') return <EstadisticasMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'configuracion') return <ConfiguracionMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'config-sincronizar') return <SincronizarMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'config-reorganizar') return <ReorganizarMoods ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'config-revisar-moods') return <RevisarMoods ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'config-copia') return <CopiaMovil nav={nav} />;
  if (pantalla.tipo === 'config-sin-modo') return <SinModoMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'config-inicio') return <ConfigInicioMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'config-estados') return <EditarEstadosMovil ctx={ctx} nav={nav} ejeId={pantalla.ejeId} />;
  if (pantalla.tipo === 'config-no-me-gusta') return <NoMeGustaMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo === 'config-ecualizador') return <EcualizadorMovil nav={nav} />;
  if (pantalla.tipo === 'config-sin-conexion') return <SinConexionMovil ctx={ctx} nav={nav} />;
  if (pantalla.tipo.startsWith('config-')) return <SubpantallaConfig tipo={pantalla.tipo} ctx={ctx} nav={nav} ejeId={pantalla.ejeId} />;
  return <Provisional titulo={pantalla.tipo} />;
}

export default function ShellMovil({ ctx: ctxApp }) {
  const nav = useNavegacionMovil();
  // «Quitar de la biblioteca» con Deshacer (artistas, álbumes): vive aquí para
  // sobrevivir a la pantalla que lo pidió. La baja se aplica al vencer el plazo.
  const [bajaPendiente, setBajaPendiente] = useState(null);
  const quitarRef = useRef(ctxApp.quitarTrackSuelto);
  quitarRef.current = ctxApp.quitarTrackSuelto;
  const unirRef = useRef(ctxApp.unirModos);
  unirRef.current = ctxApp.unirModos;
  const diferido = useRef(null);
  if (!diferido.current) {
    diferido.current = crearQuitarDiferido({
      // Un id objeto es una unión de modos (misma lógica de plazo y Deshacer que las bajas).
      quitar: (id) => (typeof id === 'object' ? unirRef.current(id.origenId, id.destinoId) : quitarRef.current(id)),
      alCambiar: setBajaPendiente,
    });
  }
  useEffect(() => () => void diferido.current.vaciar(), []);
  useEffect(() => seguirSistema(), []); // «Sistema»: sigue al modo oscuro automático del móvil
  // «No me gusta»: guarda la marca, salta la canción si es la que suena y avisa con Deshacer
  // (en canciones de la biblioteca, también «Quitar de la biblioteca»: marcar no la borra).
  const [avisoNMG, setAvisoNMG] = useState(null);
  const temporizadorNMG = useRef(null);
  useEffect(() => () => clearTimeout(temporizadorNMG.current), []);
  const cerrarAvisoNMG = () => {
    clearTimeout(temporizadorNMG.current);
    setAvisoNMG(null);
  };
  const marcarNoMeGusta = (entrada, track = null) => {
    const marca = ctxApp.guardarNoMeGusta(entrada);
    if (coincideEntrada(ctxApp.trackActual, entrada)) ctxApp.siguiente();
    const propia = track && (ctxApp.tracksTodos ?? ctxApp.tracks).find((t) => t.id === track.id);
    setAvisoNMG({ marca, quitarId: propia ? propia.id : null, titulo: propia ? propia.titulo : null });
    clearTimeout(temporizadorNMG.current);
    temporizadorNMG.current = setTimeout(() => setAvisoNMG(null), 7000);
  };
  // «Quitar todas las canciones» de un mood: se aplica ya y se ofrece Deshacer unos segundos.
  const [vaciado, setVaciado] = useState(null);
  const temporizadorVaciado = useRef(null);
  useEffect(() => () => clearTimeout(temporizadorVaciado.current), []);
  const vaciarModo = async (eje, ids) => {
    const { quitadas, falladas } = await vaciarMood(ctxApp, eje, ids);
    clearTimeout(temporizadorVaciado.current);
    if (falladas) ctxApp.avisar?.(`No se pudieron quitar ${falladas} de ${ids.length} canciones`);
    if (!quitadas.length) return;
    setVaciado({ eje, quitadas });
    temporizadorVaciado.current = setTimeout(() => setVaciado(null), 6000);
  };
  const deshacerVaciado = async () => {
    const actual = vaciado;
    clearTimeout(temporizadorVaciado.current);
    setVaciado(null);
    if (!actual) return;
    const { falladas } = await restaurarMood(ctxApp, actual.eje, actual.quitadas);
    ctxApp.avisar?.(falladas ? `No se pudieron restaurar ${falladas} canciones` : 'Canciones restauradas');
  };
  const anadirActual = useAnadirActual(ctxApp);
  const ctx = {
    ...ctxApp,
    nav, // para las hojas locales (HojaExterna) que deben cerrarse con «atrás» de Android
    marcarNoMeGusta,
    anadirActual,
    vaciarModo,
    quitarConDeshacer: (ids, etiqueta) => diferido.current.programar(ids, etiqueta),
    unirConDeshacer: (origenId, destinoId, etiqueta) => diferido.current.programar([{ origenId, destinoId }], etiqueta),
  };
  // Toda pantalla nueva empieza arriba (la página entera es la que se desplaza); al
  // volver atrás se recupera la posición donde se dejó. Un único sitio para todas las pantallas.
  const clave = clavePantalla(nav.estado);
  const memoriaScroll = useRef(null);
  const posicionNav = useRef(null); // { clave, pestana, profundidad } de la pantalla anterior
  const ultimoY = useRef(0);
  if (!memoriaScroll.current) memoriaScroll.current = crearMemoriaScroll();
  useEffect(() => {
    const alDesplazar = () => {
      ultimoY.current = window.scrollY;
    };
    window.addEventListener('scroll', alDesplazar, { passive: true });
    return () => window.removeEventListener('scroll', alDesplazar);
  }, []);
  useLayoutEffect(() => {
    const actual = { clave, pestana: nav.estado.pestana, profundidad: nav.estado.pilas[nav.estado.pestana].length };
    const anterior = posicionNav.current;
    if (anterior && anterior.clave !== clave) memoriaScroll.current.salir(anterior.clave, ultimoY.current);
    posicionNav.current = actual;
    if (anterior?.clave === clave) return undefined;
    const y = memoriaScroll.current.entrar(clave, esVuelta(anterior, actual));
    const ir = () => {
      for (const el of [window, document.scrollingElement, document.querySelector('.shell-movil-contenido')]) {
        el?.scrollTo?.(0, y);
      }
      ultimoY.current = y;
    };
    ir();
    // El contenido que llega después (artista, álbum) no debe arrastrar el scroll: se reafirma tras pintar.
    const marco = requestAnimationFrame(() => requestAnimationFrame(ir));
    return () => cancelAnimationFrame(marco);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  // Compartir → Musicsippi: abre «Añadir música» con el enlace (también en frío:
  // el plugin retiene el evento hasta esta suscripción).
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    let manejador = null;
    let vivo = true;
    escucharTextoCompartido((texto) => abrirTextoCompartido(navRef.current, texto))
      .then((h) => {
        if (vivo) manejador = h;
        else h.remove();
      })
      .catch(() => {}); // sin plugin nativo no hay «Compartir»; el resto de la app sigue
    return () => {
      vivo = false;
      manejador?.remove();
    };
  }, []);
  // Bienvenida: la primera vez o con la biblioteca vacía (ver bienvenida.js).
  // Se decide cuando la biblioteca guardada ya está cargada, con su número real.
  useEffect(() => {
    if (!ctx.modoLocal || !ctx.bibliotecaCargada) return undefined;
    let vivo = true;
    obtenerBienvenidaVista()
      .then((vista) => {
        if (vivo && debeMostrarBienvenida({ vista, numTracks: ctx.tracks.length })) {
          navRef.current.abrirCapa({ tipo: 'bienvenida', paso: 1 });
        }
      })
      .catch(() => {}); // sin lectura no se molesta al usuario con la bienvenida
    return () => {
      vivo = false;
    };
  }, [ctx.modoLocal, ctx.bibliotecaCargada]);
  // No bloquea la apertura ni avisa si el PC no está en casa; si terminó con
  // cambios, el aviso existente es suficiente y la biblioteca se refresca.
  const autoSyncHecha = useRef(false);
  useEffect(() => {
    if (!ctx.modoLocal || !ctx.bibliotecaCargada || autoSyncHecha.current) return;
    autoSyncHecha.current = true;
    sincronizarAlAbrir().then((r) => {
      if (r) {
        ctx.recargarDatosLocales?.();
        ctx.avisar?.(`Sincronización terminada${r.copiados ? `: ${r.copiados} archivo${r.copiados === 1 ? '' : 's'} copiado${r.copiados === 1 ? '' : 's'}.` : '.'}`);
      }
    }).catch(() => {});
  }, [ctx.modoLocal, ctx.bibliotecaCargada]);
  // Reparación única de Power tras «Reorganizar en moods» (idempotente; ver repararPower): al abrir, ya con datos.
  const powerReparado = useRef(false);
  useEffect(() => {
    if (!ctx.modoLocal || !ctx.bibliotecaCargada || powerReparado.current) return;
    powerReparado.current = true;
    repararPower(dbLocal).then((r) => {
      if (r?.hecho && r.anadidas > 0) {
        ctx.recargarDatosLocales?.();
        ctx.avisar?.(`Power recuperado: ${r.anadidas} canciones de Gym y Workout.`);
      }
    }).catch(() => {})
      // Recalificación única de moods (reglas de compatibilidad estado x género): después de Power, para que lo
      // repuesto también se revise. Deja la lista en Ajustes › Revisar moods y se puede deshacer.
      .then(async () => recalificarMovil(dbLocal, { metadata: await obtenerMetadata().catch(() => null) }))
      .then((r) => {
        if (r?.hecho && r.cambiadas > 0) {
          ctx.recargarDatosLocales?.();
          ctx.avisar?.(`He revisado tus moods: ${r.cambiadas} canciones cambian. Míralas en Ajustes › Revisar moods.`);
        }
      })
      .catch(() => {}); // un fallo no se marca como hecho: se reintenta en la próxima apertura
  }, [ctx.modoLocal, ctx.bibliotecaCargada]);
  // Playlists seguidas: se revisan una vez por apertura (cada una, máx. 1 vez/24 h),
  // con la biblioteca ya cargada y sin bloquear el arranque.
  const seguidasRevisadas = useRef(false);
  useEffect(() => {
    if (!ctx.modoLocal || !ctx.bibliotecaCargada || seguidasRevisadas.current) return;
    seguidasRevisadas.current = true;
    ctx.importacion.revisarSeguidas(ctx.avisar).catch(() => {}); // un fallo se reintenta en la próxima apertura
  }, [ctx.modoLocal, ctx.bibliotecaCargada]);
  const reserva = alturaInferior({ hayTrack: !!ctx.trackActual });
  const capaReproductor = nav.capas.find((c) => c.tipo === 'reproductor');
  const capaHoja = nav.capas.find((c) => c.tipo === 'hoja');
  const capaBienvenida = nav.capas.find((c) => c.tipo === 'bienvenida');
  // El reproductor sigue montado 280 ms tras salir de la navegación para cerrarse animado.
  const hayReproductor = !!capaReproductor && !!ctx.trackActual;
  const [cerrandoRep, setCerrandoRep] = useState(false);
  const [hayActualizacion, setHayActualizacion] = useState(false);
  const ultimaVista = useRef('portada');
  if (capaReproductor) ultimaVista.current = capaReproductor.vista;
  useEffect(() => {
    if (hayReproductor) {
      setCerrandoRep(true);
      return undefined;
    }
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setCerrandoRep(false), quieto ? 160 : 280);
    return () => clearTimeout(t);
  }, [hayReproductor]);
  // Tocar la pestaña ya activa: si la página está desplazada sube al principio; en Buscar,
  // si ya está arriba, enfoca el campo. Dentro de una subpantalla vuelve a la raíz de la pestaña.
  const tocarPestana = (pestana) => {
    if (pestana !== nav.pestana || nav.estado.pilas[pestana].length || nav.capas.length) return nav.irAPestana(pestana);
    const desplazado = Math.max(window.scrollY, document.scrollingElement?.scrollTop ?? 0, document.querySelector('.shell-movil-contenido')?.scrollTop ?? 0) > 0;
    if (desplazado) {
      for (const el of [window, document.scrollingElement, document.querySelector('.shell-movil-contenido')]) {
        el?.scrollTo?.({ top: 0, behavior: 'smooth' });
      }
    } else if (pestana === 'buscar') {
      document.querySelector('.shell-movil-contenido input[type="search"]')?.focus();
    }
  };
  return (
    <div className="shell-movil" style={{ '--reserva-inferior': `${reserva}px` }}>
      <ToastMovil aviso={ctx.aviso} />
      <AvisoActualizacion oculto={hayReproductor || nav.capas.length > 0} onHay={setHayActualizacion} />
      <AvisoNovedades oculto={hayReproductor || nav.capas.length > 0 || hayActualizacion} />
      {/* Se oculta con el reproductor completo o una hoja abierta (taparía título, artista y barra) y en las pasadas automáticas (solo punto en Inicio). */}
      <AvisoProgreso
        estado={hayReproductor || ctx.importacion?.enSegundoPlano || nav.capas.some((c) => c.tipo === 'hoja' || c.tipo === 'hoja-album' || c.tipo === 'hoja-externa') ? null : ctx.importacion?.organizacion}
        onVerModos={() => {
          nav.irAPestana('modos');
          ctx.importacion.cerrarAviso();
        }}
        onUsarDatos={() => ctx.importacion.organizarConDatos()}
        onReintentar={() => {
          ctx.importacion.cerrarAviso();
          ctx.importacion.reintentarOrganizar();
        }}
        onCerrar={() => ctx.importacion.cerrarAviso()}
      />
      {avisoNMG && !bajaPendiente && (
        <div className="m-deshacer m-deshacer-nmg" role="status">
          <span>No te recomendaremos esto</span>
          <span className="m-deshacer-acciones">
            {avisoNMG.quitarId && (
              <button
                onClick={() => {
                  ctx.quitarConDeshacer([avisoNMG.quitarId], `Quitando «${formatearTitulo(avisoNMG.titulo)}» de tu biblioteca`);
                  cerrarAvisoNMG();
                }}
              >
                Quitar de la biblioteca
              </button>
            )}
            <button
              onClick={() => {
                ctxApp.quitarNoMeGusta(avisoNMG.marca.tipo, avisoNMG.marca.clave);
                cerrarAvisoNMG();
              }}
            >
              Deshacer
            </button>
          </span>
        </div>
      )}
      {vaciado && !bajaPendiente && (
        <div className="m-deshacer" role="status">
          <span>{vaciado.quitadas.length} {vaciado.quitadas.length === 1 ? 'canción quitada' : 'canciones quitadas'} de «{formatearTitulo(vaciado.eje.nombre)}»</span>
          <button onClick={deshacerVaciado}>Deshacer</button>
        </div>
      )}
      {bajaPendiente && (
        <div className="m-deshacer" role="status">
          <span>{bajaPendiente.etiqueta}</span>
          <button onClick={() => diferido.current.deshacer()}>Deshacer</button>
        </div>
      )}
      {ctx.sinConexion && !ctx.sinConexion.hayRed && (
        <div className="m-sin-conexion" role="status">
          {textoFranjaSinConexion(ctx.sinConexion.nGuardadas)}
        </div>
      )}
      <main className="shell-movil-contenido">
        <Suspense fallback={null}>
          <Pantalla pantalla={nav.pantalla} ctx={ctx} nav={nav} />
        </Suspense>
      </main>
      <MiniReproductor ctx={ctx} onAbrir={(vista = 'portada') => nav.abrirCapa({ tipo: 'reproductor', vista })}
        onTemporizador={() => nav.abrirCapa({ tipo: 'hoja', config: 'sueno' })}
      />
      {/* velo al pie: el contenido que pasa por debajo de la barra no asoma bajo ella */}
      <div className="nav-velo" aria-hidden="true" />
      <NavInferior pestana={nav.pestana} onCambiar={tocarPestana} />
      {/* Sin canción sonando no hay reproductor completo que abrir. */}
      {(hayReproductor || cerrandoRep) && ctx.trackActual && (
        <ReproductorCompleto ctx={ctx} nav={nav} vista={ultimaVista.current} saliendo={!hayReproductor} />
      )}
      <Suspense fallback={null}>
        {capaBienvenida && <BienvenidaMovil ctx={ctx} nav={nav} paso={capaBienvenida.paso} />}
        {nav.capas.find((c) => c.tipo === 'resumen') && <ResumenMovil ctx={ctx} nav={nav} periodo={nav.capas.find((c) => c.tipo === 'resumen').periodo} />}
      </Suspense>
      {/* La hoja va siempre por encima del reproductor. `key` reinicia su sub-lista al cambiar de canción. */}
      {capaHoja?.trackId && <HojaAcciones key={capaHoja.trackId} ctx={ctx} nav={nav} trackId={capaHoja.trackId} />}
      {capaHoja?.config && (
        <Suspense fallback={null}>
          <HojaConfig key={`${capaHoja.config}|${capaHoja.texto ?? ''}`} ctx={ctx} nav={nav} tipo={capaHoja.config} texto={capaHoja.texto} locales={capaHoja.locales} />
        </Suspense>
      )}
      {capaHoja?.artista && <HojaArtista key={capaHoja.artista} ctx={ctx} nav={nav} nombre={capaHoja.artista} />}
      {capaHoja?.modoId && <HojaModo key={capaHoja.modoId} ctx={ctx} nav={nav} ejeId={capaHoja.modoId} />}
    </div>
  );
}
