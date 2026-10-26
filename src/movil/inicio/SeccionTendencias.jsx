// src/movil/inicio/SeccionTendencias.jsx
// «Tendencias en tu estilo»: las canciones en tendencia de Deezer (las de Buscar > Explorar) de los
// géneros de tus modos, sin las que ya tienes. Caché de 12 h.
import { useMemo, useRef } from 'react';
import { calcularTendencias, generosDeModos, sinLoQueTengo } from './calculos.js';
import { HORA_MS } from './cache.js';
import { useSeccionExterna } from './externas.js';
import CarruselCanciones from './CarruselCanciones.jsx';

const MOSTRAR = 16;
const MINIMO = 4;

export default function SeccionTendencias({ ctx }) {
  const generos = useMemo(() => generosDeModos(ctx.ejes, ctx.conteos), [ctx.ejes, ctx.conteos]);
  const tracksRef = useRef(ctx.tracks);
  tracksRef.current = ctx.tracks;
  const firma = generos.join('-');

  const datos = useSeccionExterna({
    clave: `tendencias:${firma}`,
    ttlMs: 12 * HORA_MS,
    firma,
    retrasoMs: 2500,
    cargar: (dz) => calcularTendencias({ generos, dz }),
  });

  const canciones = useMemo(() => (datos ? sinLoQueTengo(datos, tracksRef.current, MOSTRAR) : []), [datos]);
  if (canciones.length < MINIMO) return null;
  // Sin biblioteca no hay «estilo»: son las tendencias generales de Deezer.
  const titulo = ctx.tracks.length ? 'Tendencias en tu estilo' : 'Tendencias ahora';
  return <CarruselCanciones ctx={ctx} titulo={titulo} etiqueta="Tendencias" canciones={canciones} />;
}
