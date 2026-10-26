// src/movil/albumLocal.js
// Álbumes desde la biblioteca local: el artista de una canción puede venir como
// «Zedd · Troye Sivan» o «Zedd, Troye Sivan», pero el álbum es del primero.
import { norm } from './busqueda.js';

/** Primer artista de un crédito con colaboraciones (·, coma, feat./ft., vs). «&» no se separa: puede ser una banda. */
export function primerArtista(nombre) {
  const partes = String(nombre ?? '').split(/\s*·\s*|\s*,\s*|\s+(?:feat\.?|ft\.?|featuring|vs\.?)\s+/i);
  return (partes[0] ?? '').trim();
}

/** Álbum de una canción: el de la metadata y, si no hay (canción de fuera sacada de un álbum), el que trae ella misma. */
export function albumDe(track, meta) {
  return meta?.album || track?.album || null;
}

/** Canciones de la biblioteca cuyo primer artista y álbum (normalizados) coinciden. */
export function cancionesDeAlbumLocal(tracks, metadataDe, artista, titulo) {
  const a = norm(primerArtista(artista));
  const t = norm(titulo);
  return tracks.filter((x) => norm(primerArtista(x.artista)) === a && norm(metadataDe(x.trackIdReal ?? x.id)?.album) === t);
}
