// src/movil/ReproductorCompleto.jsx
// Reproductor a pantalla completa (capa 'reproductor'): portada, letra o cola
// según `vista`. Se cierra deslizando hacia abajo o con «atrás». El audio no
// se toca aquí: solo se llama a las acciones de `ctx`.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconoM } from './iconos.jsx';
import OlaProgreso from './OlaProgreso.jsx';
import FilaCancion from './FilaCancion.jsx';
import PanelLetras from '../PanelLetras.jsx';
import ChipTemporizador from './ChipTemporizador.jsx';
import { portadaDe } from './MiniReproductor.jsx';
import { PortadaImg, PortadaCruce } from './PortadaGenerada.jsx';
import { useCruce } from './useCruce.js';
import { textoPortada } from './portadaGenerada.js';
import { usePaleta } from './usePaleta.js';
import { veloReproductor } from './veloRep.js';
import { useArrastreCerrar } from './useArrastreCerrar.js';
import { tramoVisible, TRAMO } from './tramos.js';
import { destinoArrastre, desplazamientoFila } from './reordenar.js';
import { albumDe, primerArtista } from './albumLocal.js';
import { formatearTitulo, reloj } from '../ui/formato.js';
import { textoEstadoResolucion } from './formato.js';
import { abrirSelectorSalida, esAndroid } from '../data/nativo-movil.js';
import { obtenerLetras, lineaActual } from '../data/letras.js';
import { useDesfaseLetra } from '../data/useDesfaseLetra.js';

const YA_SONARON = 10;

