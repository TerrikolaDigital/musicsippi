// src/movil/inicio/SeccionCreadoParaTi.jsx
// «Creado para ti»: 3-4 mezclas del día (tu artista top, tus modos según el día y la hora).
import { useMemo } from 'react';
import { IconoM } from '../iconos.jsx';
import { PortadaImg } from '../PortadaGenerada.jsx';
import { portadaDe } from '../MiniReproductor.jsx';
import { formatearTitulo } from '../../ui/formato.js';
import { mezclasDelDia } from './creadoParaTi.js';
import { claveDia, hashTexto, portadasCollage } from './comun.js';
import { useVectores } from './useVectores.js';

const COLORES = ['#ff4d8d', '#7c5cff', '#ff8a3d', '#4cd9c6', '#c64ff0'];

export function CollageMezcla({ ctx, tracks }) {
  const portadas = useMemo(() => portadasCollage(tracks, (t) => portadaDe(ctx, t), 4), [tracks, ctx.metadataDe]);
  return (
    <span className="mezcla-collage" aria-hidden="true">
      {portadas.map((p, i) => (
        <PortadaImg key={i} src={p.src} texto={p.texto || String(i)} loading="lazy" />
      ))}
    </span>
  );
}

export default function SeccionCreadoParaTi({ ctx }) {
  const vectores = useVectores(ctx);
  const dia = claveDia();
  const mezclas = useMemo(
    () => mezclasDelDia({ tracks: ctx.tracks, historial: ctx.historial, vectores, ejes: ctx.ejes, conteos: ctx.conteos, marcas: ctx.noMeGusta }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.tracks, ctx.historial, ctx.ejes, ctx.conteos, vectores, dia, ctx.noMeGusta],
  );
  if (mezclas.length === 0) return null;
  return (
    <>
      <div className="m-seccion">
        <h2>Creado para ti</h2>
      </div>
      <div className="inicio-carrusel">
        {mezclas.map((m) => {
          const suena = ctx.ejeActivo?.nombre === m.nombre;
          return (
            <button
              key={m.id}
              className={`mezcla-card${suena ? ' suena' : ''}`}
              style={{ '--c': COLORES[hashTexto(m.id) % COLORES.length] }}
              aria-label={`${m.nombre}, ${m.tracks.length} canciones. Reproducir`}
              onClick={() => ctx.reproducirSecuencia(m.tracks, m.nombre)}
            >
              <span className="mezcla-arte">
                <CollageMezcla ctx={ctx} tracks={m.tracks} />
                <span className="mezcla-play" aria-hidden="true">
                  <IconoM nombre="play" tamano={20} />
                </span>
              </span>
              <b>{formatearTitulo(m.nombre)}</b>
              <small>{m.tracks.length} canciones</small>
            </button>
          );
        })}
      </div>
    </>
  );
}
