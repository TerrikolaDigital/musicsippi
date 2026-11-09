// src/data/elegir-version.js
// Elección de versión (como el TrackMatcher de BitChord). YouTube Music devuelve la de
// estudio casi siempre primero, pero no siempre: directos, remixes, otra canción del mismo
// artista o la misma canción de otro artista. Y el metadato que se ve es el de la biblioteca,
// no el del vídeo, así que un cover no se nota hasta que suena.
//
// Por eso primero se clasifica por niveles y solo después se puntúa: un cover con mismo título
// y duración sumaba casi lo mismo que el original, y la duración no distingue una versión de
// otra. Nunca se descarta del todo: mejor una versión rara que silencio.

// Lo que hace que un resultado NO sea la canción aunque se llame igual.
const COVER = /\b(covers?|karaoke|tribute|tributo|homenaje|made famous|in the style|originally performed|rendition|sings|canta|interpretacion)\b/;
const VARIANTES = /\b(live|en vivo|en directo|directo|remix|instrumental|sped up|slowed|acoustic|acustic[oa]|8d|nightcore|reverb)\b/;
// Lo que los vídeos añaden al título sin cambiar la canción.
const RELLENO = new Set(['official', 'oficial', 'music', 'musica', 'video', 'videoclip', 'clip', 'audio', 'lyric', 'lyrics', 'letra', 'visualizer', 'hd', 'hq', '4k']);

const NIVEL_FIEL = 0;
const NIVEL_VARIANTE = 1;
const NIVEL_OTRO_ARTISTA = 2;
const NIVEL_COVER = 3;
const NIVEL_OTRA_CANCION = 4;

// Un vídeo sin duración de referencia y más largo que esto es un recopilatorio o un bucle.
const VIDEO_DEMASIADO_LARGO_S = 1200;
const MARGEN_DURACION_VIDEO_S = 90;

function normalizar(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\((?:feat|ft|with|con)[^)]*\)|\[(?:feat|ft)[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sinParentesis(s) {
  return normalizar(String(s ?? '').replace(/[([][^)\]]*[)\]]/g, ' '));
}

const contienePalabras = (texto, parte) => ` ${texto} `.includes(` ${parte} `);

function parecido(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Contener al otro solo cuenta si es por palabras enteras: «cloud» no es un trozo de «thunderclouds».
  if (contienePalabras(a, b) || contienePalabras(b, a)) return 0.75;
  const ta = new Set(a.split(' '));
  const tb = b.split(' ');
  const comunes = tb.filter((t) => ta.has(t)).length;
  return comunes / Math.max(ta.size, tb.length);
}

const compacto = (s) => s.replace(/ /g, '');

function nombreDeCanal(nombre) {
  return normalizar(nombre).replace(/ topic$/, '').replace(/ ?vevo$/, '').trim();
}

