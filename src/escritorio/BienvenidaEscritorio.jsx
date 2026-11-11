// src/escritorio/BienvenidaEscritorio.jsx
// Bienvenida de escritorio con la línea visual de la del móvil (BienvenidaMovil.jsx): las mismas 6 pantallas,
// ilustraciones animadas, luces y puntos, centradas en una columna. Reutiliza las ilustraciones y el CSS del móvil.
// Sin historial del sistema: los pasos viven en un estado local; flechas del teclado y Escape también navegan.
import { useEffect, useRef, useState } from 'react';
import { IconoC } from './iconosCorriente.jsx';
import { PASOS } from '../movil/bienvenida/bienvenida.js';
import { Contigo, Empieza, Modos, Portada, Sinfin, Traer } from '../movil/bienvenida/IlustracionesBienvenida.jsx';
import '../movil/bienvenida/bienvenida.css';

function Accion({ principal, discreta, icono, texto, onClick }) {
  return (
    <button className={`bienv-accion${principal ? ' principal' : ''}${discreta ? ' discreta' : ''}`} onClick={onClick}>
      <IconoC nombre={icono} tamano={22} />
      <span>{texto}</span>
    </button>
  );
}

export default function BienvenidaEscritorio({ onCerrar, onIrADestino }) {
  const [paso, setPaso] = useState(1);
  const raiz = useRef(null);
  useEffect(() => {
    raiz.current?.focus();
    document.body.classList.add('tour-abierto'); // apaga las zonas de arrastre de la ventana de Electron
    return () => document.body.classList.remove('tour-abierto');
  }, []);

  const siguiente = () => setPaso((p) => Math.min(PASOS, p + 1));
  const anterior = () => setPaso((p) => Math.max(1, p - 1));
  const ir = (destino) => {
    onCerrar();
    onIrADestino(destino);
  };
  const alTeclear = (e) => {
    if (e.key === 'ArrowRight') siguiente();
    else if (e.key === 'ArrowLeft') anterior();
    else if (e.key === 'Escape') onCerrar();
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
      texto: 'Explora lo que suena y añádelo con +. O carga tus playlists de Spotify, YouTube Music o Deezer, o tus mp3.',
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
      texto: 'Mira tus estadísticas y tu racha, y sincroniza con tu móvil por WiFi cuando quieras llevarla contigo.',
    },
    {
      ilu: <Empieza />,
      titulo: <>¿Por dónde <em>empezamos?</em></>,
      texto: 'Escucha con ▶ y añade con +. Lo demás se puede hacer cuando quieras.',
      acciones: (
        <div className="bienv-acciones">
          <Accion principal icono="cargar" texto="Cargar mi biblioteca" onClick={() => ir('cargar')} />
          <Accion discreta icono="explorar" texto="Explorar música" onClick={() => ir('modos')} />
        </div>
      ),
    },
  ];

  return (
    <div ref={raiz} tabIndex={-1} className="bienvenida bienv-escritorio" role="dialog" aria-modal="true" aria-label="Bienvenida a Musicsippi" onKeyDown={alTeclear}>
      <span className="bienv-luz a" aria-hidden="true" />
      <span className="bienv-luz b" aria-hidden="true" />
      <div className="bienv-barra">
        {paso > 1 ? (
          <button className="bienv-texto" onClick={anterior}>
            Atrás
          </button>
        ) : (
          <span />
        )}
        <button className="bienv-texto" onClick={onCerrar}>
          Saltar
        </button>
      </div>
      <div className="bienv-vista">
        <div className="bienv-pista" style={{ '--paso': paso - 1 }}>
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
