/**
 * Importa un CSV exportado desde tunemymusic.com por consola. El núcleo del
 * parseo/aplicación vive en scripts/lib/importar-tunemymusic.mjs — lo
 * comparte con POST /api/importar-tunemymusic (pantalla "Cargar tu
 * biblioteca" en la app). Esta versión de consola, además, corre la
 * resolución de YouTube + clasificación por descripción/género al final
 * (la de la app no, para responder rápido — ver el comentario en vite.config.js).
 *
 * Uso:
 *   node scripts/importar-tunemymusic.mjs "ruta/al/archivo.csv"
 *   node scripts/importar-tunemymusic.mjs "archivo.csv" --sin-resolver
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { propagarSugerenciasUnanimes, podarEjesVacios } from './lib/clasificar.mjs';
import { parsearCsvTuneMyMusic, aplicarFilasTuneMyMusic } from './lib/importar-tunemymusic.mjs';
import { resolverPendientes } from './lib/resolver-innertube.mjs';
import { enriquecerPorDescripcionYoutube } from './lib/enriquecer-descripcion-youtube.mjs';

const { dataDir } = resolverRaizYDataDir(import.meta.url);

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const sinResolver = process.argv.includes('--sin-resolver');
const archivoCsv = args[0];

if (!archivoCsv) {
  console.error('Uso: node scripts/importar-tunemymusic.mjs "ruta/al/archivo.csv" [--sin-resolver]');
  process.exit(1);
}
const rutaCsv = resolve(archivoCsv);
if (!existsSync(rutaCsv)) {
  console.error(`No existe el archivo: ${rutaCsv}`);
  process.exit(1);
}

const { filas, filasDescartadas, error } = parsearCsvTuneMyMusic(readFileSync(rutaCsv, 'utf8'));
if (error) {
  console.error(error);
  process.exit(1);
}

console.log(`\nArchivo: ${rutaCsv}`);
console.log(`Filas leídas: ${filas.length + filasDescartadas.length}`);
if (filasDescartadas.length > 0) {
  console.log(`Descartadas (artistas/álbumes seguidos, o sin título/artista utilizable): ${filasDescartadas.length}`);
}
console.log(`Tracks a procesar: ${filas.length}`);

// ---- Pipeline ----

const { ejes } = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8'));
const bibliotecaPath = join(dataDir, 'biblioteca.json');
const biblioteca = JSON.parse(readFileSync(bibliotecaPath, 'utf8'));
const metaSpotifyPath = join(dataDir, 'metadata-spotify.json');
const metaSpotify = existsSync(metaSpotifyPath)
  ? JSON.parse(readFileSync(metaSpotifyPath, 'utf8'))
  : { version: 1, tracks: {} };

const stats = aplicarFilasTuneMyMusic(filas, { biblioteca, ejes, metaSpotify });

console.log(`\nTracks nuevos en la biblioteca: ${stats.tracksNuevos}`);
console.log(`Ya existían (se les sumó pertenencia si hacía falta): ${filas.length - stats.tracksNuevos}`);
console.log(`Álbumes completados: ${stats.albumesNuevos}`);
console.log(`Marcados como favoritos: ${stats.favoritosMarcados}`);
console.log(`Sumados a listas: ${stats.pertenenciasMarcadas}`);
if (stats.listasNuevas.length > 0) {
  console.log(`\nListas nuevas creadas: ${stats.listasNuevas.map((e) => e.nombre).join(', ')}`);
}

// Segunda pasada automática — igual que importar.mjs: un track nuevo puede
// destrabar una inferencia unánime para otros tracks del mismo artista.
const propagadas = propagarSugerenciasUnanimes(biblioteca.tracks, stats.ejesFinal);
if (propagadas > 0) {
  console.log(`\nSugerencias de artista aplicadas solas: ${propagadas}`);
}

// Listas/modos que quedaron sin ningún track tras esta importación se
// borran solas — nunca las recién creadas (siempre traen al menos 1 fila).
const podado = podarEjesVacios(stats.ejesFinal, biblioteca.tracks);
if (podado.podados.length > 0) {
  console.log(`\nListas/modos vacíos eliminados: ${podado.podados.join(', ')}`);
}

biblioteca.totalTracks = biblioteca.tracks.length;
writeFileSync(bibliotecaPath, JSON.stringify(biblioteca, null, 2), 'utf8');
if (stats.albumesNuevos > 0) {
  writeFileSync(metaSpotifyPath, JSON.stringify(metaSpotify, null, 2), 'utf8');
}
if (stats.listasNuevas.length > 0 || podado.podados.length > 0) {
  writeFileSync(join(dataDir, 'ejes.json'), JSON.stringify({ ejes: podado.ejes }, null, 2), 'utf8');
}

// ---- Resolución YouTube + descripción + género simple, igual que importar.mjs ----

if (!sinResolver) {
  const cachePath = join(dataDir, 'cache-youtube.json');
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const pendientesYt = biblioteca.tracks.filter((t) => !Object.hasOwn(cache, t.id));

  if (pendientesYt.length > 0) {
    console.log(`\n=== RESOLUCIÓN YOUTUBE ===\n\nResolviendo ${pendientesYt.length} tracks contra YouTube…`);
    function guardarCacheYt() {
      const actual = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
      Object.assign(actual, cache);
      writeFileSync(cachePath, JSON.stringify(actual, null, 2), 'utf8');
    }
    const { encontrados, sinResultado, errores } = await resolverPendientes(pendientesYt, cache, {
      onProgreso(i, total) {
        if (i % 20 === 0 || i === total) {
          console.log(`  ${i}/${total}`);
          guardarCacheYt();
        }
      },
    });
    guardarCacheYt();
    console.log(`Encontrados: ${encontrados} | sin resultado: ${sinResultado} | errores: ${errores}`);
  }

  // mbMetaParaDescripcion/resolucionYoutube: mismos archivos que lee
  // importar.mjs para esta misma pasada — se leen acá también para que el
  // filtro de candidatos de la pasada CARA (getInfo, ~350ms c/u) se reduzca
  // al residuo real: tracks sin ninguna evidencia de género todavía, ni de
  // MusicBrainz ni de la búsqueda barata de YouTube.
  const mbMetaParaDescripcion = existsSync(join(dataDir, 'metadata-musicbrainz.json'))
    ? JSON.parse(readFileSync(join(dataDir, 'metadata-musicbrainz.json'), 'utf8'))
    : { tracks: {}, artistas: {} };
  const resolucionYoutubePath = join(dataDir, 'resolucion-youtube.json');
  const resolucionYoutube = existsSync(resolucionYoutubePath)
    ? JSON.parse(readFileSync(resolucionYoutubePath, 'utf8'))
    : {};
  const { aplicados: aplicadasDescripcion, consultados: consultasDescripcion } = await enriquecerPorDescripcionYoutube(
    biblioteca.tracks,
    cache,
    join(dataDir, 'descripciones-youtube.json'),
    {
      mbTracks: mbMetaParaDescripcion.tracks ?? {},
      mbArtistas: mbMetaParaDescripcion.artistas ?? {},
      resolucionYoutube,
      onProgreso(i, total) {
        if (i % 30 === 0 || i === total) console.log(`  descripciones ${i}/${total}`);
      },
    }
  );
  if (consultasDescripcion > 0) {
    console.log(`\n=== CLASIFICACIÓN POR DESCRIPCIÓN DE YOUTUBE ===\n`);
    console.log(`Consultadas: ${consultasDescripcion} | clasificados: ${aplicadasDescripcion}`);
  }

  if (aplicadasDescripcion > 0) {
    writeFileSync(bibliotecaPath, JSON.stringify(biblioteca, null, 2), 'utf8');
  }
}

console.log('\nListo.\n');
