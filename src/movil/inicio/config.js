// src/movil/inicio/config.js
// Preferencias de Inicio: por sección, «siempre», «a veces» (rotación diaria) o «nunca». En localStorage,
// como el resto de preferencias del móvil.
import { SECCIONES, SECCIONES_RENOMBRADAS, modoPorDefecto, modoSeccion } from './secciones.js';

export { modoPorDefecto, modoSeccion };

const CLAVE = 'musicsippi-inicio-secciones';
export const EVENTO_INICIO = 'musicsippi-inicio-secciones';

export const MODOS_SECCION = ['siempre', 'aveces', 'nunca'];

/**
 * Forma guardada: `modos` solo con lo que difiere del valor por defecto (las fijas «siempre»,
 * las rotativas «aveces»). Migra el formato anterior: `desactivadas` pasa a «nunca» y
 * `todasCadaDia` a «siempre» para las rotativas que seguían activadas.
 */
export function normalizarConfig(crudo) {
  const modos = {};
  if (crudo?.modos && typeof crudo.modos === 'object') {
    for (const [id, m] of Object.entries(crudo.modos)) if (MODOS_SECCION.includes(m)) modos[id] = m;
  }
  const desactivadas = Array.isArray(crudo?.desactivadas) ? crudo.desactivadas.filter((x) => typeof x === 'string') : [];
  if (crudo?.todasCadaDia === true) {
    for (const s of SECCIONES) if (s.tipo === 'rotativa' && !(s.id in modos)) modos[s.id] = 'siempre';
  }
  const explicitas = crudo?.modos && typeof crudo.modos === 'object' ? crudo.modos : {};
  for (const id of desactivadas) if (!(id in explicitas)) modos[id] = 'nunca';
  // Secciones que ya no existen (Recientes se fusionó con Sigue escuchando, Tus artistas pasó a Tus géneros):
  // «nunca» se traslada a la nueva si no tiene elección propia; el resto se descarta.
  for (const [viejo, nuevo] of Object.entries(SECCIONES_RENOMBRADAS)) {
    if (modos[viejo] === 'nunca' && !(nuevo in modos)) modos[nuevo] = 'nunca';
  }
  for (const id of Object.keys(modos)) if (!SECCIONES.some((s) => s.id === id)) delete modos[id];
  // Una fija no rota: «a veces» no tiene sentido y equivale a «siempre».
  for (const s of SECCIONES) if (s.tipo !== 'rotativa' && modos[s.id] === 'aveces') modos[s.id] = 'siempre';
  for (const s of SECCIONES) if (modos[s.id] === modoPorDefecto(s.id)) delete modos[s.id];
  return { modos };
}

export function leerConfigInicio(almacen = globalThis.localStorage) {
  try {
    const t = almacen?.getItem(CLAVE);
    return normalizarConfig(t ? JSON.parse(t) : null);
  } catch {
    return normalizarConfig(null);
  }
}

export function guardarConfigInicio(config, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE, JSON.stringify(normalizarConfig(config)));
  } catch {
    // localStorage puede fallar (modo privado, cuota llena); no es crítico.
  }
  try {
    globalThis.dispatchEvent?.(new Event(EVENTO_INICIO));
  } catch {
    // sin eventos (Node): nada que avisar
  }
}

/** Config nueva con la sección `id` en el modo dado. */
export function conModo(config, id, modo) {
  const modos = { ...config.modos };
  if (modo === modoPorDefecto(id) || !MODOS_SECCION.includes(modo)) delete modos[id];
  else modos[id] = modo;
  return { ...config, modos };
}

/** Config nueva con la sección `id` activada (valor por defecto) o apagada («nunca»). */
export const conSeccion = (config, id, activa) => conModo(config, id, activa ? modoPorDefecto(id) : 'nunca');

export const seccionActivada = (config, id) => modoSeccion(config, id) !== 'nunca';
