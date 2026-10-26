// «Escuchar sin conexión»: qué canciones guardar y cómo reducir la cola a lo reproducible
// sin red. Puro (sin Capacitor); los ajustes viven en localStorage.
import { esNoMeGusta } from '../movil/noMeGusta.js';

const DIA_MS = 86400000;
const VENTANA_DIAS = 60;
const VIDA_MEDIA_DIAS = 30;

export const LIMITES_MB = [500, 1024, 2048, 4096];
export const EVENTO_AJUSTES = 'musicsippi:sin-conexion-ajustes';
export const URL_SIN_CONEXION = 'https://sin-conexion.musicsippi.invalid/';
const CLAVE_AJUSTES = 'sinConexion';
const AJUSTES_DEFECTO = { activado: true, limiteMb: 1024 };

const esFavorita = (t) => (t.ejes ?? []).some((e) => e.ejeId === 'favoritos');

/** Resume el historial por trackId: última escucha, total y puntuación de recencia. */
function resumirHistorial(historial, ahora) {
  const por = new Map();
  for (const { trackId, ts } of historial ?? []) {
    const r = por.get(trackId) ?? { ultima: 0, total: 0, recencia: 0 };
    r.total += 1;
    r.ultima = Math.max(r.ultima, ts);
    const edadDias = (ahora - ts) / DIA_MS;
    if (edadDias <= VENTANA_DIAS) r.recencia += Math.exp(-Math.max(edadDias, 0) / VIDA_MEDIA_DIAS);
    por.set(trackId, r);
  }
  return por;
}

/**
 * Elige qué guardar y en qué orden: favoritas (última escucha primero), luego lo escuchado
 * recientemente (puntuación de recencia) y por último lo escuchado alguna vez.
 * Devuelve videoIds sin repetidos y cuántos corresponden a favoritas.
 */
