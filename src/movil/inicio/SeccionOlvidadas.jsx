// src/movil/inicio/SeccionOlvidadas.jsx
// «Hace tiempo que no escuchas»: lo que lleva más de 30 días sin sonar (o nunca).
import { useMemo } from 'react';
import { sinEscucharHaceTiempo } from '../inicio.js';
import CarruselPortadas from './CarruselPortadas.jsx';

export default function SeccionOlvidadas({ ctx }) {
  const olvidadas = useMemo(() => sinEscucharHaceTiempo(ctx.tracks, ctx.historial), [ctx.tracks, ctx.historial]);
  if (olvidadas.length === 0) return null;
  return <CarruselPortadas ctx={ctx} titulo="Hace tiempo que no escuchas" etiqueta="Hace tiempo que no escuchas" canciones={olvidadas} />;
}
