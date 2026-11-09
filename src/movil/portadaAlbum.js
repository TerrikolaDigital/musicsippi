// src/movil/portadaAlbum.js
// Álbumes de la biblioteca (agrupados por artista + título) con TODAS las portadas que se pueden usar, en orden,
// para que una tarjeta nunca salga con iniciales si existe alguna imagen. Orden de preferencia:
//   1. carátula real de cualquier pista de ese álbum;
//   2. carátula del mismo álbum (mismo título y año) de otro artista: bandas sonoras y discos compartidos, donde
//      cada canción va con su intérprete («Sing», Nick Kroll / Taron Egerton). Sin año conocido no se presta,
//      para no mezclar «Greatest Hits» de artistas distintos;
//   3. miniatura del vídeo de cualquier pista;
//   4. foto del artista (de cualquier canción suya).
// La portada gris genérica de Deezer (hash del texto vacío) nunca entra. Pura, sin DOM.
const GRIS_DEEZER = 'd41d8cd98f00b204e9800998ecf8427e';

export const esMiniaturaVideo = (url) => typeof url === 'string' && /(^|\/\/)i\d?\.ytimg\.com\//.test(url);
const valida = (url) => typeof url === 'string' && url.startsWith('http') && !url.includes(GRIS_DEEZER);

/** @param tracks canciones de la biblioteca ({id, artista}) · @param metadataDe (id) → {album, anio, coverUrl, coverRespaldo, fotoArtista} */
export function armarAlbumes(tracks, metadataDe) {
  const porClave = new Map();
  const caratulasPorTituloAnio = new Map(); // «título||año» → carátulas reales
  const fotosPorArtista = new Map();
  tracks.forEach((t, indice) => {
    const meta = metadataDe(t.id) ?? {};
    const artista = String(t.artista ?? '');
    if (valida(meta.fotoArtista) && !fotosPorArtista.has(artista.toLowerCase())) fotosPorArtista.set(artista.toLowerCase(), meta.fotoArtista);
    if (!meta.album) return;
    const clave = `${artista.toLowerCase()}||${meta.album.toLowerCase()}`;
    const e = porClave.get(clave) ?? { titulo: meta.album, artista, anio: meta.anio ?? null, cantidad: 0, indice, caratulas: [], videos: [] };
    e.cantidad += 1;
    e.indice = Math.max(e.indice, indice);
    if (!e.anio && meta.anio) e.anio = meta.anio;
    for (const url of [meta.coverUrl, meta.coverRespaldo]) {
      if (!valida(url)) continue;
      const lista = esMiniaturaVideo(url) ? e.videos : e.caratulas;
      if (!lista.includes(url)) lista.push(url);
    }
    porClave.set(clave, e);
  });
  for (const e of porClave.values()) {
    if (!e.anio || e.caratulas.length === 0) continue;
    const k = `${e.titulo.toLowerCase()}||${e.anio}`;
    caratulasPorTituloAnio.set(k, [...(caratulasPorTituloAnio.get(k) ?? []), ...e.caratulas]);
  }
  const albumes = [...porClave.values()].map(({ caratulas, videos, ...e }) => {
    const prestadas = caratulas.length || !e.anio ? [] : caratulasPorTituloAnio.get(`${e.titulo.toLowerCase()}||${e.anio}`) ?? [];
    const foto = fotosPorArtista.get(e.artista.toLowerCase());
    const portadas = [...new Set([...caratulas, ...prestadas, ...videos, ...(foto ? [foto] : [])])];
    return { ...e, coverUrl: portadas[0] ?? null, portadas };
  });
  return albumes.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
}
