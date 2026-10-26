/**
 * Elige los géneros más relevantes de la ficha de un artista en MusicBrainz,
 * a partir de la lista cruda que devuelve la API (`artist/{mbid}?inc=genres`):
 * cada entrada trae `count`, cuántos votos de la comunidad tiene ese tag
 * para ese artista. Ver docs/superpowers/specs/
 * 2026-09-14-filtro-generos-musicbrainz-design.md para la investigación en
 * vivo que fundamenta estos números: TODO el ruido detectado (para Nirvana,
 * Rosalía, Soda Stereo) tenía exactamente 1 voto.
 *
 * - Descarta cualquier tag con menos de 2 votos: sin consenso real de la
 *   comunidad, es más honesto no asignarle nada de MusicBrainz a ese
 *   artista que fingir una evidencia floja.
 * - De lo que queda, se conservan los 3 con más votos.
 * - Empate: orden alfabético — verificado que los empates son comunes, no
 *   un caso raro (Rosalía y Soda Stereo empatan de verdad en su top 3).
 */
const PISO_VOTOS = 2;
const MAX_GENEROS = 3;

export function elegirGenerosRelevantes(generosConVotos) {
  return (generosConVotos ?? [])
    .map((g) => ({ name: g?.name, count: g?.count ?? 0 }))
    .filter((g) => g.name && g.count >= PISO_VOTOS)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_GENEROS)
    .map((g) => g.name);
}
