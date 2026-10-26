// src/movil/FilaCancion.jsx
// Fila de canción: portada, título, artista, duración y botón de más opciones.
// Pulsación larga (`onPulsacionLarga`): abre el mismo menú ⋯ de la canción; el toque normal sigue reproduciendo.
import { useRef } from 'react';
import OlaProgreso from './OlaProgreso.jsx';
import { IconoM } from './iconos.jsx';
import { PortadaImg } from './PortadaGenerada.jsx';
import { textoPortada } from './portadaGenerada.js';
import { crearPulsacionLarga } from './pulsacionFila.js';
import { formatearTitulo, reloj } from '../ui/formato.js';

export default function FilaCancion({ track, meta, activa, onTocar, onMas, onPulsacionLarga, iconoMas = 'puntos-v', etiquetaMas = 'Más opciones', subtitulo, derecha, asa, estilo, arrastrando, pausada, onPlay, etiquetaPlay = 'Escuchar sin añadir', cargandoPlay }) {
  const url = typeof meta?.coverUrl === 'string' && meta.coverUrl.startsWith('http') ? meta.coverUrl : null;
  const alLarga = useRef(onPulsacionLarga);
  alLarga.current = onPulsacionLarga;
  const pulsacion = useRef(null);
  if (!pulsacion.current) {
    pulsacion.current = crearPulsacionLarga({ alDisparar: () => alLarga.current?.() });
  }
  const pl = pulsacion.current;
  return (
    <div className={`fila-cancion${activa ? ' activa' : ''}${arrastrando ? ' arrastrando' : ''}`} style={estilo}>
      <button
        className="fila-cancion-main"
        onClick={(e) => {
          if (pl.fueDisparada()) {
            e.preventDefault();
            return;
          }
          onTocar();
        }}
        onPointerDown={(e) => alLarga.current && pl.inicio(e.clientX, e.clientY)}
        onPointerMove={(e) => pl.mover(e.clientX, e.clientY)}
        onPointerUp={pl.fin}
        onPointerLeave={pl.fin}
        onPointerCancel={pl.fin}
        onContextMenu={(e) => alLarga.current && e.preventDefault()}
        aria-label={`Reproducir ${formatearTitulo(track.titulo)}`}
      >
        <PortadaImg src={url} texto={textoPortada(track, meta)} loading="lazy" claseSin="fila-cancion-sin" />
        <span className="fila-cancion-txt">
          <b>
            {activa && <OlaProgreso variante="icono" pausado={!!pausada} />}
            {formatearTitulo(track.titulo)}
          </b>
          <small>{subtitulo ?? formatearTitulo(track.artista)}</small>
        </span>
        {derecha ? (
          <span className="fila-cancion-dur">{derecha}</span>
        ) : (
          meta?.duracionMs > 0 && <span className="fila-cancion-dur">{reloj(meta.duracionMs / 1000)}</span>
        )}
      </button>
      {asa && (
        <span className="fila-cancion-asa" role="button" aria-label="Arrastrar para reordenar" {...asa}>
          <IconoM nombre="asa" />
        </span>
      )}
      {onPlay && (
        <button className="fila-cancion-play" onClick={onPlay} aria-label={etiquetaPlay} aria-busy={!!cargandoPlay}>
          <IconoM nombre="play" tamano={20} />
        </button>
      )}
      <button className="fila-cancion-mas" onClick={onMas} aria-label={etiquetaMas}>
        <IconoM nombre={iconoMas} />
      </button>
    </div>
  );
}
