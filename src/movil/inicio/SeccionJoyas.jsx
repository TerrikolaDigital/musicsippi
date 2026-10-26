// src/movil/inicio/SeccionJoyas.jsx
// «Joyas escondidas»: canciones de tu biblioteca que casi no has escuchado (0-1 veces).
import { useMemo } from 'react';
import { joyasEscondidas } from './joyas.js';
import { claveDia } from './comun.js';
import CarruselPortadas from './CarruselPortadas.jsx';

export default function SeccionJoyas({ ctx }) {
  const dia = claveDia();
  // La selección es estable durante el día; solo se recalcula si cambia la biblioteca o el día.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const joyas = useMemo(
    () => joyasEscondidas({ tracks: ctx.tracks, historial: ctx.historial, marcas: ctx.noMeGusta }),
    [ctx.tracks, ctx.historial.length > 0, dia, ctx.noMeGusta],
  );
  if (joyas.length === 0) return null;
  return <CarruselPortadas ctx={ctx} titulo="Joyas escondidas" etiqueta="Joyas escondidas" canciones={joyas} />;
}
