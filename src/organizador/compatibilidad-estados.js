// src/organizador/compatibilidad-estados.js
// R2: matriz de compatibilidad estado x género. Pura y compartida por la recalificación de moods, el paso
// «alimentar estados» y el organizador, para que ningún camino meta una canción en un estado que su género contradice.
//   DURA   veta siempre (también lo heredado de una lista importada); solo lo que el usuario hace a mano la salta.
//   BLANDA necesita una señal más (p. ej. una palabra del título) antes de aceptar el estado.
import { ID_BSO } from './migrar-moods.js';

export const VETOS_DUROS = {
  tranquilo: ['pop-bailable', 'electronica', 'reggaeton', 'salsa', 'rock'],
  'con-energia': ['instrumental', 'acustico', 'chillout-lounge', 'folk-country'],
  'de-fiesta': ['instrumental', 'acustico', 'chillout-lounge', 'folk-country'],
  melancolico: ['pop-bailable', 'electronica', 'reggaeton', 'salsa'],
  feliz: [],
  inspirado: ['reggaeton', 'salsa'],
};

export const VETOS_BLANDOS = {
  tranquilo: ['pop', 'rock-alternativo', 'rock-espanol', 'latino', 'soul-hip-hop', 'tango'],
  melancolico: ['rock'],
  'con-energia': ['tango'],
  'de-fiesta': ['tango', 'rock-espanol'],
  feliz: ['folk-country'],
  inspirado: [],
};

export const vetoDuro = (estadoId, generoId) => !!generoId && (VETOS_DUROS[estadoId] ?? []).includes(generoId);
export const vetoBlando = (estadoId, generoId) => !!generoId && (VETOS_BLANDOS[estadoId] ?? []).includes(generoId);

/** Palabras del título que justifican un estado aunque su género lo vete «blandamente». */
export const TITULO_APOYA = {
  tranquilo: /chill|calm|relax|sleep|lofi|lo-fi|piano|acoustic|ambient|peace|study|slow|soft|mellow/i,
  melancolico: /\b(sad|cry|crying|alone|lonely|tears?|broken|goodbye|triste|llorar|soledad)\b/i,
};

export const apoyaElTitulo = (estadoId, titulo) => !!TITULO_APOYA[estadoId]?.test(titulo ?? '');

/** Género principal (no Bandas sonoras) de una canción, dado el conjunto de ids de género. */
export function generoPrincipalDe(track, idsGenero) {
  return (track.ejes ?? []).find((x) => idsGenero.has(x.ejeId) && x.ejeId !== ID_BSO)?.ejeId ?? null;
}

/**
 * R2 para música nueva que acaba de recibir género: si el género recién puesto veta (duro) un estado que la
 * canción ya tenía, manda lo que puso el usuario a mano; si el estado era automático (o de lista) se quita.
 * `anadidos`: ids de eje que la canción ha ganado ahora. Devuelve { ejes, quitados, anulados } sin mutar.
 */
export function resolverVetosDeGeneroNuevo(ejesTrack, anadidos, idsGenero) {
  const nuevoGenero = (anadidos ?? []).find((id) => idsGenero.has(id) && id !== ID_BSO);
  if (!nuevoGenero) return { ejes: ejesTrack, quitados: [], anulados: [] };
  const quitados = [];
  const anulados = [];
  const ejes = ejesTrack.filter((x) => {
    if (!vetoDuro(x.ejeId, nuevoGenero)) return true;
    if (x.origen === 'manual') {
      anulados.push(nuevoGenero);
      return true;
    }
    quitados.push(x.ejeId);
    return false;
  });
  return { ejes: anulados.length ? ejes.filter((x) => x.ejeId !== nuevoGenero) : ejes, quitados, anulados };
}
