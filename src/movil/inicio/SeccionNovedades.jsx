// src/movil/inicio/SeccionNovedades.jsx
// «Lo nuevo de tus artistas»: lanzamientos de los últimos 60 días de tus ~15 artistas más escuchados
// (Deezer). Tocar una tarjeta abre el álbum (la vista de álbum busca en Deezer por artista y título).
import { useMemo, useRef } from 'react';
import { PortadaImg } from '../PortadaGenerada.jsx';
import { filtrarNoMeGusta } from '../noMeGusta.js';
import { formatearTitulo } from '../../ui/formato.js';
import { artistasSemilla, calcularNovedades, haceTexto } from './calculos.js';
import { HORA_MS } from './cache.js';
import { useSeccionExterna } from './externas.js';

const MINIMO = 1;

export default function SeccionNovedades({ ctx, nav }) {
  const artistas = useMemo(() => artistasSemilla([ctx.topArtistas], 15), [ctx.topArtistas]);
  const ref = useRef(artistas);
  ref.current = artistas;

  const datos = useSeccionExterna({
    clave: 'novedades',
    ttlMs: 24 * HORA_MS,
    firma: artistas.join('|'),
    activa: artistas.length > 0,
    retrasoMs: 2000,
    cargar: (dz) => calcularNovedades({ artistas: ref.current, dz }),
  });

  const albumes = filtrarNoMeGusta(datos, ctx.noMeGusta);
  if (!albumes || albumes.length < MINIMO) return null;
  const ahora = Date.now();
  return (
    <>
      <div className="m-seccion">
        <h2>Lo nuevo de tus artistas</h2>
      </div>
      <div className="inicio-carrusel">
        {albumes.map((a) => (
          <button
            key={a.id}
            className="ext-album"
            aria-label={`${formatearTitulo(a.titulo)}, ${formatearTitulo(a.artista)}, ${haceTexto(a.ms, ahora)}`}
            onClick={() => nav.abrir({ tipo: 'album', artista: a.artista, titulo: a.titulo })}
          >
            <span className="ext-tarjeta-img">
              <PortadaImg src={a.cover} texto={a.titulo} loading="lazy" />
            </span>
            <b>{formatearTitulo(a.titulo)}</b>
            <small>{formatearTitulo(a.artista)}</small>
            <small className="ext-fecha">{haceTexto(a.ms, ahora)}</small>
          </button>
        ))}
      </div>
    </>
  );
}
