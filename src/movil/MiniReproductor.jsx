// src/movil/MiniReproductor.jsx
// Mini-reproductor flotante sobre la barra inferior. Tocarlo abre el
// reproductor completo; los botones no lo abren (stopPropagation).
import { useRef } from 'react';
import { IconoM } from './iconos.jsx';
import { formatearTitulo } from '../ui/formato.js';
import OlaProgreso from './OlaProgreso.jsx';
import { PortadaCruce } from './PortadaGenerada.jsx';
import { useCruce } from './useCruce.js';
import { textoPortada } from './portadaGenerada.js';
import { usePaleta } from './usePaleta.js';
import { veloMini } from './veloRep.js';
import ChipTemporizador from './ChipTemporizador.jsx';
import { textoEstadoResolucion } from './formato.js';
import { origenSonando, complementoSegundaLinea } from './origen.js';
import { direccionDeslizar } from './gestos.js';

export function portadaDe(ctx, track) {
  if (!track) return null;
  const meta = ctx.metadataDe(track.trackIdReal ?? track.id);
  const url = meta?.coverUrl ?? track.coverUrl ?? null;
  return typeof url === 'string' && url.startsWith('http') ? url : null;
}

export default function MiniReproductor({ ctx, onAbrir, onTemporizador }) {
  const gesto = useRef(null);
  const pulsacion = useRef(null);
  const abrirAlClick = useRef(false);
  const t = ctx.trackActual;
  const portada = t ? portadaDe(ctx, t) : null;
  const texto = t ? textoPortada(t, ctx.metadataDe(t.trackIdReal ?? t.id)) : '';
  const { t1, lum } = usePaleta(portada, texto);
  const capas = useCruce(portada);
  if (!t) return null;
  // Solo los fallos: «Buscando…» dura un instante y haría parpadear la fila.
  const fallo = ctx.estadoResolucion === 'buscando' ? null : textoEstadoResolucion(ctx.estadoResolucion, ctx.modoLocal);
  const desde = origenSonando(ctx.ejeActivo);
  const complemento = complementoSegundaLinea({ artista: t.artista, origen: desde, album: ctx.metadataDe(t.trackIdReal ?? t.id)?.album });
  const pct = ctx.duracion > 0 ? Math.min(100, (ctx.tiempo / ctx.duracion) * 100) : 0;
  const cancelarPulsacion = () => {
    if (pulsacion.current) clearTimeout(pulsacion.current);
    pulsacion.current = null;
  };
  const gestos = {
    onPointerDown: (e) => {
      // También se puede empezar a deslizar encima de ▶/⏭ (su zona táctil es grande): el toque
      // solo les llega a ellos si no hay deslizamiento; la captura se hace al empezar a moverse.
      const enBoton = !!e.target.closest('button');
      gesto.current = { x: e.clientX, y: e.clientY, ancho: e.currentTarget.clientWidth, largo: false, enBoton, id: e.pointerId };
      if (enBoton) return;
      // Con el puntero capturado el deslizamiento llega entero aunque el dedo salga del mini.
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura también funciona */ }
      pulsacion.current = setTimeout(() => {
        if (gesto.current && !gesto.current.largo) {
          gesto.current.largo = true;
          onAbrir('cola');
        }
      }, 550);
    },
    onPointerMove: (e) => {
      const g = gesto.current;
      if (!g) return;
      if (Math.abs(e.clientX - g.x) > 10 || Math.abs(e.clientY - g.y) > 10) cancelarPulsacion();
      if (g.enBoton && !g.capturado && Math.abs(e.clientX - g.x) > 10) {
        g.capturado = true;
        try { e.currentTarget.setPointerCapture(g.id); } catch { /* sin captura también funciona */ }
      }
    },
    onPointerUp: (e) => {
      const g = gesto.current;
      cancelarPulsacion();
      gesto.current = null;
      if (!g || g.largo) return;
      const dir = direccionDeslizar({ dx: e.clientX - g.x, dy: e.clientY - g.y, ancho: g.ancho });
      if (dir < 0) ctx.siguiente();
      else if (dir > 0) ctx.anterior();
      // Se abre en el click, no aquí: si el reproductor completo apareciera ya, el click que el
      // navegador genera tras soltar caería en su botón de pausa (debajo del dedo) y pausaría.
      else if (!g.enBoton) abrirAlClick.current = true;
    },
    onPointerCancel: () => { cancelarPulsacion(); gesto.current = null; },
  };
  return (
    <div
      className="mini-rep"
      role="button"
      tabIndex={0}
      aria-label={desde ? `Abrir reproductor, sonando desde ${desde}` : 'Abrir reproductor'}
      style={{ '--mini-tinte': t1, '--mini-velo': veloMini(lum) }}
      {...gestos}
      onClick={(e) => {
        if (e.detail !== 0 && !abrirAlClick.current) return;
        abrirAlClick.current = false;
        onAbrir();
      }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAbrir()}
    >
      {/* fondo: la carátula difuminada, como en el reproductor completo */}
      <span className="mini-rep-fondo" aria-hidden="true">
        {capas.map((c) => (
          <span key={c.k} className="cruce-capa" style={{ backgroundImage: `url("${c.url}")` }} />
        ))}
      </span>
      <PortadaCruce className="mini-rep-portada" capas={capas} texto={texto} />
      <div className="mini-rep-txt">
        <b key={`t-${t.id}`} className="cruce-texto">{formatearTitulo(t.titulo)}</b>
        {fallo ? (
          <small className="mini-rep-fallo">{fallo}</small>
        ) : (
          <small key={`a-${t.id}`} className="cruce-texto">
            {formatearTitulo(t.artista)}
            {complemento && <i className="mini-rep-desde"> · {complemento}</i>}
          </small>
        )}
      </div>
      <ChipTemporizador temporizador={ctx.temporizador} corto onTocar={onTemporizador} />
      {ctx.anadirActual?.externa && (
        <button
          className={`mini-rep-anadir${ctx.anadirActual.estado === 'ok' ? ' ok' : ''}`}
          aria-label={ctx.anadirActual.estado === 'ok' ? 'Ya está en tu biblioteca' : 'Añadir a tu biblioteca'}
          aria-busy={ctx.anadirActual.estado === 'cargando'}
          disabled={ctx.anadirActual.estado === 'ok'}
          onClick={(e) => {
            e.stopPropagation();
            ctx.anadirActual.anadir();
          }}
        >
          <IconoM nombre={ctx.anadirActual.estado === 'ok' ? 'check' : 'mas'} />
        </button>
      )}
      <button
        aria-label={ctx.sonando ? 'Pausar' : 'Reproducir'}
        onClick={(e) => {
          e.stopPropagation();
          ctx.alternarPausa();
        }}
      >
        <IconoM nombre={ctx.sonando ? 'pausa' : 'play'} />
      </button>
      <button
        aria-label="Siguiente"
        onClick={(e) => {
          e.stopPropagation();
          ctx.siguiente();
        }}
      >
        <IconoM nombre="siguiente" />
      </button>
      <div className="mini-rep-prog">
        <OlaProgreso variante="barra" progreso={pct / 100} pausado={!ctx.sonando} />
      </div>
    </div>
  );
}
