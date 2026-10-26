// src/movil/inicio/CarruselPortadas.jsx
// Título de sección + carrusel de canciones de tu biblioteca con ▶ (Hace tiempo que no escuchas,
// Joyas escondidas). Tocar una empieza la lista desde ella.
import { IconoM } from '../iconos.jsx';
import { PortadaImg } from '../PortadaGenerada.jsx';
import { portadaDe } from '../MiniReproductor.jsx';
import { formatearTitulo } from '../../ui/formato.js';

export default function CarruselPortadas({ ctx, titulo, etiqueta, canciones }) {
  return (
    <>
      <div className="m-seccion">
        <h2>{titulo}</h2>
      </div>
      <div className="inicio-carrusel">
        {canciones.map((t) => (
          <button
            key={t.id}
            className="inicio-olvidada"
            aria-label={`Reproducir ${formatearTitulo(t.titulo)}, ${formatearTitulo(t.artista)}`}
            onClick={() => ctx.reproducirLista(t, canciones, etiqueta)}
          >
            <span className="inicio-olvidada-img">
              <PortadaImg src={portadaDe(ctx, t)} texto={t.titulo ?? ''} loading="lazy" />
              <span className="inicio-olvidada-play" aria-hidden="true">
                <IconoM nombre="play" tamano={20} />
              </span>
            </span>
            <b>{formatearTitulo(t.titulo)}</b>
            <small>{formatearTitulo(t.artista)}</small>
          </button>
        ))}
      </div>
    </>
  );
}
