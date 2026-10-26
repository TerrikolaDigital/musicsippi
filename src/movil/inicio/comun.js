// src/movil/inicio/comun.js
// Piezas puras que comparten las secciones de Inicio: fecha -> semilla, azar reproducible,
// similitud por vectores y recuento de reproducciones.
import { ultimaVezDeHistorial } from '../barajar.js';

export const DIA_MS = 86400000;

/** 'AAAA-MM-DD' en hora local: la clave del día para que lo "de hoy" no cambie al reabrir. */
export function claveDia(fecha = new Date()) {
  const d = new Date(fecha);
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Inicio (ms) del día local de `ahora`. */
export function inicioDelDia(ahora = Date.now()) {
  const d = new Date(ahora);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Hash FNV-1a de 32 bits, sin signo. */
export function hashTexto(texto) {
  let h = 0x811c9dc5;
  for (const c of String(texto)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Generador reproducible (mulberry32) en [0, 1) a partir de un texto. */
export function rngDeSemilla(semilla) {
  let a = hashTexto(semilla);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const idsDe = (t) => [t.id, t.trackIdReal].filter(Boolean);

/** Mapa id (o id real) -> canción. */
export function indicePorId(tracks) {
  const m = new Map();
  for (const t of tracks ?? []) for (const id of idsDe(t)) m.set(id, t);
  return m;
}

/** Reproducciones por canción de la biblioteca (clave: t.id). */
export function reproduccionesPorTrack(historial, tracks) {
  const porId = indicePorId(tracks);
  const cuenta = new Map();
  for (const h of historial ?? []) {
    const t = porId.get(h?.trackId);
    if (t) cuenta.set(t.id, (cuenta.get(t.id) ?? 0) + 1);
  }
  return cuenta;
}

/** Última vez (ms) por t.id de la biblioteca, para barajarConMemoria. */
export function ultimaVezPorTrack(historial, tracks) {
  const ultima = ultimaVezDeHistorial(historial);
  const salida = new Map();
  for (const t of tracks ?? []) {
    const v = idsDe(t).map((id) => ultima.get(id)).filter((x) => x != null);
    if (v.length) salida.set(t.id, Math.max(...v));
  }
  return salida;
}

export function coseno(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export function centroide(vectores) {
  if (!vectores.length) return null;
  const c = new Array(vectores[0].length).fill(0);
  for (const v of vectores) for (let i = 0; i < c.length; i += 1) c[i] += v[i];
  return c;
}

/** Función canción -> vector (o null) a partir de los registros { trackId, vector }. */
export function vectorDeFn(vectores) {
  const m = new Map((vectores ?? []).map((v) => [v.trackId, v.vector]));
  return (t) => idsDe(t).map((id) => m.get(id)).find(Boolean) ?? null;
}

/**
 * Canciones de `candidatas` ordenadas de más a menos parecidas al centro de `semillas`
 * (sin las propias semillas). Sin vectores devuelve [].
 */
export function masParecidas(semillas, candidatas, vectores) {
  const vectorDe = vectorDeFn(vectores);
  const c = centroide(semillas.map(vectorDe).filter(Boolean));
  if (!c) return [];
  const propias = new Set(semillas.map((t) => t.id));
  return candidatas
    .filter((t) => !propias.has(t.id))
    .map((t) => ({ t, v: vectorDe(t) }))
    .filter((x) => x.v)
    .map((x) => ({ t: x.t, s: coseno(x.v, c) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t);
}

/** Toma hasta `k` de `lista` con tope por artista (si no llega, relaja el tope). */
export function conTopePorArtista(lista, k, tope = 2) {
  const salida = [];
  const usadas = new Set();
  const porArtista = new Map();
  for (const limite of [tope, Infinity]) {
    for (const t of lista) {
      if (salida.length >= k) return salida;
      if (usadas.has(t.id)) continue;
      const a = String(t.artista ?? '').toLowerCase().trim();
      if ((porArtista.get(a) ?? 0) >= limite) continue;
      usadas.add(t.id);
      porArtista.set(a, (porArtista.get(a) ?? 0) + 1);
      salida.push(t);
    }
  }
  return salida;
}

/** Hasta `n` carátulas distintas (las que tengan URL primero); lo que falte queda con src null. */
export function portadasCollage(tracks, urlDe, n = 4) {
  const vistas = new Set();
  const salida = [];
  for (const t of tracks ?? []) {
    const u = urlDe(t);
    if (!u || vistas.has(u)) continue;
    vistas.add(u);
    salida.push({ src: u, texto: t.titulo ?? '' });
    if (salida.length >= n) return salida;
  }
  for (const t of tracks ?? []) {
    if (salida.length >= n) break;
    if (!urlDe(t)) salida.push({ src: null, texto: t.titulo ?? '' });
  }
  while (salida.length < n) salida.push({ src: null, texto: '' });
  return salida;
}

export const sinTildes = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
