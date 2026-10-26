// Partes puras de scripts/simular-alimentar-estados.mjs: muestreo, cobertura de las consultas y texto del informe.

/** Muestra repartida de forma regular (determinista) sobre las canciones ordenadas por id. */
export function muestrear(tracks, n) {
  const orden = [...tracks].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!(n > 0) || n >= orden.length) return orden;
  const paso = orden.length / n;
  return Array.from({ length: n }, (_, i) => orden[Math.floor(i * paso)]);
}

const pct = (n, total) => (total ? `${((100 * n) / total).toFixed(1)} %` : 'n/d');

/**
 * Cobertura de lo consultado sobre la muestra.
 * @param {object[]} muestra canciones de la muestra
 * @param {Map<string, object>} metas metadataLocal por trackId (bpm, ritmoBuscado, deezerTrackId)
 * @param {Map<string, object>} registros generos por trackId (recordingMbid, mbCancion, mbAlbum, mbDetalle)
 * @param {Set<string>} conGeneroArtista ids con género de MusicBrainz a nivel de artista (lo que ya había)
 * @param {(tags: string[]) => string[]} estadosPorEtiquetas
 */
export function coberturaDeMuestra({ muestra, metas, registros, conGeneroArtista, estadosPorEtiquetas }) {
  const n = muestra.length;
  let deezerEncontrada = 0;
  let conBpm = 0;
  const bpms = [];
  let recording = 0;
  let generosCancion = 0;
  let generosAlbum = 0;
  let algunGenero = 0;
  let conEtiquetas = 0;
  let conEtiquetasAnimo = 0;
  let sinGenero = 0;
  let ganaGenero = 0;
  for (const t of muestra) {
    const m = metas.get(t.id);
    const r = registros.get(t.id);
    if (m?.deezerTrackId) deezerEncontrada++;
    if (m?.bpm > 0) {
      conBpm++;
      bpms.push(m.bpm);
    }
    if (r?.recordingMbid) recording++;
    const gc = r?.mbCancion?.generos?.length > 0;
    const ga = r?.mbAlbum?.generos?.length > 0;
    if (gc) generosCancion++;
    if (ga) generosAlbum++;
    if (gc || ga) algunGenero++;
    const tags = [...(r?.mbCancion?.tags ?? []), ...(r?.mbAlbum?.tags ?? [])];
    if (tags.length) conEtiquetas++;
    if (estadosPorEtiquetas(tags).length) conEtiquetasAnimo++;
    if (!conGeneroArtista.has(t.id)) {
      sinGenero++;
      if (gc || ga) ganaGenero++;
    }
  }
  return { n, deezerEncontrada, conBpm, bpms, recording, generosCancion, generosAlbum, algunGenero, conEtiquetas, conEtiquetasAnimo, sinGenero, ganaGenero, conGeneroArtista: [...muestra].filter((t) => conGeneroArtista.has(t.id)).length };
}

export function formatearCobertura(c) {
  const L = [];
  L.push(`Muestra: ${c.n} canciones`);
  L.push('', 'DEEZER (bpm)');
  L.push(`  Canción encontrada (mismo artista): ${c.deezerEncontrada} (${pct(c.deezerEncontrada, c.n)})`);
  L.push(`  Con bpm > 0:                         ${c.conBpm} (${pct(c.conBpm, c.n)} de la muestra, ${pct(c.conBpm, c.deezerEncontrada)} de las encontradas)`);
  if (c.bpms.length) {
    const o = [...c.bpms].sort((a, b) => a - b);
    const q = (p) => o[Math.min(o.length - 1, Math.floor(o.length * p))];
    L.push(`  bpm: mín ${o[0]} · mediana ${q(0.5)} · máx ${o[o.length - 1]} · ≤90: ${o.filter((x) => x <= 90).length} · 100–140: ${o.filter((x) => x >= 100 && x <= 140).length} · ≥120: ${o.filter((x) => x >= 120).length}`);
  }
  L.push('', 'MUSICBRAINZ (canción y álbum, además del artista)');
  L.push(`  Grabación encontrada:                    ${c.recording} (${pct(c.recording, c.n)})`);
  L.push(`  Con géneros a nivel de canción:          ${c.generosCancion} (${pct(c.generosCancion, c.n)})`);
  L.push(`  Con géneros a nivel de álbum:            ${c.generosAlbum} (${pct(c.generosAlbum, c.n)})`);
  L.push(`  Con géneros de canción o álbum:          ${c.algunGenero} (${pct(c.algunGenero, c.n)})`);
  L.push(`  Con alguna etiqueta (canción o álbum):   ${c.conEtiquetas} (${pct(c.conEtiquetas, c.n)})`);
  L.push(`  Con etiqueta de ánimo (happy, sad…):     ${c.conEtiquetasAnimo} (${pct(c.conEtiquetasAnimo, c.n)})`);
  L.push(`  Antes: con género del artista:           ${c.conGeneroArtista} (${pct(c.conGeneroArtista, c.n)})`);
  L.push(`  Sin género de artista que ahora lo tienen: ${c.ganaGenero} de ${c.sinGenero}`);
  return L;
}

/** Líneas del recuento por estado; `factor` extrapola de la muestra a toda la biblioteca. */
/**
 * `base` (opcional): recuento por estado de lo que entra SIN consultar nada (toda la biblioteca, exacto). Lo que se
 * añade con bpm/etiquetas solo existe en la muestra y es lo único que se extrapola.
 */
export function formatearEstados({ porEstado, factor, totalCandidatas, muestra, base = null }) {
  const L = [];
  L.push(`Canciones candidatas (con algún mood): ${totalCandidatas} · muestra consultada: ${muestra} · factor de extrapolación: ×${factor.toFixed(2)}`);
  L.push('', `${'ESTADO'.padEnd(14)} ${'ya'.padStart(5)} ${'entran(muestra)'.padStart(16)} ${'≈ en toda la biblioteca'.padStart(25)}   señales (en la muestra)`);
  for (const [id, e] of Object.entries(porEstado)) {
    const senales = Object.entries(e.porSenal).map(([s, k]) => `${s}:${k}`).join(' ') || '—';
    const b = base ? (base[id]?.n ?? 0) : 0;
    L.push(`${e.nombre.padEnd(14)} ${String(e.ya).padStart(5)} ${String(e.n).padStart(16)} ${('≈ ' + Math.round(b + (e.n - b) * factor)).padStart(25)}   ${senales}`);
  }
  return L;
}
