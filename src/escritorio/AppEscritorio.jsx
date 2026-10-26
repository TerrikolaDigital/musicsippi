import { useLayoutEffect } from 'react';
import { traducirError } from '../../scripts/lib/traducir-error.mjs';
import { confirmarModos } from '../data/modos.js';
import { colorDeEje, formatearTitulo } from '../ui/formato.js';
import PanelLetras from '../PanelLetras.jsx';
import { Icono } from './compartido.jsx';
import { OnboardingTour, PantallaRevisionModos, ClasificacionAsistida, TarjetaModo, duracionLarga, FotoOIniciales, Reproductor, VistaAlbum, VistaArtista, Buscador, Historial, Administrar, BarraReproductor } from './componentes.jsx';

/**
 * Interfaz de escritorio: el JSX que antes devolvía App() fuera del móvil. Se carga
 * perezosa (React.lazy) para que el móvil no la descargue ni la evalúe. Todo el estado
 * sigue viviendo en App(); llega por `ctx`, igual que ShellMovil.
 */
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
  } = ctx;

  // App() mide la cabecera en un layout effect; con el chunk perezoso el nodo aún no
  // existía en su primer render, así que avisamos al montarnos para que la mida.
  useLayoutEffect(() => {
    ctx.alMontar?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="app">
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
      {/* .app-cabecera agrupa TODO el menú principal (aviso + cabecera +
          pestañas de abajo) en una sola pieza sticky — se encoge sola al
          bajar y vuelve a aparecer al subir (ver aplicarAlturaCabecera más
          arriba), en vez de quedar fija ocupando espacio para siempre.
          Antes .submenu vivía afuera de este contenedor y no era sticky: al
          scrollear se perdía de vista (ver
          docs/superpowers/specs/2026-09-15-shell-scroll-unico-design.md). */}
      <div className="app-cabecera" ref={cabeceraOuterRef}>
      {/* Envoltorio solo para medir el alto real con ResizeObserver — el
          alto que `.app-cabecera` ocupa es el de ESTE div, no el suyo
          propio (el suyo se muta directo por ref, ver aplicarAlturaCabecera
          más arriba). */}
      <div ref={cabeceraInnerRef}>
      {/* Antes el aviso y <header> eran DOS elementos sticky top:0
          independientes y competían por la misma posición al hacer scroll
          (el header terminaba tapando el aviso, o viceversa, según
          z-index). Agrupados acá adentro, ambos se apilan siempre en el
          mismo orden — el sticky real ahora vive en `.app-cabecera`. */}
      <div className="fijo-arriba">
      {/* Único lugar donde vive este aviso — antes estaba duplicado en Home y
          en Configuración por separado. Pedido explícito: es lo bastante
          relevante como para no perderlo de vista al cambiar de pantalla, así
          que vive acá arriba de <header>, visible sin importar `vista`. */}
      {estadoEnriquecimiento?.activo && (
        <p className="aviso-sin-clasificar aviso-app-wide">
          {/* Sin nombrar Deezer/MusicBrainz — pedido explícito: a quien usa la
              app no le dice nada de qué servicio corre por detrás, y encima
              antes no explicaba QUÉ pasa cuando termina (que los modos se
              arman solos) — nadie lo sabía si no preguntaba. */}
          Organizando tu biblioteca: {estadoEnriquecimiento.procesados}/{estadoEnriquecimiento.total} canciones.
          Cuando termine, tus modos se arman solos.
        </p>
      )}
      <header className="cabecera">
        {/* "Musicsippi", no "Modos": Modos es una sección de la app (la home con
            las tarjetas), no el nombre de la app entera. Antes esta palabra
            aparecía como si fuera la marca, en el lugar donde cualquier app
            muestra su nombre/logo. */}
        <button className="titulo" onClick={() => setVista('modos')}>
          <img className="titulo-icono" src="/favicon.png" alt="" aria-hidden="true" />
          {/* Un solo elemento envolviendo "Music"+"sippi": .titulo es flex con
              gap — sin este wrapper, "Music" y el <span> son dos hijos flex
              separados y el gap se metía TAMBIÉN entre las dos mitades del
              nombre, separándolo como si fueran dos palabras. */}
          <span>
            Music<span className="titulo-acento">sippi</span>
          </span>
        </button>
        {/* Antes esto era un botón "🔍 Buscar" que llevaba a la pantalla de
            buscador — la barra real de acá reemplaza al botón: escribir
            arranca la búsqueda directo, sin un paso intermedio, y está
            siempre visible arriba en vez de vivir solo en el Home. */}
        <label className="cabecera-buscador">
          <span className="cabecera-buscador-icono" aria-hidden="true">
            <Icono nombre="buscar" tamano={14} />
          </span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setModoBuscador('texto');
              setVista('buscar');
            }}
            placeholder="Buscá en tu biblioteca…"
          />
        </label>
        {/* Solo ícono, sin texto — pedido explícito para despejar la barra.
            title/aria-label se quedan: son la única forma de saber qué hace
            cada botón sin el label visible. */}
        <nav className="nav-iconos">
          <button
            className={vista === 'historial' ? 'activo' : ''}
            onClick={() => setVista('historial')}
            title="Recientes y más sonados"
            aria-label="Recientes y más sonados"
          >
            <Icono nombre="historial" tamano={18} />
          </button>
          {/*
            Antes "Sin clasificar" y "Editar ejes" eran dos botones sueltos, al
            mismo nivel que "Modos" — es decir, la navegación de alguien que solo
            quiere escuchar música mezclada con la de quien administra la
            biblioteca. Para una app pensada para compartir, eso confunde a
            cualquiera que no sea el dueño. Ahora es una sola entrada, separada
            arquitectónicamente (ver Administrar más abajo), lista para el día
            que esto sea multiusuario sin reescribir la navegación.
          */}
          <button
            className={vista === 'administrar' && tabConfiguracion !== 'ayuda' ? 'activo' : ''}
            onClick={() => {
              // Sin esto, si tabConfiguracion ya estaba en 'ayuda' (el valor
              // inicial, ver más arriba), tocar "Configuración" no cambiaba
              // nada y quedabas viendo Ayuda — el mismo bug para los dos
              // botones. 'modos' es la primera pestaña real de la lista.
              setTabConfiguracion('modos');
              setVista('administrar');
            }}
            title="Configuración"
            aria-label="Configuración"
            data-tour="configuracion"
          >
            <Icono nombre="ajustes" tamano={18} />
          </button>
          <button
            className={vista === 'administrar' && tabConfiguracion === 'ayuda' ? 'activo' : ''}
            onClick={() => {
              setTabConfiguracion('ayuda');
              setVista('administrar');
            }}
            title="Ayuda"
            aria-label="Ayuda"
          >
            <Icono nombre="ayuda" tamano={18} />
          </button>
        </nav>
      </header>
      </div>

      {/*
        Submenú fijo, siempre visible (fuera de cualquier `vista === ...`) —
        pedido explícito: accesos directos con ícono + texto mínimo,
        separados del cuadro de texto de arriba (que ahora es solo para
        buscar, no para navegar). "Listas" reusa exactamente el mismo
        criterio que "Mis listas" del Home (playlists + favoritos) — mismo
        concepto, mismo nombre, pedido explícito de no tener dos términos
        para lo mismo. "Canciones"/"Artistas"/"Explorar" reusan las pestañas
        que antes vivían DENTRO del buscador (ver Buscador más abajo, ya no
        tiene su propia navegación interna).
      */}
      <nav className="submenu" data-tour="modos">
        <button
          className={vista === 'reproductor' && ejeVista?.id === 'favoritos' ? 'activo' : ''}
          onClick={() => {
            if (favoritosEje) entrarAModo(favoritosEje);
          }}
        >
          <Icono nombre="corazon" tamano={16} /> Favoritas
        </button>
        <button
          className={vista === 'buscar' && modoBuscador === 'artistas' ? 'activo' : ''}
          onClick={() => {
            setVista('buscar');
            setModoBuscador('artistas');
          }}
        >
          <Icono nombre="personas" tamano={16} /> Artistas
        </button>
        <button
          className={vista === 'buscar' && modoBuscador === 'listas' ? 'activo' : ''}
          onClick={() => {
            setVista('buscar');
            setModoBuscador('listas');
          }}
        >
          <Icono nombre="lista" tamano={16} /> Listas
        </button>
        <button
          className={vista === 'buscar' && modoBuscador === 'albumes' ? 'activo' : ''}
          onClick={() => {
            setVista('buscar');
            setModoBuscador('albumes');
          }}
        >
          <Icono nombre="disco" tamano={16} /> Álbumes
        </button>
        <button
          className={
            vista === 'buscar' && modoBuscador === 'agregar' ? 'submenu-explorar activo' : 'submenu-explorar'
          }
          onClick={() => {
            setVista('buscar');
            setModoBuscador('agregar');
          }}
          data-tour="explorar"
        >
          <Icono nombre="explorar" tamano={16} /> Explorar
        </button>
      </nav>
      </div>
      </div>

      {/* `.app-contenido` ya no tiene scroll propio — `body` volvió a ser el
          único que scrollea (ver .app-cabecera más arriba y
          docs/superpowers/specs/2026-09-15-shell-scroll-unico-design.md).
          Envuelve el contenido de la vista actual. El nodo del reproductor
          de YouTube ya no está acá: lo monta App() fuera del Suspense. */}
      <div className="app-contenido">

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

          {/*
            Inicio rápido: 4 accesos directos a experiencias frecuentes, no
            una quinta forma de navegar — pedido explícito. "Infinito"
            (sorprenderMe) y "Favoritas" (reproducirFavoritas) arrancan a
            sonar mezclado directo, simétricos entre sí — ninguno de los dos
            solo navega. Los controles de Play/Aleatorio de cada lista/modo
            ya existen adentro de cada uno — esto no los duplica.
          */}
          <section className="inicio-rapido">
            <h2>Inicio rápido</h2>
            <div className="inicio-rapido-grid">
              <button className="inicio-rapido-tile" onClick={reproducirFavoritas}>
                <Icono nombre="corazon" tamano={20} />
                <span>Favoritas</span>
              </button>
              <button className="inicio-rapido-tile" onClick={() => setVista('historial')}>
                <Icono nombre="historial" tamano={20} />
                <span>Recientes</span>
              </button>
              <button className="inicio-rapido-tile" onClick={sorprenderMe} data-tour="infinito">
                <Icono nombre="infinito" tamano={20} />
                <span>Infinito</span>
              </button>
              <button
                className="inicio-rapido-tile"
                onClick={() => {
                  setVista('buscar');
                  setModoBuscador('agregar');
                }}
              >
                <Icono nombre="explorar" tamano={20} />
                <span>Explorar</span>
              </button>
            </div>
          </section>

          {/* Orden de secciones por uso, no arbitrario: lo que se sigue
              escuchando primero (recencia real), después el destacado
              automático, después el resto — misma lógica que se había
              explorado en Lovable ("los modos con más peso primero"). */}
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
              <div className="hero-modo" style={{ '--color-modo': colorDeEje(modoDestacado) }}>
                {(coversDeEje.get(modoDestacado.id) ?? [])[0] && (
                  <img
                    className="hero-modo-blur"
                    src={coversDeEje.get(modoDestacado.id)[0]}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <div className="hero-modo-scrim" aria-hidden="true" />
                <div className="hero-modo-contenido">
                  <div className="hero-modo-collage">
                    {(coversDeEje.get(modoDestacado.id) ?? []).length > 0 ? (
                      coversDeEje.get(modoDestacado.id).map((url, i) => (
                        <img key={i} src={url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ))
                    ) : (
                      <span className="hero-modo-collage-vacio" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <p className="eyebrow">Modo del momento</p>
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
                        ▶ Reproducir modo
                      </button>
                      <button className="hero-modo-ver" onClick={() => entrarAModo(modoDestacado)}>
                        Ver las {conteos.get(modoDestacado.id) ?? 0} canciones
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {previaModoAleatoria && (
            <section className="hero-modo-seccion" aria-label="Vista previa de tus modos">
              <div className="hero-modo hero-modo-preview" style={{ '--color-modo': colorDeEje(previaModoAleatoria) }}>
                <img
                  className="hero-modo-blur"
                  src={coversDeEje.get(previaModoAleatoria.id)[0]}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div className="hero-modo-scrim" aria-hidden="true" />
                <div className="hero-modo-contenido">
                  <div className="hero-modo-collage">
                    {coversDeEje.get(previaModoAleatoria.id).map((url, i) => (
                      <img key={i} src={url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ))}
                  </div>
                  <div>
                    <p className="eyebrow">Muy pronto</p>
                    <h2>Tus sugerencias personalizadas están en camino</h2>
                    <p className="hero-modo-detalle">
                      Estamos organizando tu biblioteca por género y por lo que más escuchás. Cuando termine, acá
                      va a aparecer un modo armado solo con tu música, como este de ejemplo ({formatearTitulo(previaModoAleatoria.nombre)}).
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section>
            <h2>
              Mis listas
              <button className="h2-accion" onClick={crearListaRapida}>
                ＋ Crear lista
              </button>
              {!listasExpandidas && misListasHome.length > 0 && (
                <button className="h2-accion" onClick={() => setListasExpandidas(true)}>
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
                  <button className="h2-accion" onClick={() => setParaEscucharExpandido(true)}>
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
                  <button className="h2-accion" onClick={() => setRedescubrirExpandido(true)}>
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
              Ver todos →
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
          setRepetir={setRepetir}
          aleatorio={aleatorio}
          setAleatorio={alternarAleatorioCola}
          posicion={`${indice + 1} / ${cola.length}`}
          temporizador={temporizador}
          fijarTemporizador={fijarTemporizador}
          onRadio={iniciarRadio}
          onVerLetras={() => setVerLetras(true)}
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
