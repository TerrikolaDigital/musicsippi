// src/movil/inicio/creadoParaTi.js
// «Creado para ti»: 3-4 mezclas que cambian cada día. Deterministas por fecha (misma
// mezcla durante todo el día): el azar sale de una semilla y la «memoria» se mide al
// empezar el día. Puro.
import { barajarConMemoria } from '../barajar.js';
import { filtrarNoMeGusta } from '../noMeGusta.js';
import { elegirContinuacion } from '../continuacion.js';
import { ANIMOS, coincidencias } from './animo.js';
import {
  claveDia,
  conTopePorArtista,
  inicioDelDia,
  indicePorId,
  masParecidas,
  rngDeSemilla,
  ultimaVezPorTrack,
} from './comun.js';

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Artista con más escuchas en el historial (si no hay, el de más canciones). */
export function artistaTop(historial, tracks) {
  const porId = indicePorId(tracks);
  const cuenta = new Map();
  for (const h of historial ?? []) {
    const a = porId.get(h?.trackId)?.artista;
    if (a) cuenta.set(a, (cuenta.get(a) ?? 0) + 1);
  }
  if (cuenta.size === 0) for (const t of tracks ?? []) if (t.artista) cuenta.set(t.artista, (cuenta.get(t.artista) ?? 0) + 1);
  let mejor = null;
  for (const [a, n] of cuenta) if (!mejor || n > mejor[1] || (n === mejor[1] && a < mejor[0])) mejor = [a, n];
  return mejor ? mejor[0] : null;
}

/**
 * Cuándo escuchas un modo: hora habitual (media circular) y reparto por día de la semana.
 * `n` = escuchas con fecha.
 */
export function habitoDeModo(historial, ejeId) {
  const dias = new Array(7).fill(0);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const h of historial ?? []) {
    if (h?.ejeId !== ejeId || !h.ts) continue;
    const d = new Date(h.ts);
    dias[d.getDay()] += 1;
    const ang = ((d.getHours() + d.getMinutes() / 60) / 24) * 2 * Math.PI;
    sx += Math.cos(ang);
    sy += Math.sin(ang);
    n += 1;
  }
  if (n === 0) return { n: 0, hora: null, dias };
  const hora = ((Math.atan2(sy, sx) / (2 * Math.PI)) * 24 + 24) % 24;
  return { n, hora, dias };
}

const distHora = (a, b) => {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
};

/**
 * Afinidad (0..~3) de un modo con «hoy» según cuándo lo sueles escuchar. Con `hora` (0-24) pesa
 * también la hora; las mezclas del día no la pasan para que no cambien al reabrir más tarde.
 */
export function afinidadModo(habito, ahora = new Date(), hora = ahora.getHours() + ahora.getMinutes() / 60) {
  if (habito.n < 3) return 0.2 * (habito.n / 3);
  const hoy = habito.dias[ahora.getDay()] / habito.n; // 0..1
  const cerca = hora == null ? 0 : 1 - distHora(habito.hora, hora) / 12; // 0..1
  return hoy * 2 + cerca;
}

/** «mañanas», «tardes» o «noches» según la hora habitual. */
export function franjaDe(hora) {
  if (hora == null) return null;
  if (hora >= 5 && hora < 13) return 'mañanas';
  if (hora >= 13 && hora < 20) return 'tardes';
  return 'noches';
}

/** Nombre de la mezcla de un modo según el día y su ánimo: «Lunes tranquilo», «Energía para el viernes»… */
export function nombreMezclaModo(eje, fecha = new Date()) {
  const dia = DIAS[new Date(fecha).getDay()];
  const texto = `${eje.nombre ?? ''} ${eje.id ?? ''}`;
  const animo = ANIMOS.map((a) => ({ a, n: coincidencias(a, texto) })).sort((x, y) => y.n - x.n)[0];
  const id = animo && animo.n > 0 ? animo.a.id : null;
  switch (id) {
    case 'tranquilo':
      return `${cap(dia)} tranquilo`;
    case 'energia':
      return `Energía para el ${dia}`;
    case 'melancolico':
      return `${cap(dia)} melancólico`;
    case 'fiesta':
      return `Fiesta de ${dia}`;
    case 'feliz':
      return `${cap(dia)} soleado`;
    default:
      return `${eje.nombre} para el ${dia}`;
  }
}

const tamano = (rng) => 25 + Math.floor(rng() * 16); // 25..40

/**
 * @returns {Array<{ id, nombre, sub, tipo, color?, tracks }>} 3-4 mezclas del día (menos si la
 *   biblioteca es pequeña)
 */
