// src/movil/historial.js
// Agrupa las entradas del historial por día (Hoy, Ayer o «dd de mes»), de la más nueva a la más vieja.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function agruparPorDia(entradas, hoy = new Date()) {
  const h = dia(hoy);
  const grupos = new Map();
  for (const e of [...entradas].sort((a, b) => b.ts - a.ts)) {
    const d = new Date(e.ts);
    const diff = Math.round((h - dia(d)) / 86400000);
    const etiqueta = diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : `${d.getDate()} de ${MESES[d.getMonth()]}`;
    if (!grupos.has(etiqueta)) grupos.set(etiqueta, []);
    grupos.get(etiqueta).push(e);
  }
  return [...grupos].map(([etiqueta, lista]) => ({ etiqueta, entradas: lista }));
}

/**
 * Canciones más sonadas (mismo cálculo que el Historial de escritorio): cuenta por
 * `trackId`; si alguna reproducción de la canción es de la biblioteca, esa copia gana
 * sobre una copia suelta (snapshot) más vieja.
 */
export function rankingCanciones(entradas, limite = 50) {
  const porTrack = new Map();
  for (const e of entradas) {
    const actual = porTrack.get(e.trackId) ?? { track: e.track, enBiblioteca: !!e.enBiblioteca, n: 0 };
    if (e.enBiblioteca) {
      actual.track = e.track;
      actual.enBiblioteca = true;
    }
    actual.n += 1;
    porTrack.set(e.trackId, actual);
  }
  return [...porTrack.values()].sort((a, b) => b.n - a.n).slice(0, limite);
}

/** Modos más sonados; ignora los que ya no existen (historial con un ejeId borrado). */
export function rankingModos(entradas, ejes, limite = 12) {
  const validos = new Set(ejes.map((e) => e.id));
  const porModo = new Map();
  for (const e of entradas) {
    if (!e.ejeId || !validos.has(e.ejeId)) continue;
    const actual = porModo.get(e.ejeId) ?? { ejeId: e.ejeId, nombre: e.ejeNombre ?? e.ejeId, n: 0 };
    actual.n += 1;
    porModo.set(e.ejeId, actual);
  }
  return [...porModo.values()].sort((a, b) => b.n - a.n).slice(0, limite);
}
