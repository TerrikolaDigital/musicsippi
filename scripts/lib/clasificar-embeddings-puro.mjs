import { similitudCoseno } from './similitud.mjs';

export const MODELO_EMBEDDING = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const UMBRAL_SCORE = 0.44;
export const MARGEN_MINIMO = 0.08;

// Prefijo de contexto fijo para embeber términos de género sueltos — ver
// embeberTermino() más abajo para el porqué.
export const PREFIJO_TERMINO_GENERO = 'género musical: ';

/**
 * Embebe un término de género corto (p.ej. "grunge") de forma confiable
 * para compararlo con similitudCoseno contra otro término.
 *
 * Comparar dos términos sueltos embebidos directo (sin este ajuste) puede
 * dar una similitud sorprendentemente alta incluso sin relación real —
 * medido en vivo, "grunge" y "vallenato" dieron 0.732 — porque el modelo
 * (pensado para frases/oraciones, no palabras sueltas) no tiene suficiente
 * señal para discriminar. Agregar un prefijo de contexto sin más ("género
 * musical: " + término, comparado directo) empeora todavía más las cosas:
 * sube la similitud en general, entre CUALQUIER par, relacionado o no.
 *
 * Lo que sí funciona: embeber con el prefijo, pero restar el embedding del
 * prefijo SOLO (sin término) antes de comparar. Eso cancela la dirección
 * compartida que dominaba la comparación cuando se comparaba directo —
 * mismo caso real baja de 0.732 a 0.321. El baseline (embedding del
 * prefijo solo) es siempre el mismo vector, así que se calcula una sola
 * vez y se cachea a nivel de módulo.
 *
 * Ver docs/superpowers/specs/2026-09-09-umbral-clustering-terminos-design.md
 * para la investigación completa (incluye por qué se descartaron los otros
 * dos enfoques evaluados).
 */
/** embeberTermino (ver el comentario de arriba) sobre cualquier `embeber`: el PC usa el fp32, el móvil el cuantizado. */
export function crearEmbeberTermino(embeber) {
  let baseline = null;
  return async function embeberTermino(termino) {
    if (!baseline) baseline = await embeber(PREFIJO_TERMINO_GENERO.trim());
    const vector = await embeber(PREFIJO_TERMINO_GENERO + termino);
    const centrado = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) centrado[i] = vector[i] - baseline[i];
    return centrado;
  };
}

export function textoDeTrack(track, extras = {}) {
  const { generos = [], canal = '', tags = [], descripcion = '' } = extras;
  const partes = [`${track.artista} — ${track.titulo}.`];
  if (generos.length) partes.push(`Géneros: ${generos.join(', ')}.`);
  if (canal) partes.push(`Canal: ${canal}.`);
  if (tags.length) partes.push(`Etiquetas: ${tags.join(', ')}.`);
  if (descripcion) partes.push(`Descripción: ${descripcion}.`);
  return partes.join(' ');
}

/**
 * Géneros para el TEXTO del vector: la evidencia (MusicBrainz, Deezer, descripción, título) más los nombres de los
 * moods de género (familia 'genero') que la canción ya tiene. Así una canción sin ninguna fuente externa pero con su
 * género puesto (a mano o por la recalificación) no se embebe solo con «artista — título». Solo va al texto del
 * vector: la evidencia con la que se descubren y asignan modos sigue siendo solo la externa.
 */
export function generosParaVector(track, generosEvidencia = [], ejesPorId = new Map()) {
  const generos = [...generosEvidencia];
  for (const { ejeId } of track.ejes ?? []) {
    const eje = ejesPorId.get(ejeId);
    if (eje?.familia === 'genero' && !generos.includes(eje.nombre)) generos.push(eje.nombre);
  }
  return generos;
}

export function textoDeEje(eje) {
  const partes = [`${eje.nombre}.`];
  if (eje.tagsLastfm?.length) partes.push(`Géneros: ${eje.tagsLastfm.join(', ')}.`);
  if (eje.anclas?.artistas?.length) partes.push(`Artistas: ${eje.anclas.artistas.slice(0, 10).join(', ')}.`);
  return partes.join(' ');
}

export function ejesClasificables(ejes) {
  return ejes.filter((e) => e.activo && !e.sistema && (e.tipo === 'gusto' || e.tipo === 'funcional'));
}

export function clasificarPorEmbeddings(vectorTrack, embEjes) {
  const puntajes = embEjes
    .map((e) => ({ ejeId: e.ejeId, score: similitudCoseno(vectorTrack, e.emb) }))
    .sort((a, b) => b.score - a.score);
  const [mejor, segundo] = puntajes;
  if (!mejor || mejor.score < UMBRAL_SCORE) return null;
  if (segundo && mejor.score - segundo.score < MARGEN_MINIMO) return null;
  return { ejeId: mejor.ejeId, confianza: mejor.score };
}

/**
 * Variante de clasificarPorEmbeddings() para la sugerencia de clasificación
 * manual asistida (Tarea 17, ClasificacionAsistida en src/App.jsx):
 * clasificarPorEmbeddings() devuelve null si el mejor score no llega a
 * UMBRAL_SCORE o si el margen con el segundo no llega a MARGEN_MINIMO — eso
 * es correcto para clasificación AUTOMÁTICA (no adivinar sin confianza). Acá
 * se necesita lo contrario: el mejor candidato SIEMPRE, aunque el score sea
 * bajo, para mostrarlo como sugerencia que la persona aprueba, cambia o
 * descarta a mano. Mismo ranking que clasificarPorEmbeddings, sin el filtro
 * de umbral/margen.
 */
export function mejorCandidato(vectorTrack, embEjes) {
  const puntajes = embEjes
    .map((e) => ({ ejeId: e.ejeId, score: similitudCoseno(vectorTrack, e.emb) }))
    .sort((a, b) => b.score - a.score);
  const [mejor] = puntajes;
  return mejor ? { ejeId: mejor.ejeId, confianza: mejor.score } : null;
}
