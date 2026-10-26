/**
 * Núcleo compartido para importar mp3 locales — usado por POST
 * /api/importar-local (ver vite.config.js). La lectura real de tags ID3
 * (con music-metadata) pasa en el endpoint porque necesita tocar el
 * filesystem; acá solo vive la lógica pura, testeable sin mp3 de verdad.
 * Ver docs/superpowers/specs/2026-09-08-importar-musica-local-design.md.
 */
import { basename, extname } from 'node:path';
import { idTrack } from './id-track.mjs';
import { clasificar } from './clasificar.mjs';

const PATRON_ARTISTA_TITULO = /^\s*(.+?)\s*-\s*(.+?)\s*$/;

/**
 * Intenta sacar {artista, titulo} del nombre de archivo (sin extensión),
 * patrón "Artista - Título". Devuelve null si no matchea o si algún lado
 * queda vacío. Con varios guiones en el nombre, separa por el primero —
 * cubre el caso simple pedido (no números de pista tipo "01 - Artista -
 * Título"), y lo que no matchea bien igual entra a la biblioteca (ver
 * resolverMetadataLocal) para revisión manual, no se pierde.
 */
export function nombreDesdeArchivo(rutaArchivo) {
  const sinExtension = basename(rutaArchivo, extname(rutaArchivo));
  const m = PATRON_ARTISTA_TITULO.exec(sinExtension);
  if (!m) return null;
  const artista = m[1].trim();
  const titulo = m[2].trim();
  if (!artista || !titulo) return null;
  return { artista, titulo };
}

/**
 * Decide artista/título para un archivo: tags ID3 primero, nombre de
 * archivo como fallback, "Desconocido" + nombre de archivo como último
 * recurso. `tags` es el objeto `common` que devuelve music-metadata
 * (`{ artist, title, ... }`), o null/undefined si no se pudo leer nada.
 */
export function resolverMetadataLocal(rutaArchivo, tags) {
  const artistaTag = tags?.artist?.trim();
  const tituloTag = tags?.title?.trim();
  if (artistaTag && tituloTag) {
    return { artista: artistaTag, titulo: tituloTag, origenDatos: 'tags' };
  }

  const desdeArchivo = nombreDesdeArchivo(rutaArchivo);
  if (desdeArchivo) {
    return { ...desdeArchivo, origenDatos: 'nombre-archivo' };
  }

  return {
    artista: 'Desconocido',
    titulo: basename(rutaArchivo, extname(rutaArchivo)),
    origenDatos: 'ninguno',
  };
}

/**
 * Aplica una lista de entradas ya resueltas (ver resolverMetadataLocal)
 * contra la biblioteca en memoria. Muta `biblioteca.tracks` (push). Mismo
 * criterio de fusión por id que aplicarFilasTuneMyMusic
 * (importar-tunemymusic.mjs): si el track ya existe (por otra fuente), se
 * le suma 'local' a `fuentes` en vez de duplicarlo — nunca se pisan datos
 * que ya tenía (youtubeVideoId resuelto, ejes ya asignados).
 *
 * Entradas con origenDatos: 'ninguno' van derecho a sin-clasificar, sin
 * pasar por clasificar() — no hay artista real en el que confiar para
 * auto-clasificar (ver test correspondiente).
 */
export function aplicarArchivosLocales(entradas, { biblioteca, ejes }) {
  const porId = new Map(biblioteca.tracks.map((t) => [t.id, t]));

  let tracksNuevos = 0;
  let tracksFusionados = 0;
  let sinClasificar = 0;

  for (const entrada of entradas) {
    const id = idTrack(entrada.artista, entrada.titulo);
    const existente = porId.get(id);

    if (existente) {
      if (!existente.fuentes.includes('local')) existente.fuentes.push('local');
      tracksFusionados++;
      continue;
    }

    const ejesTrack =
      entrada.origenDatos === 'ninguno'
        ? [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }]
        : clasificar({ artista: entrada.artista, titulo: entrada.titulo }, ejes);

    const track = {
      id,
      artista: entrada.artista,
      titulo: entrada.titulo,
      fuentes: ['local'],
      youtubeQuery: `${entrada.artista} ${entrada.titulo}`,
      youtubeVideoId: null,
      ejes: ejesTrack,
    };
    porId.set(id, track);
    biblioteca.tracks.push(track);
    tracksNuevos++;
    if (ejesTrack.length === 1 && ejesTrack[0].ejeId === 'sin-clasificar') sinClasificar++;
  }

  return { tracksNuevos, tracksFusionados, sinClasificar };
}
