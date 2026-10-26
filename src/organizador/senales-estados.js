// src/organizador/senales-estados.js
// «Alimentar estados»: los ESTADOS (Zen, Power, Party, Blue, Sunny, Dream) con
// «Se rellena sola» activado se llenan con señales, y una canción entra en un estado solo si coinciden
// AL MENOS DOS señales distintas. Todo puro: no toca disco ni red.
//
// Señales (cada tipo cuenta una sola vez por estado):
//   ritmo      bpm de Deezer (umbrales en BANDAS_BPM).
//   etiquetas  etiquetas de ánimo de MusicBrainz (happy, sad, chill, party…), canción antes que álbum.
//   parecido   la mayoría de sus k vecinos más cercanos (vectores del organizador) ya están en ese estado.
//   genero     género principal de la canción (señal DÉBIL, mapa en GENERO_A_ESTADOS).
//   uso        saldo de escuchas desde el chip «¿Cómo te sientes?»: escuchada > 70 % suma, saltada < 30 % resta.
//   palabras-genero / palabras-texto  «Palabras para afinar» del estado (`eje.palabras`): una coincidencia con un
//              género (MusicBrainz/Deezer o sus moods de género) suma «palabras-genero» y otra con título, artista
//              o álbum suma «palabras-texto». Son dos señales distintas para que unas palabras bien elegidas
//              puedan bastar solas (género + título); un único tipo de coincidencia nunca basta.
// Lo que el usuario pone a mano manda siempre (ya está dentro y nunca se toca) y si lo quita, `exclusiones`
// impide volver a meterla. Un saldo de uso negativo también la deja fuera.
import { familiaDe, seRellenaSola } from '../movil/modos.js';
import { sinTildes } from '../movil/inicio/comun.js';
import { esSinModo } from './sin-modo.js';
import { vetoBlando, vetoDuro } from './compatibilidad-estados.js';
import { ID_BSO } from './migrar-moods.js';

export const ESTADOS_ALIMENTABLES = ['tranquilo', 'con-energia', 'de-fiesta', 'melancolico', 'feliz', 'inspirado'];
export const SENAL_ESTADO = 'senales-estado';
export const MINIMO_SENALES = 2;

/**
 * Bandas de tempo (pulsaciones por minuto). Documentadas porque son una decisión de producto:
 *  - Power: ≥ 120 (ritmo de entrenar/correr).
 *  - Party: 100–140 (zona de baile: house ~125, pop bailable ~118, reggaetón/latino ~95-105 queda en el borde).
 *  - Zen: ≤ 90.
 *  - Blue: ≤ 80 (más lento todavía; sin otra señal no entra).
 * Un bpm de 0 o ausente significa «Deezer no lo sabe» y no cuenta como señal.
 */
export const BANDAS_BPM = {
  'con-energia': { min: 120 },
  'de-fiesta': { min: 100, max: 140 },
  tranquilo: { max: 90 },
  melancolico: { max: 80 },
};

export function estadosPorRitmo(bpm) {
  const n = Number(bpm);
  if (!Number.isFinite(n) || n <= 0) return [];
  return Object.entries(BANDAS_BPM)
    .filter(([, b]) => (b.min === undefined || n >= b.min) && (b.max === undefined || n <= b.max))
    .map(([id]) => id);
}

/** Etiquetas de ánimo de MusicBrainz (en minúsculas, sin guiones) → estados que apoyan. */
export const ETIQUETAS_ANIMO = {
  happy: ['feliz'],
  joyful: ['feliz'],
  cheerful: ['feliz'],
  'feel good': ['feliz'],
  feelgood: ['feliz'],
  fun: ['feliz'],
  uplifting: ['feliz', 'inspirado'],
  sad: ['melancolico'],
  melancholy: ['melancolico'],
  melancholic: ['melancolico'],
  nostalgic: ['melancolico'],
  heartbreak: ['melancolico'],
  depressing: ['melancolico'],
  bittersweet: ['melancolico'],
  chill: ['tranquilo'],
  chillout: ['tranquilo'],
  relaxing: ['tranquilo'],
  relaxed: ['tranquilo'],
  calm: ['tranquilo'],
  mellow: ['tranquilo'],
  peaceful: ['tranquilo'],
  soothing: ['tranquilo'],
  party: ['de-fiesta'],
  club: ['de-fiesta'],
  'dance party': ['de-fiesta'],
  energetic: ['con-energia'],
  energy: ['con-energia'],
  workout: ['con-energia'],
  powerful: ['con-energia'],
  driving: ['con-energia'],
  inspirational: ['inspirado'],
  inspiring: ['inspirado'],
  dreamy: ['inspirado'],
  epic: ['inspirado'],
};

