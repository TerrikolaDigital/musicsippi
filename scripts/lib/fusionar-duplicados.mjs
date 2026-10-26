/**
 * Detecta el mismo tema real acreditado distinto según la fuente — el caso real
 * que motivó esto: "Calvin Harris"+"Promises (with Sam Smith)" (spotify) vs
 * "Calvin Harris · Sam Smith"+"Promises" (youtube) vs "Calvin Harris"+"Promises"
 * (amazon), tres entradas para una sola canción. `idTrack()` no lo agarra porque
 * exige coincidencia EXACTA post-normalización (y tiene que seguir siéndolo: es
 * la clave estable entre corridas que usan cache-youtube.json,
 * metadata-musicbrainz.json y overrides.json — aflojarla ahí rompe esos tres
 * archivos en cada reimportación). Por eso esto es una segunda pasada, más laxa,
 * DESPUÉS de que la fuente ya aportó lo suyo.
 *
 * Extraído de scripts/importar.mjs (donde vivía como función privada) para que
 * también lo use el import hecho desde la app (POST /api/importar-tunemymusic,
 * vía aplicarFilasTuneMyMusic) — antes solo corría en el importador de
 * terminal, así que un duplicado como este (mismo tema, dos fuentes) que
 * entraba por la app quedaba sin fusionar.
 */

/**
 * Solo separa por " · ", ", " y " vs " — verificado contra los datos reales de
 * esta biblioteca (ver sesión de depuración). "&" queda afuera a propósito:
 * bandas reales lo llevan en el nombre ("Hootie & The Blowfish", "Chase &
 * Status"), separar ahí partiría esos nombres en vez de arreglar algo.
 */
export function normalizarTituloParaFusion(t) {
  return t
    .replace(/\s*[([](feat\.|ft\.|with)\s[^)\]]*[)\]]/gi, '')
    .trim()
    .toLowerCase();
}

export function separarArtistasParaFusion(nombre) {
  return nombre
    .split(/\s*·\s*|\s*,\s*|\s+vs\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function tieneFeatEnTitulo(t) {
  return /\s*[([](feat\.|ft\.|with)\s/i.test(t);
}

/**
 * Fusiona los grupos de duplicados detectados dentro de `tracks` (Map por id),
 * mutándolo in-place. Por cada grupo:
 *  - id ganador: el que ya tenga una resolución de YouTube cacheada (no tiene
 *    sentido gastar otra búsqueda de cuota si ya hay una), si no el de más fuentes.
 *  - artista: el crédito que menciona más colaboradores (el más completo).
 *  - título: preferentemente sin "(feat./with X)" redundante si el artista
 *    elegido ya lo acredita; si ninguno califica, el más corto.
 *  - fuentes y ejes: unión de todo el grupo (un eje manual le gana a uno auto
 *    para el mismo ejeId, nunca al revés).
 *
 * `cacheYoutube`: objeto de cache-youtube.json, o `{}` si no interesa ese
 * desempate (el resto de los criterios sigue aplicando igual).
 *
 * Devuelve un Map<idPerdido, idGanador> para que el llamador pueda re-mapear
 * cualquier referencia que haya quedado "colgada" de un id que dejó de existir.
 */
export function fusionarDuplicadosCruzados(tracks, cacheYoutube = {}) {
  const grupos = new Map();
  for (const t of tracks.values()) {
    const primerArtista = separarArtistasParaFusion(t.artista)[0]?.toLowerCase() ?? '';
    const clave = `${normalizarTituloParaFusion(t.titulo)}|||${primerArtista}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(t);
  }

  const idsFusionados = new Map();

  for (const candidatos of grupos.values()) {
    if (candidatos.length < 2) continue;

    const conCache = candidatos.filter((t) => Object.hasOwn(cacheYoutube, t.id));
    const ganador =
      conCache[0] ?? [...candidatos].sort((a, b) => b.fuentes.length - a.fuentes.length)[0];

    const mejorArtistaCand = [...candidatos].sort((a, b) => {
      const da = separarArtistasParaFusion(a.artista).length;
      const db = separarArtistasParaFusion(b.artista).length;
      if (db !== da) return db - da;
      return b.artista.length - a.artista.length;
    })[0];

    const sinFeat = candidatos.filter((t) => !tieneFeatEnTitulo(t.titulo));
    const tituloFinal = (sinFeat.length > 0 ? sinFeat : candidatos)
      .map((t) => t.titulo)
      .sort((a, b) => a.length - b.length)[0];

    const fuentesFinal = [...new Set(candidatos.flatMap((t) => t.fuentes))];

    const ejesFinal = [];
    const indicePorEje = new Map();
    for (const t of candidatos) {
      for (const e of t.ejes) {
        const idx = indicePorEje.get(e.ejeId);
        if (idx === undefined) {
          indicePorEje.set(e.ejeId, ejesFinal.length);
          ejesFinal.push(e);
        } else if (e.origen === 'manual' && ejesFinal[idx].origen !== 'manual') {
          ejesFinal[idx] = e;
        }
      }
    }

    const artistaFinal = mejorArtistaCand.artista;
    const merged = {
      ...ganador,
      artista: artistaFinal,
      titulo: tituloFinal,
      fuentes: fuentesFinal,
      ejes: ejesFinal,
      youtubeQuery: `${artistaFinal} ${tituloFinal}`,
    };

    for (const t of candidatos) {
      tracks.delete(t.id);
      if (t.id !== ganador.id) idsFusionados.set(t.id, ganador.id);
    }
    tracks.set(ganador.id, merged);
  }

  return idsFusionados;
}
