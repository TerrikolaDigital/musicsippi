// src/movil/bienvenida/BienvenidaMovil.jsx
// Recorrido de bienvenida en 6 pantallas deslizables: qué es Musicsippi, cómo
// se organiza, cómo traer música, qué se puede escuchar, qué te acompaña y por
// dónde empezar. Es una capa de navegación: cada «Siguiente» añade una entrada
// de historial, así «atrás» del sistema retrocede una pantalla (ver navegacion.js).
import { useEffect, useRef } from 'react';
import { IconoM } from '../iconos.jsx';
import { esAndroid } from '../../data/nativo-movil.js';
import { marcarBienvenidaVista } from './estado-bienvenida.js';
import { PASOS, pasoPorGesto, pasoValido } from './bienvenida.js';
import { Contigo, Empieza, Modos, Portada, Sinfin, Traer } from './IlustracionesBienvenida.jsx';

const sinMovimiento = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Accion({ principal, discreta, icono, texto, onClick }) {
  return (
    <button className={`bienv-accion${principal ? ' principal' : ''}${discreta ? ' discreta' : ''}`} onClick={onClick}>
      <IconoM nombre={icono} tamano={22} />
      <span>{texto}</span>
    </button>
  );
}

export default function BienvenidaMovil({ ctx, nav, paso: pasoCapa }) {
  const paso = pasoValido(pasoCapa);
  const pista = useRef(null);
  const gesto = useRef(null);

  // Se marca como vista al abrirse: cualquier forma de cerrarla (botones o
  // «atrás» del sistema) cuenta, y un fallo al guardar no impide cerrarla.
  useEffect(() => {
    marcarBienvenidaVista().catch(() => {});
  }, []);

  const cerrar = () => nav.cerrarCapaTipo('bienvenida', paso);
  const siguiente = () => paso < PASOS && nav.abrirCapa({ tipo: 'bienvenida', paso: paso + 1 });
  const anterior = () => paso > 1 && nav.atras();

  const hayLocales = esAndroid() && !!ctx.importacion?.importarArchivosLocales;
  const abrirAnadir = (extra = {}) => nav.abrirCapa({ tipo: 'hoja', config: 'anadir', ...extra });
  // Cierra la bienvenida (retrocede sus entradas de historial) y, ya asentado el
  // historial, abre Buscar: ahí está Explorar por género, con ▶ para escuchar y + para añadir.
  const explorar = () => {
    window.addEventListener('popstate', () => nav.irAPestana('buscar'), { once: true });
    nav.cerrarCapaTipo('bienvenida', paso);
  };

  // Deslizar: la pista sigue al dedo en cuanto el gesto es claramente horizontal
  // (el vertical sigue siendo scroll) y, al soltar, decide si cambia de pantalla.
  const alPulsar = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesto.current = { x: e.clientX, y: e.clientY, t: performance.now(), arrastra: false };
  };
  const alMover = (e) => {
    const g = gesto.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.arrastra) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      g.arrastra = true;
      pista.current?.classList.add('arrastrando');
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // sin captura el gesto sigue funcionando mientras el dedo esté encima
      }
    }
    if (sinMovimiento()) return;
    const tope = (paso === 1 && dx > 0) || (paso === PASOS && dx < 0);
    pista.current?.style.setProperty('transform', `translateX(calc(${-(paso - 1) * 100}% + ${tope ? dx * 0.25 : dx}px))`);
  };
  const alSoltar = (e) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g?.arrastra) return;
    pista.current?.classList.remove('arrastrando');
    pista.current?.style.removeProperty('transform');
    const cambio = pasoPorGesto({
      dx: e.clientX - g.x,
      dy: e.clientY - g.y,
      ms: performance.now() - g.t,
      ancho: e.currentTarget.clientWidth,
    });
    if (cambio === 1) siguiente();
    else if (cambio === -1) anterior();
  };
  const alTeclear = (e) => {
    if (e.key === 'ArrowRight') siguiente();
    else if (e.key === 'ArrowLeft') anterior();
  };

  const pantallas = [
    {
      ilu: <Portada />,
      titulo: <>Tu música, según <em>cómo te sientes</em></>,
      texto: 'Un rato de calma, una tarde de rock o una fiesta. Dile a Musicsippi cómo estás y suena lo que toca.',
    },
    {
      ilu: <Modos />,
      titulo: <>Tu biblioteca se organiza <em>sola en moods</em></>,
      texto: 'Tranquilo, Con energía, Rock, Hip hop… Cada canción encuentra su sitio sin que muevas nada.',
    },
    {
      ilu: <Traer />,
      titulo: <>Trae tu música <em>de donde esté</em></>,
      texto: 'Explora lo que suena y añádelo con +. O pega el enlace de una playlist, o trae tus mp3.',
    },
    {
      ilu: <Sinfin />,
      titulo: <>Música que <em>no se acaba</em></>,
      texto: 'Infinito sigue solo cuando termina la cola y cada mood tiene su radio. El aleatorio recuerda lo que ya has oído.',
      chips: ['Letras sincronizadas', 'Volumen nivelado', 'Continuación automática'],
    },
    {
      ilu: <Contigo />,
      titulo: <>Tu música <em>te acompaña</em></>,
      texto: 'Dale me gusta desde la pantalla de bloqueo, mira tus estadísticas y tu racha, y sincroniza con tu PC cuando llegues a casa.',
    },
    {
      ilu: <Empieza />,
      titulo: <>¿Por dónde <em>empezamos?</em></>,
      texto: 'Escucha con ▶ y añade con +. Lo demás se puede hacer cuando quieras.',
      acciones: (
        <div className="bienv-acciones">
          <Accion principal icono="modos" texto="Explorar música" onClick={explorar} />
          <Accion discreta icono="compartir" texto="Tengo una playlist" onClick={() => abrirAnadir()} />
          {hayLocales && <Accion discreta icono="disco" texto="Música de mi móvil" onClick={() => abrirAnadir({ locales: true })} />}
        </div>
      ),
    },
  ];

  return (
    <div className="bienvenida" role="dialog" aria-modal="true" aria-label="Bienvenida a Musicsippi" onKeyDown={alTeclear}>
      <span className="bienv-luz a" aria-hidden="true" />
      <span className="bienv-luz b" aria-hidden="true" />
      <div className="bienv-barra">
        {paso > 1 ? (
          <button className="bienv-texto" onClick={anterior}>
            <IconoM nombre="atras" tamano={20} />
            Atrás
          </button>
        ) : (
          <span />
        )}
        <button className="bienv-texto" onClick={cerrar}>
          Saltar
        </button>
      </div>
      <div className="bienv-vista" onPointerDown={alPulsar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}>
        <div className="bienv-pista" ref={pista} style={{ '--paso': paso - 1 }}>
          {pantallas.map((p, i) => (
            <section
              key={i}
              className={`bienv-pantalla${i + 1 === paso ? ' activa' : ''}`}
              aria-roledescription="pantalla"
              aria-label={`${i + 1} de ${PASOS}`}
              inert={i + 1 !== paso}
            >
              <div className="bienv-ilu">{p.ilu}</div>
              <div className="bienv-bloque">
                <h2 className="m-titulo bienv-titulo">{p.titulo}</h2>
                <p className="bienv-frase">{p.texto}</p>
                {p.chips && (
                  <ul className="bienv-chips">
                    {p.chips.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
                {p.acciones}
              </div>
            </section>
          ))}
        </div>
      </div>
      <div className="bienv-pie">
        <p className="bienv-puntos" role="img" aria-label={`Pantalla ${paso} de ${PASOS}`}>
          {Array.from({ length: PASOS }, (_, i) => (
            <span key={i} className={i + 1 === paso ? 'activo' : ''} />
          ))}
        </p>
        {paso < PASOS && (
          <button className="m-boton-grad" onClick={siguiente}>
            Siguiente
          </button>
        )}
      </div>
    </div>
  );
}
