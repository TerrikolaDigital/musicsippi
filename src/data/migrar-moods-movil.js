// src/data/migrar-moods-movil.js
// «Reorganizar en moods» en el móvil: vista previa, copia de seguridad, aplicar y deshacer.
// Trabaja contra un `almacen` con la interfaz de db.js (en los tests, almacen-memoria.js).
// No se anota en el registro de cambios: la migración no se puede expresar con los endpoints del PC.
// El PC se migra con scripts/aplicar-migracion-moods.mjs y la sincronización se bloquea mientras
// un lado esté migrado y el otro no (ver sincronizar-movil.js).
import {
  VERSION_ESQUEMA_MOODS,
  esActividadEnergia,
  aplicarPlan,
  esquemaDeEjes,
  filtrarCambiosTrasMigracion,
  formatearSimulacion,
  musicbrainzDeMovil,
  planificarMigracion,
} from '../organizador/migrar-moods.js';
import { CLAVE_CAMBIOS, anotarCambio } from './lib/journal.js';

export const CLAVE_ESQUEMA = 'esquemaMoods';
export const CLAVE_COPIA_PREVIA = 'copiaPreMigracionMoods';
const CLAVE_SIN_COLOCAR = 'sinColocar';

/** Versión de esquema de este móvil. */
export async function esquemaLocal(almacen) {
  return esquemaDeEjes(await almacen.obtenerTodos('ejes'), await almacen.obtenerValorConfig(CLAVE_ESQUEMA, 0));
}

async function leerTodo(almacen, metadata) {
  const [tracks, ejes, generos] = await Promise.all([almacen.obtenerTodos('biblioteca'), almacen.obtenerTodos('ejes'), almacen.obtenerTodos('generos')]);
  const plan = planificarMigracion({ tracks, ejes, musicbrainz: musicbrainzDeMovil({ tracks, generos, metadata }) });
  return { tracks, ejes, plan };
}

/** Resumen de recuentos para enseñar antes de aplicar: nada se cambia. */
export function resumenDelPlan(plan) {
  const r = plan.recuentos;
  const grupo = (familia) =>
    Object.values(r.porMood)
      .filter((m) => m.familia === familia)
      .map((m) => ({ nombre: m.nombre, n: m.n }));
  return { total: r.total, conMood: r.conAlgunMood, sinMood: r.sinMood, estados: grupo('estado'), generos: grupo('genero'), listas: grupo('fijo'), lineas: formatearSimulacion(plan) };
}

export async function vistaPrevia(almacen, { metadata = null } = {}) {
  if ((await esquemaLocal(almacen)) >= VERSION_ESQUEMA_MOODS) return { migrado: true };
  const { plan } = await leerTodo(almacen, metadata);
  const cambios = await almacen.obtenerValorConfig(CLAVE_CAMBIOS, []);
  return { migrado: false, resumen: resumenDelPlan(plan), cambiosDeMoodsPendientes: filtrarCambiosTrasMigracion(cambios).descartados.length };
}

export async function hayCopiaPrevia(almacen) {
  const c = await almacen.obtenerValorConfig(CLAVE_COPIA_PREVIA, null);
  return c ? { fecha: c.fecha, canciones: c.biblioteca.length } : null;
}

/**
 * Guarda la copia (biblioteca, ejes, registro de cambios y estado del organizador) y aplica el plan.
 * Si algo falla a mitad, restaura la copia antes de lanzar el error.
 */
export async function reorganizar(almacen, { metadata = null, ahora = () => new Date() } = {}) {
  if ((await esquemaLocal(almacen)) >= VERSION_ESQUEMA_MOODS) throw new Error('Los moods ya están reorganizados.');
  const { tracks, ejes, plan } = await leerTodo(almacen, metadata);
  const cambios = await almacen.obtenerValorConfig(CLAVE_CAMBIOS, []);
  const sinColocar = await almacen.obtenerValorConfig(CLAVE_SIN_COLOCAR, {});
  await almacen.guardarValorConfig(CLAVE_COPIA_PREVIA, { fecha: ahora().toISOString(), biblioteca: tracks, ejes, cambios, sinColocar, esquema: await esquemaLocal(almacen) });
  try {
    const nuevo = aplicarPlan({ ejes }, tracks, plan);
    const idsNuevos = new Set(nuevo.ejesData.ejes.map((e) => e.id));
    await almacen.borrarVarios('ejes', ejes.filter((e) => !idsNuevos.has(e.id)).map((e) => e.id));
    await almacen.guardarVarios('ejes', nuevo.ejesData.ejes);
    await almacen.guardarVarios('biblioteca', nuevo.tracks);
    await almacen.guardarValorConfig(CLAVE_CAMBIOS, filtrarCambiosTrasMigracion(cambios).quedan);
    await almacen.guardarValorConfig(CLAVE_SIN_COLOCAR, {});
    await almacen.guardarValorConfig(CLAVE_ESQUEMA, VERSION_ESQUEMA_MOODS);
  } catch (e) {
    await deshacer(almacen);
    throw e;
  }
  return resumenDelPlan(plan);
}

