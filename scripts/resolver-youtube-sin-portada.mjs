/**
 * Resuelve el vídeo de YouTube SOLO de las canciones que no tienen carátula (ni en metadata-deezer.json ni en la
 * propia canción), para que la app pueda usar la miniatura del vídeo como portada de respaldo.
 * Mismo mecanismo que resolver-youtube.mjs (InnerTube, sin cuota) y mismos archivos de caché, pero acotado.
 *
 *   MUSICSIPPI_DATA_DIR=<datos> node scripts/resolver-youtube-sin-portada.mjs            → resuelve y guarda (con copia previa)
 *   MUSICSIPPI_DATA_DIR=<datos> node scripts/resolver-youtube-sin-portada.mjs --informe  → solo cuenta, no pide nada
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { resolverPendientes } from './lib/resolver-innertube.mjs';

const { dataDir } = resolverRaizYDataDir(import.meta.url);
const cachePath = join(dataDir, 'cache-youtube.json');
const resolucionPath = join(dataDir, 'resolucion-youtube.json');
const soloInforme = process.argv.includes('--informe');

const bib = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(dataDir, 'metadata-deezer.json'), 'utf8')).tracks;
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

const sinPortada = bib.tracks.filter((t) => !meta[t.trackIdReal ?? t.id]?.coverUrl && !t.coverUrl);
const pendientes = sinPortada.filter((t) => !Object.hasOwn(cache, t.id) && !t.youtubeVideoId);
console.log(`Sin carátula: ${sinPortada.length} · sin vídeo resuelto: ${pendientes.length} (${dataDir})`);
if (soloInforme || pendientes.length === 0) process.exit(0);

const sello = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(cachePath, `${cachePath}.antes-sin-portada-${sello}`);
if (existsSync(resolucionPath)) copyFileSync(resolucionPath, `${resolucionPath}.antes-sin-portada-${sello}`);
console.log(`Copias previas guardadas (*.antes-sin-portada-${sello})`);

function guardar() {
  // Fusiona con el disco por si otro proceso (servidor de desarrollo) escribió mientras tanto.
  const actual = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  Object.assign(actual, cache);
  writeFileSync(cachePath, JSON.stringify(actual, null, 2), 'utf8');
}

const { encontrados, sinResultado, errores } = await resolverPendientes(pendientes, cache, {
  onProgreso(i, total, stats) {
    if (i % 20 === 0 || i === total) {
      console.log(`  ${i}/${total} (${stats.encontrados} encontrados, ${stats.sinResultado} sin resultado, ${stats.errores} errores)`);
      guardar();
    }
  },
});
guardar();
console.log(`\nEncontrados: ${encontrados} · sin resultado: ${sinResultado} · errores: ${errores}`);