/**
 * Género principal (id de la taxonomía de moods) → estados que apoya. Señal débil: nunca basta sola, y como el
 * mínimo es de 2 señales distintas, «Sunny» por Pop/Soul/Latino solo entra si hay otra señal (etiqueta, uso, parecido).
 * El ritmo (bpm) y el género tampoco bastan solos.
 */
export const GENERO_A_ESTADOS = {
  'pop-bailable': ['de-fiesta', 'con-energia'],
  latino: ['de-fiesta', 'feliz'], // incluye reggaetón
  electronica: ['de-fiesta', 'con-energia'],
  'chillout-lounge': ['tranquilo'],
  instrumental: ['tranquilo', 'inspirado'],
  acustico: ['tranquilo', 'melancolico'],
  'folk-country': ['melancolico'],
  tango: ['melancolico'],
  'soul-hip-hop': ['feliz'],
  pop: ['feliz'],
  rock: ['con-energia'],
  'rock-alternativo': ['con-energia'],
  'bandas-sonoras': ['inspirado'],
};

export function estadosPorGenero(generoIds) {
  return [...new Set((generoIds ?? []).flatMap((g) => GENERO_A_ESTADOS[g] ?? []))];
}

/** Palabras de afinado de un estado: texto limpio, sin tildes, en minúsculas y sin repetir. */
export function palabrasDe(eje) {
  const crudas = Array.isArray(eje?.palabras) ? eje.palabras : [];
  return [...new Set(crudas.map((p) => sinTildes(p).replace(/\s+/g, ' ')).filter((p) => p.length >= 2))];
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ¿Alguna palabra aparece al empezar una palabra del texto? («romant» encuentra «Romántico»; «rock» no «crock»). */
export function coincidePalabras(palabras, texto) {
  const t = sinTildes(texto);
  if (!t || !palabras?.length) return false;
  return palabras.some((p) => new RegExp(`(^|[^a-z0-9ñ])${escapar(p)}`).test(t));
}

const limpiarEtiqueta =(s) => String(s ?? '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Estados que apoyan unas etiquetas (cualquier texto; solo cuentan las de ánimo conocidas). */
export function estadosPorEtiquetas(etiquetas) {
  const res = new Set();
  for (const e of etiquetas ?? []) for (const id of ETIQUETAS_ANIMO[limpiarEtiqueta(e)] ?? []) res.add(id);
  return [...res];
}

/** Etiquetas efectivas de una canción: las de la canción si dicen algo de ánimo; si no, las del álbum. */
export function etiquetasEfectivas(registro) {
  const cancion = registro?.mbCancion?.tags ?? [];
  if (estadosPorEtiquetas(cancion).length) return cancion;
  return registro?.mbAlbum?.tags ?? [];
}

export const UMBRAL_ESCUCHADA = 0.7;
export const UMBRAL_SALTADA = 0.3;

/** +1 si se escuchó más del 70 %, −1 si se saltó antes del 30 %, 0 entre medias. */
export function pasoDeUso(fraccion) {
  if (!Number.isFinite(fraccion)) return 0;
  if (fraccion > UMBRAL_ESCUCHADA) return 1;
  if (fraccion < UMBRAL_SALTADA) return -1;
  return 0;
}

/** Copia de `uso` ({trackId: {estadoId: saldo}}) con el saldo de esa canción y estado movido según `fraccion`. */
export function sumarUso(uso, trackId, estadoId, fraccion) {
  const paso = pasoDeUso(fraccion);
  if (paso === 0) return uso ?? {};
  const previo = uso?.[trackId]?.[estadoId] ?? 0;
  return { ...uso, [trackId]: { ...uso?.[trackId], [estadoId]: previo + paso } };
}

// --- Vecinos -------------------------------------------------------------------------------------

function normalizar(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const sal = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) sal[i] = v[i] / n;
  return sal;
}

/**
 * Índice de vecinos por coseno. `registros`: [{trackId, vector}]. `vecinosDe(id, k)` devuelve los k más
 * cercanos [{id, s}] (sin la propia), de mayor a menor parecido.
 */
export function crearIndiceVecinos(registros) {
  const ids = [];
  const vecs = [];
  for (const r of registros ?? []) {
    if (!r?.vector?.length) continue;
    ids.push(r.trackId);
    vecs.push(normalizar(r.vector));
  }
  const pos = new Map(ids.map((id, i) => [id, i]));
  return {
    tamano: ids.length,
    tiene: (id) => pos.has(id),
    vecinosDe(id, k) {
      const i = pos.get(id);
      if (i === undefined) return [];
      const a = vecs[i];
      const mejores = []; // ordenados de mayor a menor, máx. k
      for (let j = 0; j < vecs.length; j++) {
        if (j === i) continue;
        const b = vecs[j];
        let s = 0;
        for (let d = 0; d < a.length; d++) s += a[d] * b[d];
        if (mejores.length < k || s > mejores[mejores.length - 1].s) {
          let p = mejores.length;
          while (p > 0 && mejores[p - 1].s < s) p--;
          mejores.splice(p, 0, { id: ids[j], s });
          if (mejores.length > k) mejores.pop();
        }
      }
      return mejores;
    },
  };
}

export const K_VECINOS = 5;
export const MIN_VECINOS_EN_ESTADO = 2; // al menos 2 de 5 (con 3 casi nunca se cumplía: 25-oct)
export const PARECIDO_MINIMO = 0.6; // coseno mínimo para que un vecino cuente

// --- Alimentar -----------------------------------------------------------------------------------

/**
 * Estados que se pueden alimentar solos: familia estado, «Se rellena sola» activo y con reglas: los seis de
 * siempre, o cualquiera de «¿Cómo te sientes?» (`chipId`) o con palabras para afinar.
 */
export function estadosAlimentables(ejes) {
  return (ejes ?? []).filter(
    (e) =>
      familiaDe(e) === 'estado' &&
      e.activo !== false &&
      seRellenaSola(e) &&
      (ESTADOS_ALIMENTABLES.includes(e.id) || !!e.chipId || palabrasDe(e).length > 0),
  );
}

/**
 * Decide qué canciones entran en qué estado.
 * @param {object} p
 * @param {Array} p.tracks biblioteca (con `ejes`)
 * @param {Array} p.ejes ejes actuales
 * @param {Record<string, number>} [p.bpm] trackId → bpm (Deezer)
 * @param {Record<string, string[]>} [p.etiquetas] trackId → etiquetas de ánimo ya priorizadas (canción > álbum)
 * @param {Array<{trackId:string, vector:ArrayLike<number>}>} [p.vectores] embeddings del organizador
 * @param {Record<string, Record<string, number>>} [p.uso] trackId → estadoId → saldo de escuchas
 * @param {Record<string, string[]>} [p.exclusiones] trackId → estados de los que el usuario la quitó
 * @param {Record<string, string[]>} [p.generos] trackId → nombres de género (MusicBrainz/Deezer) para las palabras
 * @param {Record<string, string>} [p.albumes] trackId → álbum, para las palabras
 * @param {number} [p.minimo] señales distintas necesarias (2)
 * @returns {{propuestas: Array<{trackId, estadoId, senales: string[]}>, porEstado: object, candidatas: number}}
 */
export function alimentarEstados({ tracks, ejes, bpm = {}, etiquetas = {}, vectores = [], uso = {}, exclusiones = {}, generos = {}, albumes = {}, minimo = MINIMO_SENALES }) {
  const estados = estadosAlimentables(ejes);
  const palabrasDeEstado = new Map(estados.map((e) => [e.id, palabrasDe(e)]));
  const nombreGenero = new Map((ejes ?? []).filter((e) => familiaDe(e) === 'genero').map((e) => [e.id, e.nombre ?? '']));
  const ids = new Set(estados.map((e) => e.id));
  const porEstado = Object.fromEntries(estados.map((e) => [e.id, { nombre: e.nombre, n: 0, porSenal: {}, porCombinacion: {}, ya: 0 }]));
  const miembros = new Map(estados.map((e) => [e.id, new Set()]));
  for (const t of tracks ?? []) for (const x of t.ejes ?? []) miembros.get(x.ejeId)?.add(t.id);
  for (const e of estados) porEstado[e.id].ya = miembros.get(e.id).size;

  const esGenero = new Set((ejes ?? []).filter((e) => familiaDe(e) === 'genero').map((e) => e.id));
  const indice = crearIndiceVecinos(vectores);
  const cacheVecinos = new Map();
  const vecinos = (id) => {
    if (!cacheVecinos.has(id)) cacheVecinos.set(id, indice.vecinosDe(id, K_VECINOS));
    return cacheVecinos.get(id);
  };

  const propuestas = [];
  let candidatas = 0;
  for (const t of tracks ?? []) {
    // Una canción sin ningún mood se deja para el organizador de géneros: meterla ya en un estado la sacaría
    // de su cola y nunca recibiría género.
    if (esSinModo(t)) continue;
    candidatas++;
    const propios = new Set((t.ejes ?? []).map((x) => x.ejeId));
    const porRitmo = new Set(estadosPorRitmo(bpm[t.id]));
    const porEtiquetas = new Set(estadosPorEtiquetas(etiquetas[t.id]));
    const porGenero = new Set(estadosPorGenero([...propios].filter((id) => esGenero.has(id))));
    // R2: el género principal veta (duro) o pide una señal más (blando) a ciertos estados.
    const generoPrincipal = [...propios].find((id) => esGenero.has(id) && id !== ID_BSO) ?? null;
    // Textos donde buscar las palabras de afinado (solo se arman si algún estado las tiene).
    let textoGenero = null;
    let textoLibre = null;
    const generoDe = () =>
      (textoGenero ??= [...(generos[t.id] ?? []), ...[...propios].map((id) => nombreGenero.get(id)).filter(Boolean)].join(' | '));
    const libreDe = () => (textoLibre ??= [t.titulo, t.artista, albumes[t.id]].filter(Boolean).join(' | '));
    for (const e of estados) {
      if (propios.has(e.id)) continue; // ya está (a mano o antes): no se toca
      if ((exclusiones[t.id] ?? []).includes(e.id)) continue; // la quitó el usuario
      if (vetoDuro(e.id, generoPrincipal)) continue; // R2: su género lo contradice
      const exigidas = vetoBlando(e.id, generoPrincipal) ? minimo + 1 : minimo;
      const saldo = uso[t.id]?.[e.id] ?? 0;
      if (saldo < 0) continue; // la saltó más de lo que la escuchó
      const senales = [];
      if (porRitmo.has(e.id)) senales.push('ritmo');
      if (porEtiquetas.has(e.id)) senales.push('etiquetas');
      if (porGenero.has(e.id)) senales.push('genero');
      if (saldo > 0) senales.push('uso');
      const palabras = palabrasDeEstado.get(e.id);
      if (palabras.length) {
        if (coincidePalabras(palabras, generoDe())) senales.push('palabras-genero');
        if (coincidePalabras(palabras, libreDe())) senales.push('palabras-texto');
      }
      // Parecido es lo más caro: solo se calcula si con él se podría llegar al mínimo.
      if (senales.length >= exigidas - 1 && indice.tiene(t.id)) {
        const cerca = vecinos(t.id).filter((v) => v.s >= PARECIDO_MINIMO);
        if (cerca.filter((v) => miembros.get(e.id).has(v.id)).length >= MIN_VECINOS_EN_ESTADO) senales.push('parecido');
      }
      if (senales.length >= exigidas) {
        propuestas.push({ trackId: t.id, estadoId: e.id, senales });
        porEstado[e.id].n++;
        const combo = senales.join('+');
        porEstado[e.id].porCombinacion[combo] = (porEstado[e.id].porCombinacion[combo] ?? 0) + 1;
        for (const s of senales) porEstado[e.id].porSenal[s] = (porEstado[e.id].porSenal[s] ?? 0) + 1;
      }
    }
  }
  return { propuestas, porEstado, candidatas, estados: [...ids] };
}

/** Copia de `tracks` con las propuestas ya anotadas (origen auto, señal propia y qué señales coincidieron). */
export function aplicarPropuestas(tracks, propuestas) {
  const porTrack = new Map();
  for (const p of propuestas) {
    if (!porTrack.has(p.trackId)) porTrack.set(p.trackId, []);
    porTrack.get(p.trackId).push(p);
  }
  return tracks.map((t) => {
    const ps = porTrack.get(t.id);
    if (!ps) return t;
    const extra = ps
      .filter((p) => !(t.ejes ?? []).some((x) => x.ejeId === p.estadoId))
      .map((p) => ({ ejeId: p.estadoId, origen: 'auto', senal: SENAL_ESTADO, score: 1, senales: p.senales }));
    return extra.length ? { ...t, ejes: [...(t.ejes ?? []), ...extra] } : t;
  });
}
