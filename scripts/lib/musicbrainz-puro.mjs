/**
 * Helpers puros de MusicBrainz (sin red ni disco), compartidos por el
 * enriquecimiento del PC (enriquecer-musicbrainz-core.mjs) y el del móvil
 * (src/organizador/enriquecer-movil.js).
 */

export const PALABRAS_EDICION =
  '(?:Remaster(?:ed|izado)?|Radio Edit|Radio Mix|Single Mix|Extended Mix|' +
  'Live|Mono|Stereo|Deluxe|Remix|Edit|Version)';

export function tituloParaBuscar(titulo) {
  let t = titulo;
  let anterior;
  do {
    anterior = t;
    t = t.replace(new RegExp(`\\s*[-–]\\s*[^-–(]*\\b${PALABRAS_EDICION}\\b[^-–]*$`, 'i'), '');
    t = t.replace(new RegExp(`\\s*\\([^)]*\\b${PALABRAS_EDICION}\\b[^)]*\\)\\s*$`, 'gi'), '');
  } while (t !== anterior && t.trim().length > 0);

  return t
    .replace(/\s*\((feat\.|with)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Quita UN grupo final entre paréntesis o corchetes, o null si no hay nada
 * que quitar.
 *
 * `tituloParaBuscar` ya saca los sufijos de edición que conoce (Remaster,
 * Live, Remix, feat...), pero un import puede traer pegado cualquier otra
 * cosa que no es parte del título: el nombre del álbum o de la gira. Caso
 * real: 17 tracks de Soda Stereo importados como "Prófugos (SEP7IMO DIA)",
 * que MusicBrainz nunca iba a encontrar — y sin ficha de MusicBrainz no hay
 * género, así que quedaban sin clasificar para siempre.
 *
 * Esto NO reemplaza al título: es el segundo intento, y solo cuando el
 * primero no encontró nada (ver el loop de enriquecerMusicbrainz). Importa
 * que sea así: "This Girl (Kungs Vs. Cookin' On 3 Burners)" o "Girls Like
 * You (Cardi B Version)" tienen el paréntesis como parte del título de
 * verdad, y recortarlos de entrada empeoraría un match que hoy funciona.
 */
export function tituloSinSufijoFinal(titulo) {
  const recortado = titulo.replace(/\s*[([][^()[\]]*[)\]]\s*$/, '').trim();
  if (!recortado || recortado === titulo.trim()) return null;
  return recortado;
}

export function escaparLucene(s) {
  return s.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');
}

export function normalizarTitulo(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function elegirCandidato(candidatos, tituloBuscado) {
  const objetivo = normalizarTitulo(tituloBuscado);
  const exacto = candidatos.find((r) => normalizarTitulo(r.title) === objetivo);
  if (exacto) return { rec: exacto, exacto: true };
  const mejor = candidatos[0];
  return mejor ? { rec: mejor, exacto: false } : null;
}

export const TIPOS_NO_ORIGINALES = new Set(['Compilation', 'Live', 'Remix', 'DJ-mix', 'Soundtrack']);
export const PALABRAS_TITULO_NO_ORIGINAL =
  /\b(live|concert|en vivo|anniversary|aniversario|reissue|reedici[oó]n|record store day|rsd)\b/i;

export function esEdicionOriginal(release) {
  const secundarios = release['release-group']?.['secondary-types'] ?? [];
  if (secundarios.some((t) => TIPOS_NO_ORIGINALES.has(t))) return false;
  return !PALABRAS_TITULO_NO_ORIGINAL.test(release.title ?? '');
}

export function elegirAlbumYAnio(releases) {
  const conFecha = (releases ?? [])
    .filter((r) => r.date && /^\d{4}/.test(r.date))
    .map((r) => ({ titulo: r.title, anio: Number(r.date.slice(0, 4)), original: esEdicionOriginal(r) }))
    .sort((a, b) => a.anio - b.anio);

  if (conFecha.length === 0) return { album: null, anio: null };

  const originales = conFecha.filter((r) => r.original);
  const elegido = (originales.length > 0 ? originales : conFecha)[0];
  return { album: elegido.titulo, anio: elegido.anio };
}
