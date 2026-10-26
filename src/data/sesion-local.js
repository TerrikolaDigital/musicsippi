import { obtenerTodos, agregarRegistro, borrarRegistro, obtenerValorConfig, guardarValorConfig } from './lib/db.js';

const MAX_HISTORIAL = 10000; // la «última vez que sonó» y las estadísticas salen de aquí
const PODAR_CADA = 100;
let sinPodar = 0;
const MAX_ULTIMOS_MODOS = 6;

// No hay nada que migrar en una instalación móvil nueva (no existió
// localStorage previo en este dispositivo) — no-op para que el facade
// pueda llamarlas sin distinguir el modo.
export function migrarHistorial() {
  return Promise.resolve({ ok: true, migrado: false });
}

export function migrarUltimosModos() {
  return Promise.resolve({ ok: true, migrado: false });
}

export async function registrarReproduccion(entrada) {
  await agregarRegistro('historial', { ...entrada, ts: Date.now() });
  sinPodar += 1;
  if (sinPodar < PODAR_CADA) return; // podar cuesta leer todo: se hace de vez en cuando
  sinPodar = 0;
  const todos = await obtenerTodos('historial');
  if (todos.length > MAX_HISTORIAL) {
    const sobrantes = todos.sort((a, b) => a.ts - b.ts).slice(0, todos.length - MAX_HISTORIAL);
    await Promise.all(sobrantes.map((r) => borrarRegistro('historial', r.id)));
  }
}

export async function obtenerHistorial() {
  const todos = await obtenerTodos('historial');
  return todos.sort((a, b) => b.ts - a.ts);
}

export function obtenerUltimosModos() {
  return obtenerValorConfig('ultimosModos', []);
}

export async function guardarUltimoModoUsado(ejeId) {
  const actuales = await obtenerValorConfig('ultimosModos', []);
  const nuevos = [ejeId, ...actuales.filter((id) => id !== ejeId)].slice(0, MAX_ULTIMOS_MODOS);
  return guardarValorConfig('ultimosModos', nuevos);
}