/** Restaura la copia hecha antes de reorganizar (todo vuelve a como estaba, incluidos los cambios sin enviar). */
export async function deshacer(almacen) {
  const c = await almacen.obtenerValorConfig(CLAVE_COPIA_PREVIA, null);
  if (!c) throw new Error('No hay copia de seguridad que restaurar.');
  const [tActuales, eActuales] = await Promise.all([almacen.obtenerTodos('biblioteca'), almacen.obtenerTodos('ejes')]);
  const idsT = new Set(c.biblioteca.map((t) => t.id));
  const idsE = new Set(c.ejes.map((e) => e.id));
  await almacen.borrarVarios('biblioteca', tActuales.filter((t) => !idsT.has(t.id)).map((t) => t.id));
  await almacen.borrarVarios('ejes', eActuales.filter((e) => !idsE.has(e.id)).map((e) => e.id));
  await almacen.guardarVarios('biblioteca', c.biblioteca);
  await almacen.guardarVarios('ejes', c.ejes);
  await almacen.guardarValorConfig(CLAVE_CAMBIOS, c.cambios);
  await almacen.guardarValorConfig(CLAVE_SIN_COLOCAR, c.sinColocar ?? {});
  await almacen.guardarValorConfig(CLAVE_ESQUEMA, c.esquema ?? 0);
  await almacen.guardarValorConfig(CLAVE_COPIA_PREVIA, null);
  return { canciones: c.biblioteca.length };
}

// --- Reparación de Power (con-energia) ---------------------------------------------------------------
// La primera versión de la migración dejó a Power con 1 canción en el móvil: las listas Gym/Workout llegaban con
// una señal débil y no alcanzaban el umbral. Esto devuelve a Power lo que estaba en esas listas, una sola vez.

export const CLAVE_REPARACION_POWER = 'reparacionPowerMoods';
const ID_POWER = 'con-energia';
const GENEROS_ENERGICOS = new Set(['rock', 'electronica', 'pop-bailable']);
const BPM_ENERGICO = 120;
const RE_TITULO_ENERGICO = /\b(workout|gym|power|pump|run|running|energy|beast|fire|champion|stronger|eye of the tiger)\b/i;

/** Señales de que una canción es de entrenar sin la copia: género de ritmo, tempo alto y título enérgico. */
function senalesDePower(t, bpm) {
  const ids = (t.ejes ?? []).map((x) => x.ejeId);
  const n = bpm?.[t.id];
  return (ids.some((id) => GENEROS_ENERGICOS.has(id)) ? 1 : 0) + (Number.isFinite(n) && n >= BPM_ENERGICO ? 1 : 0) + (RE_TITULO_ENERGICO.test(t.titulo ?? '') ? 1 : 0);
}

/**
 * Reasigna a Power las canciones que estaban en Gym/Gimnasio/Workout según la copia de «Deshacer reorganización»
 * (sin copia: ≥ 2 señales). Solo añade `con-energia` (nunca quita nada), lo anota en el registro de cambios y se
 * marca como hecha, así que es idempotente. `bpm`: { [trackId]: número } si se conoce el tempo.
 * @returns {{hecho:boolean, motivo?:string, anadidas?:number, origen?:'copia'|'senales'}}
 */
export async function repararPower(almacen, { bpm = null, ahora = () => new Date() } = {}) {
  if (await almacen.obtenerValorConfig(CLAVE_REPARACION_POWER, null)) return { hecho: false, motivo: 'ya-hecha' };
  if ((await esquemaLocal(almacen)) < VERSION_ESQUEMA_MOODS) return { hecho: false, motivo: 'sin-migrar' };
  const ejes = await almacen.obtenerTodos('ejes');
  if (!ejes.some((e) => e.id === ID_POWER)) return { hecho: false, motivo: 'sin-power' };
  const copia = await almacen.obtenerValorConfig(CLAVE_COPIA_PREVIA, null);
  const tracks = await almacen.obtenerTodos('biblioteca');
  let ids;
  let origen;
  if (copia?.biblioteca) {
    const entrenar = new Set((copia.ejes ?? []).filter(esActividadEnergia).map((e) => e.id));
    ids = new Set(copia.biblioteca.filter((t) => (t.ejes ?? []).some((x) => entrenar.has(x.ejeId))).map((t) => t.id));
    origen = 'copia';
  } else {
    ids = new Set(tracks.filter((t) => senalesDePower(t, bpm) >= 2).map((t) => t.id));
    origen = 'senales';
  }
  const aCambiar = tracks.filter((t) => ids.has(t.id) && !(t.ejes ?? []).some((x) => x.ejeId === ID_POWER));
  const nuevos = aCambiar.map((t) => ({
    ...t,
    ejes: [...(t.ejes ?? []).filter((x) => x.ejeId !== 'sin-clasificar'), { ejeId: ID_POWER, origen: 'auto', senal: 'migracion-moods', score: 1 }],
  }));
  if (nuevos.length) await almacen.guardarVarios('biblioteca', nuevos);
  for (const t of aCambiar) await anotarCambio(almacen, 'asignar', { trackId: t.id, ejeId: ID_POWER });
  await almacen.guardarValorConfig(CLAVE_REPARACION_POWER, { fecha: ahora().toISOString(), anadidas: nuevos.length, origen });
  return { hecho: true, anadidas: nuevos.length, origen };
}
