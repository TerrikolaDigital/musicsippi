import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { traducirError } from '../../scripts/lib/traducir-error.mjs';
import { confirmarModos } from '../data/modos.js';
import { colorDeEje, formatearTitulo } from '../ui/formato.js';
import PanelLetras from '../PanelLetras.jsx';
import { Icono } from './compartido.jsx';
import { OnboardingTour, PantallaRevisionModos, ClasificacionAsistida, TarjetaModo, duracionLarga, FotoOIniciales, Reproductor, VistaAlbum, VistaArtista, Buscador, Historial, Administrar, BarraReproductor } from './componentes.jsx';
import { IconoC } from './iconosCorriente.jsx';
import { TuSemana, Estadisticas } from './ResumenEstadisticas.jsx';
import Corriente from '../movil/Corriente.jsx';
import { saludo } from '../movil/formato.js';
import './corriente.css';

// Destinos de la orilla, en el orden de la maqueta. `sep` = hueco entre grupos.
const DESTINOS_ORILLA = [
  { id: 'inicio', texto: 'Inicio', icono: 'inicio' },
  { id: 'favoritas', texto: 'Favoritas', icono: 'corazon' },
  { id: 'artistas', texto: 'Artistas', icono: 'artista' },
  { id: 'listas', texto: 'Listas', icono: 'lista' },
  { id: 'albumes', texto: 'Álbumes', icono: 'disco' },
  { id: 'explorar', texto: 'Explorar', icono: 'explorar', tour: 'explorar' },
  { sep: 'sep1' },
  { id: 'recientes', texto: 'Recientes', icono: 'reloj' },
  { id: 'semana', texto: 'Tu semana', icono: 'semana' },
  { id: 'estadisticas', texto: 'Estadísticas', icono: 'barras' },
  { id: 'configuracion', texto: 'Configuración', icono: 'ajustes', tour: 'configuracion' },
  { id: 'ayuda', texto: 'Ayuda', icono: 'ayuda' },
];

/**
 * Interfaz de escritorio: el JSX que antes devolvía App() fuera del móvil. Se carga
 * perezosa (React.lazy) para que el móvil no la descargue ni la evalúe. Todo el estado
 * sigue viviendo en App(); llega por `ctx`, igual que ShellMovil.
 */
// Dos portadas inclinadas del hero (−7° y 9°). Sin portadas, dos placas del color
// del modo para que el hero no quede vacío.
function HeroPortadas({ covers }) {
  const dos = [covers[1] ?? null, covers[0] ?? null];
  return (
    <div className="hero-modo-portadas" aria-hidden="true">
      {dos.map((url, i) =>
        url ? (
          <img key={i} src={url} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        ) : (
          <span key={i} className="hero-modo-portada-vacia" />
        )
      )}
    </div>
  );
}