// Hueco bajo la portada: la línea de la letra que suena (toca → letra completa) y la
// siguiente canción (toca → cola). Sin letra sincronizada solo se ve «A continuación».
function AvancePortada({ ctx, track, album, onLetra, onCola }) {
  const [letra, setLetra] = useState(null);
  useEffect(() => {
    let vigente = true;
    setLetra(null);
    obtenerLetras({ artista: track.artista, titulo: track.titulo, album, duracionS: ctx.duracion })
      .then((r) => vigente && setLetra(r?.sincronizada?.length ? r.sincronizada : null))
      .catch(() => {});
    return () => {
      vigente = false;
    };
    // la duración llega tarde; con artista+título basta para no repetir la petición
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);
  const [desfase] = useDesfaseLetra(track);
  const i = letra ? lineaActual(letra, ctx.tiempo + 0.3 - desfase) : -1;
  const linea = letra ? (letra[i]?.texto || letra[i + 1]?.texto || '♪') : null;
  const sig = ctx.cola[ctx.indice + 1];
  const metaSig = sig ? ctx.metadataDe(sig.trackIdReal ?? sig.id) : null;
  return (
    <div className="rep-avance">
      {linea && (
        <button type="button" className="rep-avance-letra" onClick={onLetra} aria-label="Ver la letra completa">
          <span key={i}>{linea}</span>
          <IconoM nombre="atras" />
        </button>
      )}
      {sig && (
        <button type="button" className="rep-avance-sig" onClick={onCola} aria-label="Ver la cola">
          <PortadaImg src={portadaDe(ctx, sig)} texto={textoPortada(sig, metaSig)} claseSin="rep-avance-sin" />
          <span className="rep-avance-txt">
            <small>A continuación</small>
            <b>{formatearTitulo(sig.titulo)}</b>
            <small>{formatearTitulo(sig.artista)}</small>
          </span>
          <IconoM nombre="cola" />
        </button>
      )}
    </div>
  );
}

function VistaCola({ ctx }) {
  const [mostrados, setMostrados] = useState(TRAMO);
  const [verPasadas, setVerPasadas] = useState(false);
  const tituloCola = useRef(null);
  // Al abrir la cola se baja a la canción actual, no a las que ya sonaron.
  useEffect(() => {
    tituloCola.current?.scrollIntoView({ block: 'start' });
  }, []);
  const restantes = ctx.cola.length - ctx.indice;
  const hasta = ctx.indice + tramoVisible(restantes, mostrados, false);
  // Reordenar arrastrando el asa ≡ (solo las que vienen después de la actual).
  // El dedo mueve la fila sin tocar la cola; al soltar se llama a moverACola una vez.
  const [arrastre, setArrastre] = useState(null); // { origen, dy, destino }
  const gesto = useRef(null); // { y0, scroll0, alto, caja }
  const asaDe = (i) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const caja = e.currentTarget.closest('.rep-cola');
      gesto.current = { y0: e.clientY, scroll0: caja.scrollTop, alto: e.currentTarget.closest('.fila-cancion').offsetHeight, caja };
      setArrastre({ origen: i, dy: 0, destino: i });
    },
    onPointerMove: (e) => {
      const g = gesto.current;
      if (!g) return;
      // Cerca del borde de la lista, ésta se desplaza para poder llegar más lejos.
      const r = g.caja.getBoundingClientRect();
      if (e.clientY < r.top + 48) g.caja.scrollTop -= 12;
      else if (e.clientY > r.bottom - 48) g.caja.scrollTop += 12;
      const dy = e.clientY - g.y0 + (g.caja.scrollTop - g.scroll0);
      setArrastre({ origen: i, dy, destino: destinoArrastre({ origen: i, dy, alto: g.alto, min: ctx.indice + 1, max: hasta - 1 }) });
    },
    onPointerUp: () => {
      const a = arrastre;
      gesto.current = null;
      setArrastre(null);
      if (a && a.destino !== a.origen) ctx.moverACola(a.origen, a.destino);
    },
    onPointerCancel: () => {
      gesto.current = null;
      setArrastre(null);
    },
  });
  // Las que ya sonaron (como mucho YA_SONARON), atenuadas: tocar una vuelve a ella.
  const desde = Math.max(0, ctx.indice - YA_SONARON);
  const pasadas = [];
  for (let i = desde; i < ctx.indice; i++) {
    const t = ctx.cola[i];
    pasadas.push(
      <FilaCancion
        key={`p${i}-${t.id}`}
        track={t}
        meta={ctx.metadataDe(t.trackIdReal ?? t.id)}
        onTocar={() => ctx.setIndice(i)}
        onMas={() => ctx.quitarDeCola(i)}
        iconoMas="cerrar"
        etiquetaMas="Quitar de la cola"
      />,
    );
  }
  const alto = gesto.current?.alto ?? 0;
  const estiloFila = (i) => {
    if (!arrastre) return undefined;
    if (i === arrastre.origen) return { transform: `translateY(${arrastre.dy}px)` };
    const d = desplazamientoFila({ i, origen: arrastre.origen, destino: arrastre.destino, alto });
    return d ? { transform: `translateY(${d}px)` } : undefined;
  };
  const filas = [];
  const esAuto = (i) => ctx.colaAuto?.has(ctx.cola[i]?.id);
  for (let i = ctx.indice + 1; i < hasta; i++) {
    const t = ctx.cola[i];
    // Las que añade la app al acabar la cola van tras un separador propio.
    if (esAuto(i) && (i === ctx.indice + 1 || !esAuto(i - 1))) {
      filas.push(<h2 key={`auto${i}`} className="rep-cola-titulo rep-cola-auto">Reproducción automática</h2>);
    }
    filas.push(
      <FilaCancion
        key={`${i}-${t.id}`}
        track={t}
        meta={ctx.metadataDe(t.trackIdReal ?? t.id)}
        onTocar={() => ctx.setIndice(i)}
        onMas={() => ctx.quitarDeCola(i)}
        iconoMas="cerrar"
        etiquetaMas="Quitar de la cola"
        asa={asaDe(i)}
        arrastrando={arrastre?.origen === i}
        estilo={estiloFila(i)}
      />,
    );
  }
  const actual = ctx.cola[ctx.indice];
  return (
    <div className="rep-cola">
      {pasadas.length > 0 && (
        <>
          <button
            type="button"
            className="rep-cola-plegar"
            aria-expanded={verPasadas}
            onClick={() => setVerPasadas((v) => !v)}
          >
            Ya sonaron · {pasadas.length}
          </button>
          {verPasadas && <div className="rep-cola-pasadas">{pasadas}</div>}
        </>
      )}
      <h2 className="rep-cola-titulo" ref={tituloCola}>Reproduciendo</h2>
      {actual && (
        <FilaCancion
          track={actual}
          meta={ctx.metadataDe(actual.trackIdReal ?? actual.id)}
          activa
          pausada={!ctx.sonando}
          onTocar={() => ctx.alternarPausa()}
          onMas={() => ctx.quitarDeCola(ctx.indice)}
          iconoMas="cerrar"
          etiquetaMas="Quitar de la cola"
        />
      )}
      {filas.length > 0 && !esAuto(ctx.indice + 1) && <h2 className="rep-cola-titulo">A continuación</h2>}
      {filas}
      {hasta < ctx.cola.length && (
        <button className="rep-cola-mas" onClick={() => setMostrados((m) => tramoVisible(restantes, m, true))}>
          Mostrar más
        </button>
      )}
    </div>
  );
}

