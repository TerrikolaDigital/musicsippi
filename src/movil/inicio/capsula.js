// src/movil/inicio/capsula.js
// «Cápsula del tiempo»: lo que más sonó la misma semana de hace un año o, si el historial
// no llega tan atrás, la de hace un mes. Puro.
import { DIA_MS, indicePorId } from './comun.js';

const MIN_ESCUCHAS = 4; // por debajo, la ventana no dice nada
const MAX_CANCIONES = 12;

/** Escuchas dentro de [desde, hasta) agrupadas por canción de la biblioteca. */
function topDeVentana(historial, porId, desde, hasta) {
  const cuenta = new Map();
  let total = 0;
  for (const h of historial ?? []) {
    if (!(h?.ts >= desde && h.ts < hasta)) continue;
    const t = porId.get(h.trackId);
    if (!t) continue;
    total += 1;
    const c = cuenta.get(t.id) ?? { t, n: 0, ts: 0 };
    c.n += 1;
    c.ts = Math.max(c.ts, h.ts);
    cuenta.set(t.id, c);
  }
  const orden = [...cuenta.values()].sort((a, b) => b.n - a.n || b.ts - a.ts);
  return { total, tracks: orden.slice(0, MAX_CANCIONES).map((x) => x.t) };
}

/**
 * @returns {{ clave: 'anio'|'mes', titulo: string, sub: string, tracks: Array } | null}
 */
export function capsulaDelTiempo({ historial, tracks, ahora = Date.now() }) {
  const porId = indicePorId(tracks);
  const ventanas = [
    { clave: 'anio', atras: 365, titulo: 'Hace un año escuchabas…', sub: 'Por estas fechas, el año pasado' },
    { clave: 'mes', atras: 30, titulo: 'El mes pasado por estas fechas', sub: 'Lo que más sonó entonces' },
  ];
  for (const v of ventanas) {
    const centro = ahora - v.atras * DIA_MS;
    const r = topDeVentana(historial, porId, centro - 3 * DIA_MS, centro + 4 * DIA_MS);
    if (r.total >= MIN_ESCUCHAS && r.tracks.length >= 3) return { clave: v.clave, titulo: v.titulo, sub: v.sub, tracks: r.tracks };
  }
  return null;
}
