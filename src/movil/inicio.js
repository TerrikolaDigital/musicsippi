// src/movil/inicio.js
// Datos puros de la pantalla Inicio: «Hace tiempo que no escuchas», canciones sin modo y
// estado de la sincronización.
import { ultimaVezDeHistorial } from './barajar.js';
import { haceCuanto } from './formato.js';
import { esSinModo } from '../organizador/sin-modo.js';

const DIA_MS = 86400000;

/**
 * Canciones que no suenan desde hace más de `dias` días (o nunca), las más antiguas primero
 * (las que nunca sonaron, al final de las "viejas" para no tapar lo que sí se quiso). Si hay
 * menos de `minimo`, se completa con las que aún no han sonado nada.
 */
export function sinEscucharHaceTiempo(tracks, historial, { dias = 30, limite = 10, ahora = Date.now() } = {}) {
  const ultima = ultimaVezDeHistorial(historial);
  const ts = (t) => ultima.get(t.id) ?? (t.trackIdReal ? ultima.get(t.trackIdReal) : undefined);
  const antiguas = [];
  const nunca = [];
  for (const t of tracks ?? []) {
    const v = ts(t);
    if (v == null) nunca.push(t);
    else if (ahora - v > dias * DIA_MS) antiguas.push([t, v]);
  }
  antiguas.sort((a, b) => a[1] - b[1]);
  return [...antiguas.map((x) => x[0]), ...nunca].slice(0, limite);
}

/** Cuántas canciones no están en ningún modo (salvo «sin clasificar» y favoritas). */
export function contarSinModo(tracks) {
  return (tracks ?? []).filter(esSinModo).length;
}

/** Texto de estado de la sincronización, o null si nunca se emparejó con un PC. */
export function textoSincronizacion(ultima, pendientes, ahora = new Date()) {
  if (!ultima) return null;
  if (pendientes > 0) return `Hay ${pendientes} ${pendientes === 1 ? 'cambio pendiente' : 'cambios pendientes'} de enviar al PC`;
  return `Sincronizado con el PC · ${haceCuanto(ultima, ahora).toLowerCase()}`;
}