// Cabecera compacta de las vistas cola y letra (en vez de la portada grande).
function CabeceraCompacta({ ctx, nav, track, portada, texto, esFav }) {
  return (
    <div className="rep-compacta">
      <PortadaImg className="rep-compacta-img" src={portada} texto={texto} claseSin="rep-compacta-img" />
      <div className="rep-compacta-txt">
        <b>{formatearTitulo(track.titulo)}</b>
        <button type="button" onClick={() => nav.abrir({ tipo: 'artista', nombre: track.artista })}>
          {formatearTitulo(track.artista)}
        </button>
      </div>
      <button
        type="button"
        className={`rep-icono${esFav ? ' on' : ''}`}
        aria-label={esFav ? 'Quitar de favoritas' : 'Añadir a favoritas'}
        aria-pressed={esFav}
        onClick={() => ctx.alternarFavorito(track.id, !esFav)}
      >
        <IconoM nombre="corazon" />
      </button>
      <button
        type="button"
        className="rep-icono"
        aria-label="Más opciones de la canción"
        onClick={() => nav.abrirCapa({ tipo: 'hoja', trackId: track.id })}
      >
        <IconoM nombre="puntos" />
      </button>
    </div>
  );
}

const quietoPedido = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const EASE_CAJON = 'cubic-bezier(0.32, 0.72, 0, 1)';
const EASE_SALIDA = 'cubic-bezier(0.23, 1, 0.32, 1)';

// Clip-path con la forma del mini-reproductor (el reproductor ocupa toda la ventana).
function recorteDeMini(mini, el) {
  const m = mini.getBoundingClientRect();
  const w = el.clientWidth;
  const h = el.clientHeight;
  return `inset(${m.top}px ${w - m.right}px ${h - m.bottom}px ${m.left}px round 20px)`;
}

