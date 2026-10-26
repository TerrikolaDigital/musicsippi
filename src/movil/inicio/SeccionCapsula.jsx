// src/movil/inicio/SeccionCapsula.jsx
// «Cápsula del tiempo»: lo que más sonó la misma semana del año pasado (o del mes pasado).
import { useMemo } from 'react';
import { IconoM } from '../iconos.jsx';
import { PortadaImg } from '../PortadaGenerada.jsx';
import { portadaDe } from '../MiniReproductor.jsx';
import { formatearTitulo } from '../../ui/formato.js';
import { capsulaDelTiempo } from './capsula.js';
import { claveDia } from './comun.js';

export default function SeccionCapsula({ ctx }) {
  const dia = claveDia();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const capsula = useMemo(() => capsulaDelTiempo({ historial: ctx.historial, tracks: ctx.tracks }), [ctx.historial, ctx.tracks, dia]);
  if (!capsula) return null;
  const { tracks, titulo, sub } = capsula;
  const apiladas = tracks.slice(0, 3);
  const etiqueta = capsula.clave === 'anio' ? 'Cápsula del tiempo: hace un año' : 'Cápsula del tiempo: el mes pasado';
  return (
    <section className="inicio-capsula" aria-label={titulo}>
      <div className="capsula-fotos" aria-hidden="true">
        {apiladas.map((t, i) => (
          <span key={t.id} className={`capsula-foto f${i}`}>
            <PortadaImg src={portadaDe(ctx, t)} texto={t.titulo ?? ''} loading="lazy" />
          </span>
        ))}
      </div>
      <div className="capsula-txt">
        <h2>{titulo}</h2>
        <small>{sub}</small>
        <ol className="capsula-lista">
          {tracks.slice(0, 3).map((t) => (
            <li key={t.id}>
              <b>{formatearTitulo(t.titulo)}</b> <span>{formatearTitulo(t.artista)}</span>
            </li>
          ))}
        </ol>
        <button className="capsula-revivir" onClick={() => ctx.reproducirSecuencia(tracks, etiqueta)}>
          <IconoM nombre="play" tamano={18} />
          Revivirlo
        </button>
      </div>
    </section>
  );
}
