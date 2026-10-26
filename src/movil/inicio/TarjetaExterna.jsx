// src/movil/inicio/TarjetaExterna.jsx
// Tarjeta cuadrada de una canción de fuera: ▶ para escucharla sin añadirla y «＋» para guardarla.
import { useRef } from 'react';
import { IconoM } from '../iconos.jsx';
import { crearPulsacionLarga } from '../pulsacionFila.js';
import { PortadaImg } from '../PortadaGenerada.jsx';
import { formatearTitulo } from '../../ui/formato.js';

export default function TarjetaExterna({ cancion, activa, estadoPlay, estadoAdd, onPlay, onAdd, onMenu }) {
  const listo = estadoAdd === 'ok';
  // Pulsación larga en la tarjeta (no en sus botones): menú con «No me gusta».
  const alLarga = useRef(onMenu);
  alLarga.current = onMenu;
  const pulsacion = useRef(null);
  if (!pulsacion.current) pulsacion.current = crearPulsacionLarga({ alDisparar: () => alLarga.current?.() });
  const pl = pulsacion.current;
  return (
    <div
      className={`ext-tarjeta${activa ? ' activa' : ''}`}
      onPointerDown={(e) => alLarga.current && !e.target.closest('button') && pl.inicio(e.clientX, e.clientY)}
      onPointerMove={(e) => pl.mover(e.clientX, e.clientY)}
      onPointerUp={pl.fin}
      onPointerLeave={pl.fin}
      onPointerCancel={pl.fin}
      onContextMenu={(e) => alLarga.current && e.preventDefault()}
    >
      <span className="ext-tarjeta-img">
        <PortadaImg src={cancion.cover} texto={cancion.titulo} loading="lazy" />
        <button
          className="ext-play"
          aria-label={`Escuchar ${formatearTitulo(cancion.titulo)}, ${formatearTitulo(cancion.artista)}`}
          aria-busy={estadoPlay === 'cargando'}
          onClick={onPlay}
        >
          <IconoM nombre="play" tamano={20} />
        </button>
        {onAdd && (
          <button
            className={`ext-mas${listo ? ' ok' : ''}`}
            aria-label={listo ? 'Ya está en tu biblioteca' : estadoAdd === 'error' ? 'No se pudo añadir, reintentar' : 'Añadir a tu biblioteca'}
            aria-busy={estadoAdd === 'cargando'}
            disabled={listo}
            onClick={onAdd}
          >
            <IconoM nombre={listo ? 'check' : 'mas'} tamano={18} />
          </button>
        )}
      </span>
      <b>{formatearTitulo(cancion.titulo)}</b>
      <small>{formatearTitulo(cancion.artista)}</small>
    </div>
  );
}