export default function AppEscritorio({ ctx }) {
  const {
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
    alternarRepetir,
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
  } = ctx;

  // Qué destino de la orilla está activo: mismos criterios que tenían antes los
  // botones de la cabecera y del submenú.
  const destinoActivo =
    vista === 'modos'
      ? 'inicio'
      : vista === 'reproductor' && ejeVista?.id === 'favoritos'
        ? 'favoritas'
        : vista === 'buscar' && modoBuscador === 'artistas'
          ? 'artistas'
          : vista === 'buscar' && modoBuscador === 'listas'
            ? 'listas'
            : vista === 'buscar' && modoBuscador === 'albumes'
              ? 'albumes'
              : vista === 'buscar' && modoBuscador === 'agregar'
                ? 'explorar'
                : vista === 'historial'
                  ? 'recientes'
                  : vista === 'semana'
                    ? 'semana'
                    : vista === 'estadisticas'
                      ? 'estadisticas'
                  : vista === 'administrar'
                    ? tabConfiguracion === 'ayuda'
                      ? 'ayuda'
                      : tabConfiguracion === 'movil'
                        ? null // lo marca el botón «Sincronizar con el móvil»
                        : 'configuracion'
                    : null;

  function irA(destino) {
    if (destino === 'inicio') setVista('modos');
    else if (destino === 'favoritas') {
      if (favoritosEje) entrarAModo(favoritosEje);
    } else if (destino === 'artistas' || destino === 'listas' || destino === 'albumes') {
      setVista('buscar');
      setModoBuscador(destino);
    } else if (destino === 'explorar') {
      setVista('buscar');
      setModoBuscador('agregar');
    } else if (destino === 'recientes') setVista('historial');
    else if (destino === 'semana') setVista('semana');
    else if (destino === 'estadisticas') setVista('estadisticas');
    else if (destino === 'configuracion') {
      // 'modos' es la primera pestaña real: si tabConfiguracion quedó en 'ayuda',
      // sin esto «Configuración» seguiría mostrando Ayuda.
      setTabConfiguracion('modos');
      setVista('administrar');
    } else if (destino === 'ayuda') {
      setTabConfiguracion('ayuda');
      setVista('administrar');
    }
  }

  // Última vez que el móvil bajó la biblioteca de este PC (/api/estado-sync-movil,
  // ver vite.config.js). undefined = consultando; null = nunca / sin servidor.
  const [ultimaSync, setUltimaSync] = useState(undefined);
  useEffect(() => {
    let vivo = true;
    const leer = () =>
      fetch('/api/estado-sync-movil')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('sin estado'))))
        .then((j) => vivo && setUltimaSync(j.ultima ?? null))
        .catch(() => vivo && setUltimaSync((u) => (u === undefined ? null : u)));
    leer();
    const t = setInterval(leer, 15000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);
  const textoUltimaSync =
    ultimaSync === undefined
      ? 'Consultando…'
      : ultimaSync
        ? `Última sincronización: ${new Date(ultimaSync).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
        : 'Todavía sin sincronizar';
  function irASincronizar() {
    setTabConfiguracion('movil');
    setVista('administrar');
  }

  const cauceRef = useRef(null);
  const navRef = useRef(null);
  const indRef = useRef(null);
  const buscadorRef = useRef(null);

  // Indicador activo de la orilla: se desliza con transform hasta el botón activo
  // (260 ms --ease-mover, ver .orilla-ind). Sin destino activo se desvanece.
  useLayoutEffect(() => {
    const ind = indRef.current;
    const boton = navRef.current?.querySelector(`[data-destino="${destinoActivo}"]`);
    if (!ind) return;
    if (!boton) {
      ind.style.opacity = '0';
      return;
    }
    ind.style.transform = `translateY(${boton.offsetTop}px)`;
    ind.style.opacity = '1';
  }, [destinoActivo]);

  // Al cambiar de pantalla el cauce vuelve arriba (antes lo hacía solo el body).
  useLayoutEffect(() => {
    if (cauceRef.current) cauceRef.current.scrollTop = 0;
  }, [vista, modoBuscador, ejeVista?.id, album, artista, tabConfiguracion]);

  // Ctrl K (o Cmd K) lleva al buscador de la orilla.
  useEffect(() => {
    function alTeclear(e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        buscadorRef.current?.focus();
        buscadorRef.current?.select();
      }
    }
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  return <div className="app app-escritorio">
      {mostrarOnboarding && (
        <OnboardingTour onCerrar={cerrarOnboarding} esDemo={esDemo} onIrADestino={irADestinoTour} />
      )}
      {revisionModos && (
        <PantallaRevisionModos
          modosIniciales={revisionModos.modosCandidatos ?? []}
          transversalesDisponibles={revisionModos.transversalesDisponibles ?? []}
          masaMinima={revisionModos.masaMinima ?? 0}
          onConfirmar={(payload) => {
            // No se limpia `revisionModos` hasta que confirmarModos resuelve
            // bien: si falla (red caída, payload rechazado), la pantalla se
            // queda para que la persona pueda reintentar en vez de perder en
            // silencio los modos que ya había editado.
            confirmarModos(payload)
              .then(() => setRevisionModos(null))
              .catch((e) => window.alert(`No se pudo confirmar: ${traducirError(e)}`));
          }}
          onCancelar={() => setRevisionModos(null)}
        />
      )}
      {clasificacionAsistida && (
        <ClasificacionAsistida
          tracks={tracks}
          ejes={ejes}
          metadataDe={metadataDe}
          onAsignar={asignarManual}
          onCrearEje={crearEje}
          onCerrar={() => setClasificacionAsistida(false)}
          sonandoPrincipal={sonando}
          onPausarPrincipal={pausar}
        />
      )}
      {/* Orilla: barra lateral fija con la marca, el buscador y TODA la navegación
          (antes cabecera + submenú + iconos sueltos). Los onClick y el criterio de
          «activo» son los mismos de antes, uno a uno. Ver
          docs/maquetas/escritorio-v4-corriente.md (decisión 1). */}
      {/* Electron oculta la barra de título nativa: franja de arrastre arriba del
          cauce (en el navegador no hace falta y no se dibuja). */}
      {typeof window !== 'undefined' && window.musicsippi && <div className="arrastre-ventana" aria-hidden="true" />}
      <aside className="orilla">
        <button className="marca" onClick={() => setVista('modos')} aria-label="Musicsippi, ir a Inicio">
          <span className="marca-insignia" aria-hidden="true">
            <IconoC nombre="ondas" tamano={18} />
          </span>
          <span>
            Music<i>sippi</i>
          </span>
        </button>
        {/* Escribir arranca la búsqueda directo (igual que antes en la cabecera). */}
        <label className="orilla-buscador">
          <IconoC nombre="buscar" tamano={17} />
          <input
            ref={buscadorRef}
            type="search"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setModoBuscador('texto');
              setVista('buscar');
            }}
            placeholder="Buscar"
            aria-label="Buscá en tu biblioteca"
          />
          <kbd aria-hidden="true">Ctrl K</kbd>
        </label>
        <nav className="orilla-nav" ref={navRef} aria-label="Navegación principal" data-tour="modos">
          <span className="orilla-ind" ref={indRef} aria-hidden="true" />
          {DESTINOS_ORILLA.map((d) =>
            d.sep ? (
              <span key={d.sep} className="orilla-sep" aria-hidden="true" />
            ) : (
              <button
                key={d.id}
                className={destinoActivo === d.id ? 'activo' : ''}
                aria-current={destinoActivo === d.id ? 'page' : undefined}
                data-destino={d.id}
                data-tour={d.tour}
                onClick={() => irA(d.id)}
              >
                <IconoC nombre={d.icono} tamano={20} />
                <span>{d.texto}</span>
              </button>
            )
          )}
        </nav>
        <button
          className={`orilla-sync${vista === 'administrar' && tabConfiguracion === 'movil' ? ' activo' : ''}`}
          onClick={irASincronizar}
          aria-current={vista === 'administrar' && tabConfiguracion === 'movil' ? 'page' : undefined}
          title="Abrir la sincronización con el móvil"
        >
          <IconoC nombre="movil" tamano={20} />
          <span className="orilla-sync-texto">
            <b>Sincronizar con el móvil</b>
            <small>{textoUltimaSync}</small>
          </span>
        </button>
      </aside>

      {/* Cauce: el único lugar que scrollea (la orilla queda fija). Reserva al
          final el alto de la barra del reproductor, que flota encima. */}
      <div className="cauce" ref={cauceRef}>
      {/* Único lugar donde vive este aviso: visible sin importar `vista`. Sin
          nombrar servicios de terceros (pedido explícito). */}
      {estadoEnriquecimiento?.activo && (
        <p className="aviso-sin-clasificar aviso-app-wide">
          Organizando tu biblioteca: {estadoEnriquecimiento.procesados}/{estadoEnriquecimiento.total} canciones.
          Cuando termine, tus modos se arman solos.
        </p>
      )}
      {/* Discreto, no bloqueante — mismo espíritu que avisoSalto: una franja
          arriba del contenido, nunca un modal encima de todo. Solo aparece si
          `npm run importar` (fuera del navegador) dejó el flag; desaparece
          sola apenas se acepta o se descarta, no vuelve a insistir sola. */}
      {avisoModosNuevos && !revisionModos && (
        <p className="banner-modos-nuevos">
          {avisoModosNuevos.cantidad}{' '}
          {avisoModosNuevos.cantidad === 1
            ? 'canción no entra en ninguno de tus modos'
            : 'canciones no entran en ninguno de tus modos'}
          , ¿te propongo uno?
          <button className="banner-modos-nuevos-aceptar" onClick={aceptarAvisoModosNuevos}>
            Revisar
          </button>
          <button
            className="banner-modos-nuevos-cerrar"
            onClick={descartarAvisoModosNuevos}
            aria-label="Descartar aviso"
          >
            ×
          </button>
        </p>
      )}

      {vista === 'modos' && (
        <main className="modos modos-layout">
        <div className="modos-principal">
          {/* Excepción al criterio de "nunca en Home" que sigue el resto de
              los avisos pasivos de esta app (ver aviso-sin-clasificar,
              banner-modos-nuevos) — acá el destinatario es alguien que recién
              abrió la app por primera vez y no tiene motivo para haber entrado
              a Configuración todavía. Reusa las mismas clases de
              banner-modos-nuevos, mismo lenguaje visual. */}
          {mostrarAvisoImportar && (
            <p className="banner-modos-nuevos">
              Estás escuchando canciones de ejemplo. Importá tu propia música cuando quieras.
              <button className="banner-modos-nuevos-aceptar" onClick={irAImportarMusica}>
                Importar mi música
              </button>
            </p>
          )}

          {/* v4: saludo en Fraunces y una línea de contexto (como el móvil). */}
          <header className="inicio-saludo">
            <h1 className="titulo-pantalla">{saludo()}</h1>
            <p>
              Tenés {tracks.length.toLocaleString('es-AR')} {tracks.length === 1 ? 'canción' : 'canciones'} de{' '}
              {artistasBiblioteca.length.toLocaleString('es-AR')} {artistasBiblioteca.length === 1 ? 'artista' : 'artistas'}.
            </p>
          </header>

          {/*
            Inicio rápido: 4 accesos directos a experiencias frecuentes, no
            una quinta forma de navegar — pedido explícito. "Infinito"
            (sorprenderMe) y "Favoritas" (reproducirFavoritas) arrancan a
            sonar mezclado directo, simétricos entre sí — ninguno de los dos
            solo navega. v4: formato «acceso» del móvil (icono de 42 px en
            degradado + título + una línea).
          */}
          <section className="inicio-rapido" aria-label="Inicio rápido">
            <div className="inicio-rapido-grid">
              <button className="inicio-rapido-tile" onClick={reproducirFavoritas}>
                <span className="acceso-ico acceso-fav" aria-hidden="true">
                  <IconoC nombre="corazon" tamano={20} relleno />
                </span>
                <span className="acceso-txt">
                  <b>Favoritas</b>
                  <small>
                    {favoritosEje
                      ? `${conteos.get(favoritosEje.id) ?? 0} ${(conteos.get(favoritosEje.id) ?? 0) === 1 ? 'canción' : 'canciones'}`
                      : 'Las que te gustan'}
                  </small>
                </span>
              </button>
              <button className="inicio-rapido-tile" onClick={() => setVista('historial')}>
                <span className="acceso-ico acceso-rec" aria-hidden="true">
                  <IconoC nombre="reloj" tamano={20} />
                </span>
                <span className="acceso-txt">
                  <b>Recientes</b>
                  <small>Lo último que sonó</small>
                </span>
              </button>
              <button className="inicio-rapido-tile" onClick={() => setVista('semana')}>
                <span className="acceso-ico acceso-sem" aria-hidden="true">
                  <IconoC nombre="semana" tamano={20} />
                </span>
                <span className="acceso-txt">
                  <b>Tu semana</b>
                  <small>Tu resumen</small>
                </span>
              </button>
              <button className="inicio-rapido-tile" onClick={() => irA('configuracion')}>
                <span className="acceso-ico acceso-mood" aria-hidden="true">
                  <IconoC nombre="moods" tamano={20} />
                </span>
                <span className="acceso-txt">
                  <b>Moods</b>
                  <small>Tus modos y listas</small>
                </span>
              </button>
              <button className="inicio-rapido-tile" onClick={sorprenderMe} data-tour="infinito">
                <span className="acceso-ico acceso-inf" aria-hidden="true">
                  <IconoC nombre="infinito" tamano={20} />
                </span>
                <span className="acceso-txt">
                  <b>Infinito</b>
                  <small>Sin parar</small>
                </span>
              </button>
              <button
                className="inicio-rapido-tile"
                onClick={() => {
                  setVista('buscar');
                  setModoBuscador('agregar');
                }}
              >
                <span className="acceso-ico acceso-exp" aria-hidden="true">
                  <IconoC nombre="explorar" tamano={20} />
                </span>
                <span className="acceso-txt">
                  <b>Explorar</b>
                  <small>Música nueva</small>
                </span>
              </button>
            </div>
          </section>

          {/* Orden de secciones por uso, no arbitrario: lo que se sigue
              escuchando primero (recencia real), después el destacado
              automático, después el resto (decisión 1 de la aprobación v4:
              en escritorio se mantiene este orden). */}
          {seguidos.length > 0 && (
            <section>
              <h2>Seguí escuchando</h2>
              <div className="fila-tarjetas">
                {seguidos.map((eje) => (
                  <TarjetaModo
                    key={eje.id}
                    eje={eje}
                    total={conteos.get(eje.id) ?? 0}
                    duracionMs={duracionesTotales.get(eje.id) ?? 0}
                    subEjes={[]}
                    conteos={conteos}
                    onEntrar={entrarAModo}
                    onReproducir={(e) => reproducirModo(e, tracksDe(e.id), null, aleatorio)}
                    onOcultar={ocultarModo}
                    covers={coversDeEje.get(eje.id) ?? []}
                  />
                ))}
              </div>
            </section>
          )}

          {modoDestacado && (
            <section className="hero-modo-seccion" aria-label="Modo destacado">
              <div className="hero-modo" style={{ '--c': colorDeEje(modoDestacado) }}>
                <Corriente className="hero-modo-agua" ancho={900} alto={150} />
                <HeroPortadas covers={coversDeEje.get(modoDestacado.id) ?? []} />
                <p className="hero-modo-rotulo">
                  <span className="hero-modo-punto" aria-hidden="true" />
                  Modo del momento
                </p>
                <h2>{formatearTitulo(modoDestacado.nombre)}</h2>
                <p className="hero-modo-detalle">
                  {conteos.get(modoDestacado.id) ?? 0} canciones
                  {duracionLarga(duracionesTotales.get(modoDestacado.id) ?? 0) &&
                    ` · ${duracionLarga(duracionesTotales.get(modoDestacado.id) ?? 0)}`}
                </p>
                <div className="hero-modo-botones">
                  <button
                    className="hero-modo-reproducir"
                    onClick={() => alternarAleatorioYReproducir(modoDestacado, tracksDe(modoDestacado.id))}
                  >
                    <IconoC nombre="play" tamano={22} relleno />
                    Reproducir modo
                  </button>
                  <button className="hero-modo-ver" onClick={() => entrarAModo(modoDestacado)}>
                    Ver las {conteos.get(modoDestacado.id) ?? 0} canciones
                  </button>
                </div>
              </div>
            </section>
          )}

          {previaModoAleatoria && (
            <section className="hero-modo-seccion" aria-label="Vista previa de tus modos">
              <div className="hero-modo hero-modo-preview" style={{ '--c': colorDeEje(previaModoAleatoria) }}>
                <Corriente className="hero-modo-agua" ancho={900} alto={150} />
                <HeroPortadas covers={coversDeEje.get(previaModoAleatoria.id) ?? []} />
                <p className="hero-modo-rotulo">
                  <span className="hero-modo-punto" aria-hidden="true" />
                  Muy pronto
                </p>
                <h2>Tus sugerencias personalizadas están en camino</h2>
                <p className="hero-modo-detalle">
                  Estamos organizando tu biblioteca por género y por lo que más escuchás. Cuando termine, acá
                  va a aparecer un modo armado solo con tu música, como este de ejemplo ({formatearTitulo(previaModoAleatoria.nombre)}).
                </p>
              </div>
            </section>
          )}

          <section>
            <h2>
              Mis listas
              <button className="h2-accion" onClick={crearListaRapida}>
                <IconoC nombre="anadir" tamano={16} /> Crear lista
              </button>
              {!listasExpandidas && misListasHome.length > 0 && (
                <button className="h2-accion h2-ver" onClick={() => setListasExpandidas(true)}>
                  Ver todas ({misListasHome.length})
                </button>
              )}
            </h2>
            <div
              className={
                listasExpandidas ? 'fila-tarjetas expandida' : 'fila-tarjetas fila-tarjetas-listas'
              }
            >
              {misListasHome.map((eje) => (
                <TarjetaModo
                  key={eje.id}
                  eje={eje}
                  total={conteos.get(eje.id) ?? 0}
                  duracionMs={duracionesTotales.get(eje.id) ?? 0}
                  subEjes={[]}
                  conteos={conteos}
                  onEntrar={entrarAModo}
                  onReproducir={(e) => reproducirModo(e, tracksDe(e.id), null, aleatorio)}
                  onOcultar={ocultarModo}
                  covers={coversDeEje.get(eje.id) ?? []}
                />
              ))}
            </div>
          </section>

          {/* Antes vivía en el sidebar como lista de texto plano — con eso
              casi no se usaba (pedido explícito: reemplazar por otra cosa
              acá). Son ejes reales (mismo shape que "De fondo"/"Redescubrí"),
              así que reusa TarjetaModo tal cual para quedar visualmente al
              nivel del resto de la columna principal. */}
          {paraEscuchar.length > 0 && (
            <section>
              <h2>
                Para escuchar
                {seguidas.length > 0 && <small>incluye playlists que seguís, no armadas por vos</small>}
                {!paraEscucharExpandido && paraEscuchar.length > 0 && (
                  <button className="h2-accion h2-ver" onClick={() => setParaEscucharExpandido(true)}>
                    Ver todas ({paraEscuchar.length})
                  </button>
                )}
              </h2>
              <div className={paraEscucharExpandido ? 'fila-tarjetas expandida' : 'fila-tarjetas'}>
                {paraEscuchar.map((eje) => (
                  <TarjetaModo
                    key={eje.id}
                    eje={eje}
                    total={conteos.get(eje.id) ?? 0}
                    duracionMs={duracionesTotales.get(eje.id) ?? 0}
                    subEjes={[]}
                    conteos={conteos}
                    onEntrar={entrarAModo}
                    onReproducir={(e) => reproducirModo(e, tracksDe(e.id), null, aleatorio)}
                    onOcultar={ocultarModo}
                    covers={coversDeEje.get(eje.id) ?? []}
                  />
                ))}
              </div>
            </section>
          )}

          {casiNoEscuchas.length > 0 && (
            <section>
              <h2>
                Redescubrí <small>lo tenés en tu biblioteca pero casi no lo escuchás</small>
                {!redescubrirExpandido && casiNoEscuchas.length > 0 && (
                  <button className="h2-accion h2-ver" onClick={() => setRedescubrirExpandido(true)}>
                    Ver todas ({casiNoEscuchas.length})
                  </button>
                )}
              </h2>
              <div className={redescubrirExpandido ? 'fila-tarjetas expandida' : 'fila-tarjetas'}>
                {casiNoEscuchas.map((eje) => (
                  <TarjetaModo
                    key={eje.id}
                    eje={eje}
                    total={conteos.get(eje.id) ?? 0}
                    duracionMs={duracionesTotales.get(eje.id) ?? 0}
                    subEjes={[]}
                    conteos={conteos}
                    onEntrar={entrarAModo}
                    onReproducir={(e) => reproducirModo(e, tracksDe(e.id), null, aleatorio)}
                    onOcultar={ocultarModo}
                    covers={coversDeEje.get(eje.id) ?? []}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="modos-lateral">
          <h2>
            Por artistas
            <button
              className="h2-accion"
              onClick={() => {
                setModoBuscador('artistas');
                setVista('buscar');
              }}
            >
              Ver todos
            </button>
            <small>
              {tracks.length} canciones · {artistasBiblioteca.length} artistas
            </small>
          </h2>
          <ul className="lateral-lista lateral-lista-artistas">
            {topArtistas.map((a) => {
              const foto = fotoDeArtista(a.nombre);
              return (
                <li key={a.nombre}>
                  <button className="lateral-item" onClick={() => abrirArtista(a.nombre)}>
                    <FotoOIniciales
                      foto={foto}
                      nombre={a.nombre}
                      className="lateral-item-cover lateral-item-cover-redonda"
                      claseVacia="lateral-item-avatar"
                    />
                    <span className="lateral-item-texto">
                      <span className="lateral-item-nombre">{formatearTitulo(a.nombre)}</span>
                      <span className="lateral-item-total">
                        {a.cantidad} canciones
                        {albumesPorArtista.get(a.nombre.toLowerCase()) > 0 &&
                          ` · ${albumesPorArtista.get(a.nombre.toLowerCase())} álbumes`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {topArtistas.length === 0 && (
              <p className="ayuda">
                Todavía no hay artistas para mostrar. En cuanto importes tu música vas a ver acá a los que más
                escuchás.
              </p>
            )}
          </ul>
        </aside>
        </main>
      )}

      {vista === 'reproductor' && (
        <Reproductor
          ejeVista={ejeVista}
          ejeActivo={ejeActivo}
          tracksVista={tracksVista}
          artistasSolos={artistasSolos}
          cola={cola}
          indice={indice}
          setIndice={setIndice}
          estadoResolucion={estadoResolucion}
          avisoSalto={avisoSalto}
          metadataDe={metadataDe}
          aleatorio={aleatorio}
          setAleatorio={setAleatorio}
          onQuitar={quitarDeCola}
          onMoverAPosicion={moverACola}
          onAgregar={agregarACola}
          onReproducirDesdeVista={reproducirModo}
          ejes={ejes}
          tracks={tracks}
          onAlternarColeccion={alternarColeccion}
          onVolver={() => setVista('modos')}
          onAgregarExterno={agregarTrackExterno}
          onGuardarOverride={guardarOverride}
          onAsignarModo={asignarManual}
          onQuitarModo={quitarModo}
          onAbrirAlbum={abrirAlbum}
          onAbrirArtista={abrirArtista}
          onQuitarTrack={quitarTrackSuelto}
        />
      )}

      {vista === 'album' && (
        <VistaAlbum
          album={album}
          ejes={ejes}
          tracks={tracks}
          favoritos={favoritos}
          onVolver={volverAtras}
          onReproducir={reproducirAlbum}
          onAgregarAlbum={agregarAlbum}
          onAlternarColeccion={alternarColeccion}
          onAlternarFavoritoAlbum={alternarFavoritoAlbum}
          onAgregarTrackSuelto={agregarTrackSuelto}
          onQuitarTrack={quitarTrackSuelto}
          onAbrirArtista={abrirArtista}
          onAbrirAlbum={abrirAlbum}
          trackActualId={trackActual?.id ?? null}
        />
      )}

      {vista === 'artista' && (
        <VistaArtista
          artista={artista}
          ejes={ejes}
          tracks={tracks}
          artistasBiblioteca={artistasBiblioteca}
          artistasSolos={artistasSolos}
          metadataDe={metadataDe}
          favoritos={favoritos}
          onVolver={volverAtras}
          onAbrirAlbum={abrirAlbum}
          onAbrirArtista={abrirArtista}
          onReproducir={reproducirCancionesArtista}
          onReproducirDeBiblioteca={reproducirSinNavegar}
          onAlternarColeccion={alternarColeccion}
          onAlternarFavoritoArtista={alternarFavoritoArtista}
          onAgregarTrackSuelto={agregarTrackSuelto}
          onQuitarTrack={quitarTrackSuelto}
          trackActualId={trackActual?.id ?? null}
        />
      )}

      {vista === 'buscar' && (
        <Buscador
          tracks={tracksVisibles}
          ejes={ejes}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          modo={modoBuscador}
          setModo={setModoBuscador}
          artistas={artistasBiblioteca}
          metadataDe={metadataDe}
          listas={playlistsOrdenadas}
          albumes={albumesBiblioteca}
          conteos={conteos}
          duracionesTotales={duracionesTotales}
          coversDeEje={coversDeEje}
          artistasDeEje={artistasDeEje}
          onEntrar={entrarAModo}
          onReproducirModo={(eje) => reproducirModo(eje, tracksDe(eje.id), null, aleatorio)}
          onReproducir={reproducirLista}
          onAgregar={agregarACola}
          onAlternarColeccion={alternarColeccion}
          onAgregarExterno={agregarTrackExterno}
          onAsignar={asignarManual}
          onGuardarOverride={guardarOverride}
          onQuitarModo={quitarModo}
          onAbrirAlbum={abrirAlbum}
          onAbrirArtista={abrirArtista}
          onQuitarTrack={quitarTrackSuelto}
          trackActualId={trackActual?.id ?? null}
          fotoDeArtista={fotoDeArtista}
        />
      )}

      {vista === 'historial' && (
        <Historial
          historial={historial}
          tracks={tracksVisibles}
          ejes={ejes}
          metadataDe={metadataDe}
          onReproducir={reproducirLista}
          onAgregar={agregarACola}
          onAlternarColeccion={alternarColeccion}
          onAsignarModo={asignarManual}
          onQuitarModo={quitarModo}
          onAbrirArtista={abrirArtista}
          onAbrirAlbum={abrirAlbum}
          onEntrarModo={entrarAModo}
          onAgregarSuelto={agregarTrackSuelto}
          trackActualId={trackActual ? (trackActual.trackIdReal ?? trackActual.id) : null}
        />
      )}

      {vista === 'semana' && (
        <TuSemana ctx={ctx} onIrAEstadisticas={() => setVista('estadisticas')} onIrABuscar={() => setVista('buscar')} />
      )}

      {vista === 'estadisticas' && (
        <Estadisticas ctx={ctx} onIrASemana={() => setVista('semana')} onIrABuscar={() => setVista('buscar')} />
      )}

      {vista === 'administrar' && (
        <Administrar
          ejes={ejes}
          conteos={conteos}
          pendientesDeClasificar={pendientesDeClasificar}
          onClasificarAsistida={() => setClasificacionAsistida(true)}
          onGuardarEjes={guardarEjes}
          onCrearEje={crearEje}
          onEntrarAModo={entrarAModo}
          onVolver={() => setVista('modos')}
          onImportarTuneMyMusic={importarTuneMyMusic}
          onImportarMusicaLocal={importarMusicaLocal}
          onVerOnboarding={() => setMostrarOnboarding(true)}
          tab={tabConfiguracion}
          onCambiarTab={setTabConfiguracion}
          onIrABuscar={() => setVista('buscar')}
          onIrAExplorar={() => {
            setVista('buscar');
            setModoBuscador('agregar');
          }}
          onIrAInicio={() => setVista('modos')}
          estadoEnriquecimiento={estadoEnriquecimiento}
        />
      )}

      </div>

      {avisoSincronizacion && (
        <div className="aviso-sincronizacion" role="status" onClick={() => avisoSincronizacion.fase === 'error' && setAvisoSincronizacion(null)}>
          {avisoSincronizacion.fase === 'sincronizando' && `Sincronizando con el PC (${avisoSincronizacion.direccion})…`}
          {avisoSincronizacion.fase === 'listo' &&
            `Sincronizado: ${avisoSincronizacion.canciones} canciones y ${avisoSincronizacion.modos} modos${avisoSincronizacion.subidos ? ` (${avisoSincronizacion.subidos} cambios del móvil enviados al PC)` : ""}.`}
          {avisoSincronizacion.fase === 'error' && `No se pudo sincronizar: ${avisoSincronizacion.mensaje} (tocar para cerrar)`}
        </div>
      )}

      {verLetras && trackActual && (
        <PanelLetras
          track={trackActual}
          album={metadataDe(trackActual.trackIdReal ?? trackActual.id)?.album ?? null}
          duracion={duracion}
          tiempo={tiempo}
          buscar={buscar}
          onCerrar={cerrarLetras}
        />
      )}

      {trackActual && (
        <BarraReproductor
          track={trackActual}
          ejesTrack={ejesDelTrackActual}
          ejes={ejes}
          sonando={sonando}
          tiempo={tiempo}
          duracion={duracion}
          buscar={buscar}
          reiniciar={reiniciar}
          alternarPausa={alternarPausa}
          volumen={volumen}
          cambiarVolumen={cambiarVolumen}
          alternarSilencio={alternarSilencio}
          anterior={() => setIndice((i) => Math.max(0, i - 1))}
          siguiente={siguiente}
          repetir={repetir}
          alternarRepetir={alternarRepetir}
          aleatorio={aleatorio}
          setAleatorio={alternarAleatorioCola}
          posicion={`${indice + 1} / ${cola.length}`}
          temporizador={temporizador}
          fijarTemporizador={fijarTemporizador}
          onRadio={iniciarRadio}
          onVerLetras={() => setVerLetras(true)}
          modoOrigen={ejeActivo}
          metadata={{
            ...metadataDe(trackActual.trackIdReal ?? trackActual.id),
            // Fallback al coverUrl que trae el track "de mentira" armado por
            // reproducirAlbum/reproducirCancionesArtista (ver ahí) para lo que
            // todavía no tiene metadata propia por no estar en la biblioteca.
            coverUrl:
              metadataDe(trackActual.trackIdReal ?? trackActual.id).coverUrl ?? trackActual.coverUrl ?? null,
          }}
          favorito={ejesDelTrackActual.some((e) => e.ejeId === 'favoritos')}
          onFavorito={alternarFavorito}
          cola={cola}
          indice={indice}
          setIndice={setIndice}
          onQuitarDeCola={quitarDeCola}
          onMoverAPosicion={moverACola}
          onAbrirCola={() => {
            // Si quedó "mirando" otra lista distinta de la que suena
            // (buscaste algo, entraste a un modo, lo que sea) sin llegar a
            // reproducirla, ejeVista quedaba con esa lista vieja — clickear
            // el reproductor mostraba esa lista en vez de la cola real que
            // está sonando. Limpiarlo acá garantiza volver siempre a lo que
            // efectivamente se está escuchando, mismo criterio que ya usa
            // cargarCola() al reproducir desde el buscador.
            setEjeVista(null);
            setVista('reproductor');
          }}
          onGuardarOverride={guardarOverride}
          onAbrirAlbum={abrirAlbum}
          onAbrirArtista={abrirArtista}
          onQuitarTrack={quitarTrackSuelto}
          onAgregarExterno={agregarTrackExterno}
        />
      )}
    </div>;
}
