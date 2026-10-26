// src/movil/inicio/joyas.js
// «Joyas escondidas»: canciones de tu biblioteca con 0-1 reproducciones (distintas de
// «Hace tiempo que no escuchas», que son las que sí sonaron pero hace mucho). Puro.
import { barajarConMemoria } from '../barajar.js';
import { filtrarNoMeGusta } from '../noMeGusta.js';
import { claveDia, conTopePorArtista, reproduccionesPorTrack, rngDeSemilla } from './comun.js';

const MIN_HISTORIAL = 15; // con menos historial «poco escuchada» no significa nada
const MIN_JOYAS = 4;

/** Hasta `limite` canciones con ≤ `maxEscuchas` reproducciones, elegidas por fecha (estables en el día). */
export function joyasEscondidas({ tracks: todas, historial, ahora = Date.now(), limite = 12, maxEscuchas = 1, marcas = [] }) {
  const tracks = filtrarNoMeGusta(todas, marcas);
  if ((historial?.length ?? 0) < MIN_HISTORIAL) return [];
  const cuenta = reproduccionesPorTrack(historial, tracks);
  const candidatas = (tracks ?? []).filter((t) => (cuenta.get(t.id) ?? 0) <= maxEscuchas);
  if (candidatas.length < MIN_JOYAS) return [];
  const rng = rngDeSemilla(`${claveDia(ahora)}:joyas`);
  const ids = barajarConMemoria(candidatas.map((t) => t.id), new Map(), ahora, rng);
  const porId = new Map(candidatas.map((t) => [t.id, t]));
  return conTopePorArtista(ids.map((id) => porId.get(id)), limite, 2);
}
