// src/movil/inicio/SeccionDescubrimiento.jsx
// «Descubrimiento semanal»: ~20 canciones que no tienes, parecidas a lo que más has escuchado.
// Se recalcula los lunes (la caché dura la semana) y nunca bloquea Inicio: sin datos no pinta nada.
import { useMemo, useRef } from 'react';
import { calcularEstadisticas } from '../estadisticas.js';
import { artistasSemilla, calcularDescubrimiento, sinLoQueTengo } from './calculos.js';
import { claveSemana } from './cache.js';
import { useSeccionExterna } from './externas.js';
import CarruselCanciones from './CarruselCanciones.jsx';

const MOSTRAR = 20;
const MINIMO = 4;
const OCHO_DIAS_MS = 8 * 24 * 3600 * 1000;

export default function SeccionDescubrimiento({ ctx }) {
  const semillas = useMemo(() => {
    const top = (periodo) => calcularEstadisticas({ historial: ctx.historial, tracks: ctx.tracks, ejes: ctx.ejes, periodo }).topArtistas;
    return artistasSemilla([top('semana'), top('mes'), ctx.topArtistas], 5);
  }, [ctx.historial, ctx.tracks, ctx.ejes, ctx.topArtistas]);

  const tracksRef = useRef(ctx.tracks);
  tracksRef.current = ctx.tracks;
  const semana = claveSemana();

  const datos = useSeccionExterna({
    clave: 'descubrimiento',
    ttlMs: OCHO_DIAS_MS,
    firma: semillas.join('|'),
    activa: semillas.length > 0 && ctx.tracks.length > 0,
    valida: (e) => e.datos?.semana === semana,
    cargar: async (dz) => ({
      semana,
      items: await calcularDescubrimiento({ semillas, dz, tracks: tracksRef.current }),
    }),
  });

  // Se filtra una sola vez al llegar los datos: lo que se añade desde aquí se queda con su ✓ en vez de desaparecer.
  const canciones = useMemo(() => (datos ? sinLoQueTengo(datos.items, tracksRef.current, MOSTRAR) : []), [datos]);
  if (canciones.length < MINIMO) return null;
  return <CarruselCanciones ctx={ctx} titulo="Descubrimiento semanal" etiqueta="Descubrimiento semanal" canciones={canciones} />;
}