// Invitados citados en el título: «Thunderclouds (feat. Sia, Diplo & Labrinth)» → «sia diplo labrinth».
function invitadosDelTitulo(titulo) {
  const grupos = String(titulo ?? '').match(/[([]\s*(?:feat|ft|featuring|with|con)\b[^)\]]*/gi) ?? [];
  return grupos.map((g) => normalizar(g.replace(/^[([]\s*(?:feat|ft|featuring|with|con)\b/i, ' '))).join(' ');
}

function artistaCoincide(c, artistaRef) {
  if (artistaRef && contienePalabras(invitadosDelTitulo(c.titulo), artistaRef)) return true;
  return c.artistas.some((a) => {
    const n = nombreDeCanal(a);
    if (!n || COVER.test(n)) return false;
    return compacto(n) === compacto(artistaRef) || contienePalabras(n, artistaRef) || contienePalabras(artistaRef, n);
  });
}

// El título de un vídeo sin el artista ni el relleno: «Ray LaMontagne - How Come (HD)» → «how come».
function tituloDelCandidato(c, ref, artistaRef) {
  const base = sinParentesis(c.titulo);
  if (c.tipo !== 'video') return base;
  const sinArtista = artistaRef ? ` ${base} `.replace(` ${artistaRef} `, ' ').trim() : base;
  const propias = new Set(sinParentesis(ref.titulo).split(' '));
  return sinArtista.split(' ').filter((t) => !RELLENO.has(t) || propias.has(t)).join(' ');
}

const demasiadoLargo = (c, ref) =>
  c.tipo === 'video' &&
  (ref.duracionS && c.duracion
    ? Math.abs(ref.duracionS - c.duracion) > MARGEN_DURACION_VIDEO_S
    : c.duracion > VIDEO_DEMASIADO_LARGO_S);

function analizar(c, ref) {
  const artistaRef = normalizar(ref.artista);
  const tituloRef = normalizar(ref.titulo);
  const tituloCompleto = normalizar(c.titulo);
  const tituloCand = tituloDelCandidato(c, ref, artistaRef);
  // Sin letras latinas (米津玄師) normalizar deja la cadena vacía: no se puede comparar.
  const artistaDesconocido = !artistaRef;
  const artistaOk = artistaDesconocido || artistaCoincide(c, artistaRef);
  const enTitulo = c.tipo === 'video' && !!artistaRef && contienePalabras(tituloCompleto, artistaRef);
  // El título sin paréntesis tiene que coincidir, pero también vale el que lleva la variante
  // dentro: «I Feel Love - Afrojack Remix» frente a «I Feel Love (Afrojack Remix)».
  const similitud = Math.max(
    parecido(sinParentesis(ref.titulo), tituloCand),
    parecido(tituloRef, c.tipo === 'video' ? tituloDelCandidato({ ...c, titulo: tituloCompleto }, ref, artistaRef) : tituloCompleto)
  );
  const cover = COVER.exec(tituloCompleto);
  const variante = VARIANTES.exec(tituloCompleto);
  return {
    artistaOk,
    enTitulo,
    similitud,
    tituloOk: similitud >= 0.75,
    esCover: !!cover && !tituloRef.includes(cover[1]),
    esVariante: !!variante && !tituloRef.includes(variante[1]),
  };
}

function nivelDe(a, c, ref) {
  if (!a.tituloOk) return NIVEL_OTRA_CANCION;
  if (a.esCover) return NIVEL_COVER;
  if (!a.artistaOk && !a.enTitulo) return NIVEL_OTRO_ARTISTA;
  return a.esVariante || demasiadoLargo(c, ref) ? NIVEL_VARIANTE : NIVEL_FIEL;
}

export function nivelDeVersion(c, ref) {
  return nivelDe(analizar(c, ref), c, ref);
}

function puntuar(c, ref, a) {
  let p = 2 * a.similitud;
  if (a.artistaOk) p += 1.5;
  if (ref.duracionS && c.duracion) {
    const dif = Math.abs(ref.duracionS - c.duracion);
    p += dif <= 3 ? 1.5 : dif <= 10 ? 0.9 : dif <= 30 ? 0.2 : -1.5;
  }
  if (demasiadoLargo(c, ref)) p -= 3;
  // A igualdad, la pista de audio: sin intro de videoclip.
  if (c.tipo !== 'video') p += 0.5;
  return p;
}

export function ordenarPorParecido(candidatos, ref) {
  if (!ref) return candidatos;
  return candidatos
    .map((c, i) => {
      const a = analizar(c, ref);
      return { c, i, nivel: nivelDe(a, c, ref), p: puntuar(c, ref, a) };
    })
    // Empate: se respeta el orden de YouTube Music (su relevancia ya cuenta).
    .sort((x, y) => x.nivel - y.nivel || y.p - x.p || x.i - y.i)
    .map((x) => x.c);
}

export function hayVersionFiel(candidatos, ref) {
  return candidatos.some((c) => nivelDeVersion(c, ref) === NIVEL_FIEL);
}

/**
 * Para un vídeo ya guardado: el id por el que cambiarlo, o null si no hay que tocarlo. Sin una
 * versión fiel entre los resultados no se cambia: no se sabe si el guardado es peor.
 */
export function mejorVersionParaRevisar(guardado, candidatos, ref) {
  const actual = candidatos.find((c) => c.videoId === guardado);
  if (actual && nivelDeVersion(actual, ref) === NIVEL_FIEL) return null;
  const mejor = ordenarPorParecido(candidatos, ref)[0];
  return mejor && nivelDeVersion(mejor, ref) === NIVEL_FIEL ? mejor.videoId : null;
}
