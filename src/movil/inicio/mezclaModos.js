// src/movil/inicio/mezclaModos.js
// «Mezcla de dos modos»: pareja sugerida (los más escuchados que suenan parecido) y una
// cola que empieza en el modo A, pasa por las canciones «puente» (parecidas a ambos) y
// acaba en B. Puro.
import { barajarConMemoria } from '../barajar.js';
import { filtrarNoMeGusta } from '../noMeGusta.js';
import { centroide, claveDia, coseno, rngDeSemilla, ultimaVezPorTrack, vectorDeFn } from './comun.js';

const MIN_CANCIONES = 6;

export const modoValido = (e, conteos) =>
  !!e && !e.sistema && e.activo !== false && e.tipo !== 'playlist' && (conteos.get(e.id) ?? 0) >= MIN_CANCIONES;

const delModo = (tracks, ejeId) => tracks.filter((t) => (t.ejes ?? []).some((x) => x.ejeId === ejeId));

/** Parecido entre dos modos: coseno de sus centroides si hay vectores; si no, solapamiento de canciones. */
export function parecidoEntreModos(a, b, tracks, vectores) {
  const A = delModo(tracks, a);
  const B = delModo(tracks, b);
  const vec = vectorDeFn(vectores);
  const cA = centroide(A.map(vec).filter(Boolean));
  const cB = centroide(B.map(vec).filter(Boolean));
  if (cA && cB) return coseno(cA, cB);
  const idsA = new Set(A.map((t) => t.id));
  const comunes = B.filter((t) => idsA.has(t.id)).length;
  return comunes / Math.max(1, Math.min(A.length, B.length));
}

/**
 * Los dos modos más escuchados que tengan canciones parecidas: entre los 5 más
 * escuchados, la pareja de mayor parecido. Devuelve [ejeA, ejeB] (A = el más escuchado) o null.
 */
export function sugerirPareja({ ejes, tracks, historial = [], vectores = [], conteos }) {
  const escuchas = new Map();
  for (const h of historial) if (h?.ejeId) escuchas.set(h.ejeId, (escuchas.get(h.ejeId) ?? 0) + 1);
  const validos = (ejes ?? [])
    .filter((e) => modoValido(e, conteos))
    .sort((a, b) => (escuchas.get(b.id) ?? 0) - (escuchas.get(a.id) ?? 0) || (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  if (validos.length < 2) return null;
  const top = validos.slice(0, 5);
  let mejor = null;
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      const s = parecidoEntreModos(top[i].id, top[j].id, tracks, vectores);
      if (!mejor || s > mejor.s) mejor = { s, par: [top[i], top[j]] };
    }
  }
  return mejor.par;
}

/**
 * Cola A → puentes → B (≈ un tercio cada tramo). Con vectores, «puente» = la que mejor se
 * parece a la vez a los dos; sin ellos, las que están en los dos modos.
 * @returns {Array} canciones en el orden en que deben sonar
 */
export function generarMezclaModos({ ejeA, ejeB, tracks: todas, historial = [], vectores = [], ahora = Date.now(), n = 30, marcas = [] }) {
  const tracks = filtrarNoMeGusta(todas, marcas);
  const rng = rngDeSemilla(`${claveDia(ahora)}:mezcla:${ejeA}:${ejeB}`);
  const ultima = ultimaVezPorTrack(historial, tracks);
  const A = delModo(tracks, ejeA);
  const B = delModo(tracks, ejeB);
  const vec = vectorDeFn(vectores);
  const cA = centroide(A.map(vec).filter(Boolean));
  const cB = centroide(B.map(vec).filter(Boolean));
  const idsA = new Set(A.map((t) => t.id));
  const idsB = new Set(B.map((t) => t.id));

  // posición 0 (puro A) .. 1 (puro B) y qué tan «puente» es (0..1)
  const medir = (t) => {
    const v = vec(t);
    if (cA && cB && v) {
      const sA = Math.max(0, coseno(v, cA));
      const sB = Math.max(0, coseno(v, cB));
      const pos = sA + sB === 0 ? 0.5 : sB / (sA + sB);
      return { pos, puente: Math.min(sA, sB) };
    }
    const enA = idsA.has(t.id);
    const enB = idsB.has(t.id);
    if (enA && enB) return { pos: 0.5, puente: 1 };
    return { pos: enB ? 1 : 0, puente: 0 };
  };

  const uno = Math.max(1, Math.floor(n / 3));
  const usadas = new Set();
  const medidas = new Map();
  const info = (t) => {
    if (!medidas.has(t.id)) medidas.set(t.id, medir(t));
    return medidas.get(t.id);
  };

  // Puentes: de la biblioteca entera si hay vectores (aunque no estén en ningún modo), si no, las comunes.
  const conVectores = !!(cA && cB);
  const base = conVectores ? tracks.filter((t) => vec(t)) : tracks.filter((t) => idsA.has(t.id) && idsB.has(t.id));
  const puentes = [...base]
    .sort((x, y) => info(y).puente - info(x).puente)
    .slice(0, uno)
    .sort((x, y) => info(x).pos - info(y).pos);
  puentes.forEach((t) => usadas.add(t.id));

  const tramo = (lista, k) => {
    const libres = lista.filter((t) => !usadas.has(t.id));
    const porId = new Map(libres.map((t) => [t.id, t]));
    const elegidas = barajarConMemoria([...porId.keys()], ultima, ahora, rng).slice(0, k).map((id) => porId.get(id));
    elegidas.forEach((t) => usadas.add(t.id));
    return elegidas.sort((x, y) => info(x).pos - info(y).pos); // de lo más «A» a lo más cercano al puente
  };
  const parteA = tramo(A, uno);
  const parteB = tramo(B, n - uno - puentes.length > 0 ? n - uno - puentes.length : uno);
  // A: del fondo de A hacia el puente (pos ascendente). B: del puente al fondo de B (pos ascendente).
  return [...parteA, ...puentes, ...parteB];
}