export function seleccionarSinConexion({ tracks, historial, noMeGusta, idsLocales, videoIdDe, ahora }) {
  const resumen = resumirHistorial(historial, ahora);
  const vacio = { ultima: 0, total: 0, recencia: 0 };
  const candidatas = [];
  for (const t of tracks ?? []) {
    if (idsLocales?.has(t.id) || esNoMeGusta(t, noMeGusta) || !videoIdDe(t)) continue;
    const h = resumen.get(t.id) ?? vacio;
    const favorita = esFavorita(t);
    if (favorita || h.total > 0) candidatas.push({ t, h, favorita });
  }
  const grupo = (c) => (c.favorita ? 0 : c.h.recencia > 0 ? 1 : 2);
  candidatas.sort((a, b) => {
    const g = grupo(a) - grupo(b);
    if (g) return g;
    if (a.favorita) return b.h.ultima - a.h.ultima || String(a.t.titulo).localeCompare(String(b.t.titulo));
    return a.h.recencia > 0 ? b.h.recencia - a.h.recencia : b.h.total - a.h.total;
  });
  const vistos = new Set();
  const ids = [];
  let nFavoritas = 0;
  for (const c of candidatas) {
    const id = videoIdDe(c.t);
    if (vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
    if (c.favorita) nFavoritas += 1;
  }
  return { ids, nFavoritas };
}

/** Pistas reproducibles sin red: guardadas (por videoId) o locales (por id). Array nuevo. */
export function filtrarDisponibles(tracks, { guardados, idsLocales, videoIdDe }) {
  return (tracks ?? []).filter((t) => idsLocales?.has(t.id) || guardados?.has(videoIdDe(t)));
}

/** Quita de la cola lo no disponible, conservando siempre la pista actual y recalculando el índice. */
export function filtrarCola(cola, indice, disponible) {
  const actual = cola[indice];
  const nueva = cola.filter((t) => t === actual || disponible(t));
  return { cola: nueva, indice: Math.max(nueva.indexOf(actual), 0) };
}

/**
 * Al volver la red: la cola completa de antes del recorte, con el índice en la pista que suena ahora.
 * Null si no hay nada que restaurar o el usuario cambió de cola (la pista actual ya no está en ella).
 */
export function restaurarCola(colaGuardada, colaActual, indiceActual) {
  const actual = colaActual?.[indiceActual];
  if (!colaGuardada?.length || !actual) return null;
  let indice = colaGuardada.indexOf(actual);
  if (indice < 0) indice = colaGuardada.findIndex((t) => t.id === actual.id);
  return indice < 0 ? null : { cola: [...colaGuardada], indice };
}

const mismosIds = (a, b) => a.size === b.size && [...a].every((id) => b.has(id));

/**
 * Estado + cambios parciales. Devuelve el MISMO `estado` si nada cambia de verdad y conserva el
 * mismo Set de `guardados` si trae los mismos ids (evita renders y efectos en cascada).
 */
export function fusionarEstado(estado, parcial) {
  const p = { ...parcial };
  if (p.guardados && mismosIds(p.guardados, estado.guardados)) p.guardados = estado.guardados;
  const cambia = Object.keys(p).some((k) =>
    k === 'sonoridad' ? JSON.stringify(p[k]) !== JSON.stringify(estado[k]) : p[k] !== estado[k]);
  return cambia ? { ...estado, ...p } : estado;
}

export function leerAjustesSinConexion() {
  try {
    const crudo = JSON.parse(globalThis.localStorage?.getItem(CLAVE_AJUSTES) ?? 'null');
    return {
      activado: typeof crudo?.activado === 'boolean' ? crudo.activado : AJUSTES_DEFECTO.activado,
      // Un límite fuera de la lista (0, negativo, otro) vaciaría la caché: vale el de por defecto.
      limiteMb: LIMITES_MB.includes(crudo?.limiteMb) ? crudo.limiteMb : AJUSTES_DEFECTO.limiteMb,
    };
  } catch {
    return { ...AJUSTES_DEFECTO };
  }
}

export function guardarAjustesSinConexion(parcial) {
  const nuevos = { ...leerAjustesSinConexion(), ...parcial };
  try {
    globalThis.localStorage?.setItem(CLAVE_AJUSTES, JSON.stringify(nuevos));
  } catch { /* sin almacenamiento: se queda en los valores por defecto */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_AJUSTES, { detail: nuevos }));
  return nuevos;
}

/** URL sintética bajo la que se cachea el audio de un videoId. */
export const urlSinConexion = (videoId) => `${URL_SIN_CONEXION}${videoId}`;

/** «0 MB», «350 MB», «1,2 GB» (base 1024, coma decimal). */
export function formatearTamano(bytes) {
  const mb = (bytes ?? 0) / 1048576;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
}

/** Huella de lo que se envía al nativo: si no cambia no se reenvía (evita el bucle con su evento). */
export const claveSeleccion = (ids, { activado, limiteMb }) => `${activado ? 1 : 0}|${limiteMb}|${ids.join(',')}`;

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** «1 GB», «500 MB»: etiqueta de una opción de límite. */
export const etiquetaLimite = (mb) => (mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`);

/** Franja de la parte alta cuando no hay red. */
export const textoFranjaSinConexion = (n) => `Sin conexión · ${plural(n, 'canción guardada', 'canciones guardadas')}`;

/** «Espacio usado: 350 MB de 1 GB · 12 canciones». */
export const textoEspacioUsado = ({ bytes, limiteMb, n }) =>
  `Espacio usado: ${formatearTamano(bytes)} de ${etiquetaLimite(limiteMb)} · ${plural(n, 'canción', 'canciones')}`;

/** Subtítulo de la fila de Configuración: «12 canciones · 350 MB». */
export const textoResumenSinConexion = ({ n, bytes }) => `${plural(n, 'canción', 'canciones')} · ${formatearTamano(bytes)}`;

/** Las favoritas no caben enteras si el tope de espacio cae antes de acabarlas. */
export const favoritasNoCaben = (indiceTope, nFavoritas) => indiceTope >= 0 && indiceTope < nFavoritas;
