// src/movil/inicio/SeccionArtistasParecidos.jsx
// «También te podría gustar»: artistas parecidos a tus favoritos que no tienes en la biblioteca.
// ▶ suena sus éxitos sin añadirlos; tocar la foto abre su ficha; pulsación larga en la foto añade sus 5 éxitos.
import { useCallback, useMemo, useRef, useState } from 'react';
import { crearPulsacionLarga } from '../pulsacionFila.js';
import { entradaArtista, filtrarNoMeGusta } from '../noMeGusta.js';
import { IconoM } from '../iconos.jsx';
import { formatearTitulo } from '../../ui/formato.js';
import { artistasSemilla, calcularParecidos } from './calculos.js';
import { HORA_MS } from './cache.js';
import { dzUnico, previewDeCancion, resolverVideo, useSeccionExterna } from './externas.js';

const MINIMO = 3;
const EXITOS = 5;

const iniciales = (nombre) =>
  formatearTitulo(nombre)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

function Circulo({ foto, nombre }) {
  const [fallo, setFallo] = useState(false);
  return (
    <span className="artista-circulo">
      {foto && !fallo ? <img src={foto} alt="" loading="lazy" onError={() => setFallo(true)} /> : <span aria-hidden="true">{iniciales(nombre)}</span>}
    </span>
  );
}

export default function SeccionArtistasParecidos({ ctx, nav }) {
  const semillas = useMemo(() => artistasSemilla([ctx.topArtistas], 6), [ctx.topArtistas]);
  const semillasRef = useRef(semillas);
  semillasRef.current = semillas;
  const tracksRef = useRef(ctx.tracks);
  tracksRef.current = ctx.tracks;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [estados, setEstados] = useState({}); // `${id}:play` | `${id}:add` -> 'cargando' | 'ok' | 'error'
  const pulsacion = useMemo(() => crearPulsacionLarga({ alDisparar: () => pulsacion.alLarga?.() }), []);
  const poner = (k, v) => setEstados((s) => ({ ...s, [k]: v }));

  const datos = useSeccionExterna({
    clave: 'parecidos',
    ttlMs: 72 * HORA_MS,
    firma: semillas.join('|'),
    activa: semillas.length > 0 && ctx.tracks.length > 0,
    retrasoMs: 3000,
    cargar: (dz) => calcularParecidos({ semillas: semillasRef.current, dz, tracks: tracksRef.current }),
  });

  // Las 5 canciones más conocidas del artista, ya con su vídeo de YouTube Music.
  const exitos = useCallback(async (a) => {
    const lista = await dzUnico().top(a.id, EXITOS);
    return lista.slice(0, EXITOS);
  }, []);

  const escuchar = async (a) => {
    poner(`${a.id}:play`, 'cargando');
    try {
      const canciones = await exitos(a);
      const resueltas = await Promise.allSettled(canciones.map(async (c) => previewDeCancion(c, await resolverVideo(ctxRef.current.buscarExterno, c))));
      const previews = resueltas.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (previews.length === 0) throw new Error('sin canciones');
      ctxRef.current.reproducirLista(previews[0], previews, `Éxitos de ${a.nombre}`);
      poner(`${a.id}:play`, undefined);
    } catch {
      poner(`${a.id}:play`, 'error');
      ctxRef.current.avisar?.(`No se pudo reproducir a ${a.nombre}`);
    }
  };

  const importar = async (a) => {
    poner(`${a.id}:add`, 'cargando');
    try {
      let n = 0;
      for (const c of await exitos(a)) {
        try {
          const videoId = await resolverVideo(ctxRef.current.buscarExterno, c);
          await ctxRef.current.agregarExterno({ titulo: c.titulo, artista: c.artista, videoId });
          n += 1;
        } catch {
          // una canción que falla no corta las demás
        }
      }
      if (n === 0) throw new Error('ninguna');
      poner(`${a.id}:add`, 'ok');
      ctxRef.current.avisar?.(`${n} ${n === 1 ? 'canción añadida' : 'canciones añadidas'} de ${a.nombre}`);
    } catch {
      poner(`${a.id}:add`, 'error');
      ctxRef.current.avisar?.(`No se pudieron añadir las canciones de ${a.nombre}`);
    }
  };

  const artistas = filtrarNoMeGusta(datos, ctx.noMeGusta);
  if (!artistas || artistas.length < MINIMO) return null;
  return (
    <>
      <div className="m-seccion">
        <h2>También te podría gustar</h2>
      </div>
      <div className="inicio-carrusel">
        {artistas.map((a) => {
          return (
            <div key={a.id} className="artista-tarjeta ext-artista">
              <span className="ext-artista-foto">
                <button
                  className="ext-artista-abrir"
                  aria-label={`Abrir ${formatearTitulo(a.nombre)}`}
                  onClick={(e) => (pulsacion.fueDisparada() ? e.preventDefault() : nav.abrir({ tipo: 'artista', nombre: a.nombre }))}
                  onPointerDown={(e) => {
                    pulsacion.alLarga = () => importar(a);
                    pulsacion.inicio(e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => pulsacion.mover(e.clientX, e.clientY)}
                  onPointerUp={pulsacion.fin}
                  onPointerLeave={pulsacion.fin}
                  onPointerCancel={pulsacion.fin}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <Circulo foto={a.foto} nombre={a.nombre} />
                </button>
                <button
                  className="ext-play"
                  aria-label={`Escuchar éxitos de ${formatearTitulo(a.nombre)}`}
                  aria-busy={estados[`${a.id}:play`] === 'cargando'}
                  onClick={() => escuchar(a)}
                >
                  <IconoM nombre="play" tamano={20} />
                </button>
                <button
                  className="ext-mas ext-nmg"
                  aria-label={`No me gusta ${formatearTitulo(a.nombre)}`}
                  onClick={() => ctx.marcarNoMeGusta(entradaArtista(a.nombre))}
                >
                  <IconoM nombre="no-me-gusta" tamano={16} />
                </button>
              </span>
              <b>{formatearTitulo(a.nombre)}</b>
            </div>
          );
        })}
      </div>
    </>
  );
}