// `saliendo`: la capa ya no está en la navegación pero el ShellMovil la mantiene
// montada 280 ms para que se cierre animada (ver ShellMovil).
export default function ReproductorCompleto({ ctx, nav, vista, saliendo = false }) {
  const t = ctx.trackActual;
  const raiz = useRef(null);
  // Cerrado con el dedo: baja deslizándose; con el botón «⌄» o «atrás»: se recoge en el mini.
  const [cierreAbajo, setCierreAbajo] = useState(false);
  const { dy, arrastrando, asa } = useArrastreCerrar(() => {
    setCierreAbajo(true);
    nav.atras();
  });
  // Mientras se arrastra el control de progreso se mueve en local y la
  // búsqueda se hace una sola vez, al soltar.
  const [pos, setPos] = useState(null);
  const gestoPortada = useRef(null);
  const [desplazamientoPortada, setDesplazamientoPortada] = useState(0);
  // El track de la cola es una copia: sus modos al día están en ctx.tracks.
  const vivo = useMemo(() => (t ? (ctx.tracks.find((x) => x.id === t.id) ?? t) : null), [ctx.tracks, t]);
  const portada = t ? portadaDe(ctx, t) : null;
  const textoSin = t ? textoPortada(t, ctx.metadataDe(t.trackIdReal ?? t.id)) : '';
  const { t1, t2, lum } = usePaleta(portada, textoSin);
  const velo = veloReproductor(lum);
  const capas = useCruce(portada);

  // Apertura desde el mini (440 ms): el panel crece con clip-path y la portada viaja
  // del mini a su sitio (FLIP); el resto de piezas entra con un fundido corto.
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el?.animate) return;
    if (quietoPedido()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' });
      return;
    }
    const mini = document.querySelector('.mini-rep');
    if (!mini) {
      el.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 440, easing: EASE_CAJON });
      return;
    }
    el.animate(
      [{ clipPath: recorteDeMini(mini, el) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
      { duration: 440, easing: EASE_CAJON },
    );
    const grande = el.querySelector('.rep-portada');
    const chica = mini.querySelector('img, .portada-gen, .mini-rep-sin');
    if (grande && chica) {
      const g = grande.getBoundingClientRect();
      const c = chica.getBoundingClientRect();
      const esc = c.width / g.width;
      grande.style.transformOrigin = '0 0';
      grande.animate(
        [
          { transform: `translate(${c.left - g.left}px, ${c.top - g.top}px) scale(${esc})`, borderRadius: `${10 / esc}px` },
          { transform: 'none', borderRadius: '0px' },
        ],
        { duration: 440, easing: EASE_CAJON },
      );
    }
    el.querySelectorAll('.rep-cab, .rep-info, .rep-progreso, .rep-ctrl, .rep-pie').forEach((hijo, i) =>
      hijo.animate(
        [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, delay: 140 + i * 40, easing: EASE_SALIDA, fill: 'backwards' },
      ),
    );
  }, []);

  // Cierre (280 ms) hacia el mini; el cierre con el dedo lo hace la clase .saliendo-abajo.
  // Si se reabre durante la salida, el cleanup cancela la animación (fill: forwards).
  useEffect(() => {
    const el = raiz.current;
    if (!saliendo || !el?.animate) return undefined;
    const mini = document.querySelector('.mini-rep');
    let anim = null;
    if (quietoPedido()) {
      anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
    } else if (!cierreAbajo && mini) {
      anim = el.animate(
        [
          { clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 },
          { clipPath: recorteDeMini(mini, el), opacity: 0.4 },
        ],
        { duration: 280, easing: EASE_SALIDA, fill: 'forwards' },
      );
    }
    return () => anim?.cancel();
  }, [saliendo, cierreAbajo]);

  if (!t) return null;

  const estado = textoEstadoResolucion(ctx.estadoResolucion, ctx.modoLocal);
  const esFav = !!vivo?.ejes?.some((e) => e.ejeId === 'favoritos');
  const meta = ctx.metadataDe(t.trackIdReal ?? t.id);
  const tiempo = pos ?? ctx.tiempo;
  const max = ctx.duracion > 0 ? ctx.duracion : 0;
  const pct = max > 0 ? Math.min(100, (tiempo / max) * 100) : 0;
  // Tocar la vista activa vuelve a la portada. Cambiar de vista no apila nada.
  const cambiarVista = (v) => nav.cambiarCapa({ tipo: 'reproductor', vista: vista === v ? 'portada' : v });
  const compacta = vista === 'letra' || vista === 'cola';
  const soltar = () => {
    if (pos != null) ctx.buscar(pos);
    setPos(null);
  };
  const gestoDePortada = {
    onPointerDown: (e) => {
      gestoPortada.current = { x: e.clientX, y: e.clientY, t: performance.now(), ancho: e.currentTarget.clientWidth };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => {
      const g = gestoPortada.current;
      if (!g) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.abs(dx) > Math.abs(dy) * 1.25) setDesplazamientoPortada(Math.max(-g.ancho * 0.35, Math.min(g.ancho * 0.35, dx)));
    },
    onPointerUp: (e) => {
      const g = gestoPortada.current;
      gestoPortada.current = null;
      if (!g) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      const rapido = Math.abs(dx) > 90 && performance.now() - g.t < 260;
      if (Math.abs(dx) > Math.abs(dy) * 1.25 && (Math.abs(dx) >= g.ancho * 0.25 || rapido)) {
        if (dx < 0) ctx.siguiente(); else ctx.anterior();
      }
      setDesplazamientoPortada(0);
    },
    onPointerCancel: () => { gestoPortada.current = null; setDesplazamientoPortada(0); },
  };

  return (
    <div
      ref={raiz}
      className={`rep-completo${saliendo ? ' saliendo' : ''}${saliendo && cierreAbajo ? ' saliendo-abajo' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Reproductor"
      style={{
        '--rep-t1': t1,
        '--rep-t2': t2,
        '--rep-velo-medio': velo.medio,
        '--rep-velo-fin': velo.fin,
        '--rep-mascara': velo.mascara,
        transform: dy ? `translateY(${dy}px)` : undefined,
        transition: arrastrando ? 'none' : undefined,
      }}
    >
      {/* Fondo: la propia carátula muy difuminada (sin carátula queda el tinte de la paleta). */}
      {capas.length > 0 && (
        <div className="rep-fondo" aria-hidden="true">
          {capas.map((c) => (
            <div key={c.k} className="rep-fondo-img cruce-capa" style={{ backgroundImage: `url("${c.url}")` }} />
          ))}
        </div>
      )}
      <div className="rep-cab" {...asa}>
        {/* Fuera del gesto de arrastre: si no, la captura del puntero se traga el toque. */}
        <button
          type="button"
          className="rep-cerrar"
          aria-label="Cerrar reproductor"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={nav.atras}
        >
          <IconoM nombre="abajo" />
        </button>
        <span className="rep-tirador" aria-hidden="true" />
        <p className="rep-desde">Sonando desde · {formatearTitulo(ctx.ejeActivo?.nombre ?? 'tu biblioteca')}</p>
      </div>

      {compacta && (
        <CabeceraCompacta
          ctx={ctx}
          nav={nav}
          track={t}
          portada={portada}
          texto={textoSin}
          esFav={esFav}
        />
      )}
      <div className="rep-centro">
        {vista === 'letra' && (
          <PanelLetras
            incrustado
            track={t}
            album={meta?.album}
            duracion={ctx.duracion}
            tiempo={ctx.tiempo}
            buscar={ctx.buscar}
            onCerrar={() => cambiarVista('letra')}
          />
        )}
        {vista === 'cola' && <VistaCola ctx={ctx} />}
        {vista !== 'letra' &&
          vista !== 'cola' &&
          <div className="rep-portada-gesto" {...gestoDePortada} style={{ '--desplazamiento-portada': `${desplazamientoPortada}px` }}>
            <PortadaCruce className="rep-portada" capas={capas} texto={textoSin} />
          </div>}
        {vista !== 'letra' && vista !== 'cola' && (
          <AvancePortada
            ctx={ctx}
            track={t}
            album={meta?.album}
            onLetra={() => cambiarVista('letra')}
            onCola={() => cambiarVista('cola')}
          />
        )}
      </div>

      {!compacta && (
      <div className="rep-info">
        <div className="rep-info-txt">
          <b key={`t-${t.id}`} className="cruce-texto">{formatearTitulo(t.titulo)}</b>
          <button
            key={`a-${t.id}`}
            type="button"
            className="rep-artista cruce-texto"
            onClick={() => nav.abrir({ tipo: 'artista', nombre: t.artista })}
          >
            {formatearTitulo(t.artista)}
          </button>
          {albumDe(t, meta) && (
            <button
              key={`al-${t.id}`}
              type="button"
              className="rep-artista rep-album cruce-texto"
              aria-label={`Ir al álbum ${formatearTitulo(albumDe(t, meta))}`}
              onClick={() => nav.abrir({ tipo: 'album', artista: primerArtista(t.artista), titulo: albumDe(t, meta) })}
            >
              {formatearTitulo(albumDe(t, meta))}
            </button>
          )}
          <ChipTemporizador temporizador={ctx.temporizador} onTocar={() => nav.abrirCapa({ tipo: 'hoja', config: 'sueno' })} />
          {ctx.anadirActual?.externa && (
            <button
              type="button"
              className={`rep-anadir${ctx.anadirActual.estado === 'ok' ? ' ok' : ''}`}
              aria-busy={ctx.anadirActual.estado === 'cargando'}
              disabled={ctx.anadirActual.estado === 'ok'}
              onClick={() => ctx.anadirActual.anadir()}
            >
              <IconoM nombre={ctx.anadirActual.estado === 'ok' ? 'check' : 'mas'} tamano={18} />
              {ctx.anadirActual.estado === 'ok' ? 'En tu biblioteca' : ctx.anadirActual.estado === 'error' ? 'Reintentar' : 'Añadir'}
            </button>
          )}
          {estado && <span className="rep-estado" role="status">{estado}</span>}
        </div>
        <button
          className={`rep-icono${esFav || ctx.anadirActual?.favorita ? ' on' : ''}`}
          aria-label={esFav || ctx.anadirActual?.favorita ? 'Quitar de favoritas' : 'Añadir a favoritas'}
          aria-pressed={esFav || !!ctx.anadirActual?.favorita}
          onClick={() => (ctx.anadirActual?.externa ? ctx.anadirActual.anadir({ favorita: true }) : ctx.alternarFavorito(t.id, !esFav))}
        >
          <IconoM nombre="corazon" />
        </button>
        <button
          className="rep-icono"
          aria-label="Más opciones de la canción"
          onClick={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
        >
          <IconoM nombre="puntos" />
        </button>
      </div>
      )}

      <div className="rep-progreso">
        <OlaProgreso variante="grande" progreso={max > 0 ? tiempo / max : 0} pausado={!ctx.sonando}>
        <input
          type="range"
          aria-label="Progreso de la canción"
          min={0}
          max={max || 1}
          step={0.5}
          value={Math.min(tiempo, max || 1)}
          disabled={!max}
          style={{ '--p': `${pct}%` }}
          onChange={(e) => setPos(Number(e.target.value))}
          onPointerUp={soltar}
          onKeyUp={soltar}
          onBlur={soltar}
        />
        </OlaProgreso>
        <div className="rep-tiempos">
          <span>{reloj(tiempo)}</span>
          <span>-{reloj(Math.max(0, ctx.duracion - tiempo))}</span>
        </div>
      </div>

      <div className="rep-ctrl">
        <button aria-label="Anterior" onClick={ctx.anterior}>
          <IconoM nombre="anterior" tamano={30} />
        </button>
        <button className="rep-ctrl-play" aria-label={ctx.sonando ? 'Pausar' : 'Reproducir'} onClick={ctx.alternarPausa}>
          <IconoM nombre={ctx.sonando ? 'pausa' : 'play'} tamano={30} />
        </button>
        <button aria-label="Siguiente" onClick={ctx.siguiente}>
          <IconoM nombre="siguiente" tamano={30} />
        </button>
      </div>

      <div className="rep-pie">
        <button
          className={`rep-icono${vista === 'letra' ? ' on' : ''}`}
          aria-label="Letra"
          aria-pressed={vista === 'letra'}
          onClick={() => cambiarVista('letra')}
        >
          <IconoM nombre="letra" />
        </button>
        <div className="rep-grupo">
          <button
            className={ctx.aleatorio ? 'on' : ''}
            aria-label="Aleatorio"
            aria-pressed={ctx.aleatorio}
            onClick={ctx.alternarAleatorioCola}
          >
            <IconoM nombre="aleatorio" />
          </button>
          <button
            className={ctx.repetir ? 'on' : ''}
            aria-label="Repetir"
            aria-pressed={ctx.repetir}
            onClick={() => ctx.setRepetir((r) => !r)}
          >
            <IconoM nombre="repetir" />
          </button>
          <button aria-label="Radio desde esta canción" onClick={ctx.iniciarRadio}>
            <IconoM nombre="radio" />
          </button>
        </div>
        {esAndroid() && (
          <button
            className="rep-icono"
            aria-label="Elegir dónde suena (dispositivos)"
            onClick={() => abrirSelectorSalida()}
          >
            <IconoM nombre="dispositivos" />
          </button>
        )}
        <button
          className={`rep-icono${vista === 'cola' ? ' on' : ''}`}
          aria-label="Cola"
          aria-pressed={vista === 'cola'}
          onClick={() => cambiarVista('cola')}
        >
          <IconoM nombre="cola" />
        </button>
      </div>
    </div>
  );
}