export function mezclasDelDia({ tracks: todas, historial = [], vectores = [], ejes = [], conteos = new Map(), ahora = Date.now(), marcas = [] }) {
  const tracks = filtrarNoMeGusta(todas, marcas);
  if (!tracks?.length) return [];
  const fecha = new Date(ahora);
  const dia = claveDia(fecha);
  const inicio = inicioDelDia(ahora);
  const previo = historial.filter((h) => h?.ts < inicio); // lo de hoy no cambia la mezcla de hoy
  const ultima = ultimaVezPorTrack(previo, tracks);
  const mezclas = [];

  // 1) Tu mezcla de <artista top>: sus canciones + parecidas.
  const top = artistaTop(historial, tracks);
  if (top) {
    const rng = rngDeSemilla(`${dia}:artista:${top}`);
    const n = tamano(rng);
    const suyas = tracks.filter((t) => t.artista === top);
    const suyasIds = barajarConMemoria(suyas.map((t) => t.id), ultima, inicio, rng);
    const porId = new Map(suyas.map((t) => [t.id, t]));
    const propias = suyasIds.slice(0, Math.ceil(n / 2)).map((id) => porId.get(id));
    let parecidas = masParecidas(suyas, tracks.filter((t) => t.artista !== top), vectores);
    if (parecidas.length === 0) {
      const modos = new Set(suyas.flatMap((t) => (t.ejes ?? []).map((e) => e.ejeId)).filter((id) => id && id !== 'favoritos' && id !== 'sin-clasificar'));
      const afines = tracks.filter((t) => t.artista !== top && (t.ejes ?? []).some((e) => modos.has(e.ejeId)));
      const ids = barajarConMemoria(afines.map((t) => t.id), ultima, inicio, rng);
      const m = new Map(afines.map((t) => [t.id, t]));
      parecidas = ids.map((id) => m.get(id));
    }
    const lista = [...propias, ...conTopePorArtista(parecidas, n - propias.length, 2)];
    // Intercala: una suya, dos parecidas, para que el artista no copie toda la mezcla.
    const salida = [];
    const a = lista.filter((t) => t.artista === top);
    const b = lista.filter((t) => t.artista !== top);
    while (a.length || b.length) {
      if (a.length) salida.push(a.shift());
      for (let k = 0; k < 2 && b.length; k += 1) salida.push(b.shift());
    }
    if (salida.length >= 8) mezclas.push({ id: `artista:${top}`, nombre: `Tu mezcla de ${top}`, sub: `${top} y parecidos`, tipo: 'artista', tracks: salida });
  }

  // 2) Una por modo, según el día y la hora en que sueles escucharlo.
  const candidatos = ejes
    .filter((e) => e && !e.sistema && e.activo !== false && e.tipo !== 'playlist' && (conteos.get?.(e.id) ?? 0) >= 12)
    .map((e) => ({ e, h: habitoDeModo(historial, e.id), p: afinidadModo(habitoDeModo(historial, e.id), fecha, null) + rngDeSemilla(`${dia}:${e.id}`)() * 0.4 }))
    .sort((x, y) => y.p - x.p);
  for (const { e, h } of candidatos) {
    if (mezclas.length >= 4) break;
    const rng = rngDeSemilla(`${dia}:modo:${e.id}`);
    const lista = elegirContinuacion({
      tracks,
      historial: previo,
      vectores,
      ahora: inicio,
      n: tamano(rng),
      modoId: e.id,
      fraccionFuera: 0.25,
      excluirRecientes: false,
      rng,
    });
    if (lista.length < 8) continue;
    mezclas.push({ id: `modo:${e.id}`, nombre: nombreMezclaModo(e, fecha), sub: h.n >= 3 ? `${e.nombre}, para tus ${franjaDe(h.hora)}` : e.nombre, tipo: 'modo', ejeId: e.id, tracks: lista });
  }

  // Sin historial ni hábitos claros, pocas mezclas: se completa con una de lo menos escuchado.
  if (mezclas.length < 3 && tracks.length >= 30) {
    const rng = rngDeSemilla(`${dia}:rescate`);
    const ids = barajarConMemoria(tracks.map((t) => t.id), ultima, inicio, rng);
    const m = new Map(tracks.map((t) => [t.id, t]));
    const lista = conTopePorArtista(ids.map((id) => m.get(id)), tamano(rng), 2);
    mezclas.push({ id: 'rescate', nombre: 'Para redescubrir', sub: 'Lo que hace tiempo no suena', tipo: 'rescate', tracks: lista });
  }
  return mezclas.slice(0, 4);
}
