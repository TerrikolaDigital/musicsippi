/**
 * Resolución masiva contra YouTube usando InnerTube (youtubei.js) — la misma
 * API interna que usan NewPipe/InnerTune, sin cuota diaria. Reemplaza el plan
 * original de resolver "on-demand" a ~100 tracks/día contra la Data API
 * oficial: confirmado contra 40 tracks reales de esta biblioteca, 40/40
 * encontrados y reproducibles, ~500ms cada uno.
 *
 * Escribe en data/cache-youtube.json — el mismo archivo que ya lee
 * /api/resolver (vite.config.js), así que esto no reemplaza nada del lado del
 * cliente: solo llena de antemano lo que hoy se resolvía recién al reproducir.
 * `/api/resolver` sigue viva para tracks nuevos (Fase 9) y usa InnerTube
 * primero, con la Data API como respaldo si InnerTube llegara a fallar.
 *
 * La resolución en sí (`resolverPendientes`) vive en scripts/lib/, compartida
 * con importar.mjs, que la dispara sola al final de cada importación.
 *
 * Incremental y resumible (como enriquecer-musicbrainz.mjs): se puede cortar
 * con Ctrl+C y retomar sin perder lo ya resuelto — escribe a disco cada 20
 * tracks. Los "sin resultado" NO se cachean (a diferencia de MusicBrainz):
 * acá no hay cuota que cuidar, así que no cuesta nada reintentarlos en la
 * próxima corrida en vez de marcarlos como perdidos para siempre.
 *
 *   node scripts/resolver-youtube.mjs
 *   node scripts/resolver-youtube.mjs --limite=200
 *   node scripts/resolver-youtube.mjs --informe   # solo mide cuánto falta
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { resolverPendientes } from './lib/resolver-innertube.mjs';

const { raiz, dataDir } = resolverRaizYDataDir(import.meta.url);
const cachePath = join(dataDir, 'cache-youtube.json');

const args = process.argv.slice(2);
const soloInforme = args.includes('--informe');
const limite = Number(args.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? Infinity);

const bib = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

const pendientes = bib.tracks.filter((t) => !Object.hasOwn(cache, t.id));

console.log(`\nBiblioteca : ${bib.tracks.length} tracks`);
console.log(`Resueltos  : ${Object.keys(cache).length}`);
console.log(`Pendientes : ${pendientes.length}`);

if (soloInforme) {
  console.log('\n(--informe: no se pidió nada)');
  process.exit(0);
}

if (pendientes.length === 0) {
  console.log('\nNada que resolver.');
  process.exit(0);
}

const tanda = pendientes.slice(0, limite);
console.log(`\nResolviendo ${tanda.length}…\n`);

// Relee el disco justo antes de escribir y fusiona en vez de volcar `cache`
// tal cual: el servidor de dev (vite.config.js, /api/resolver y
// /api/agregar-track) puede escribir este mismo archivo mientras esta corrida
// está viva — sin la relectura, cada checkpoint de acá pisaba lo que el
// servidor hubiera agregado mientras tanto (se vio en vivo: un track sumado
// a mano por /api/agregar-track perdió su entrada de caché apenas corrió el
// siguiente checkpoint).
function guardar() {
  const actual = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  Object.assign(actual, cache);
  writeFileSync(cachePath, JSON.stringify(actual, null, 2), 'utf8');
}

// Escribir lo que ya se resolvió incluso si el proceso se corta (Ctrl+C,
// crash) — sin esto, una corrida larga interrumpida pierde todo el trabajo
// en vez de solo lo de la última tanda de 20.
process.on('SIGINT', () => {
  console.log('\n\nInterrumpido — guardando lo resuelto hasta acá…');
  guardar();
  process.exit(0);
});

const { encontrados, sinResultado, errores } = await resolverPendientes(tanda, cache, {
  onProgreso(i, total, stats) {
    if (i % 20 === 0 || i === total) {
      console.log(
        `  ${i}/${total}  (${stats.encontrados} encontrados, ${stats.sinResultado} sin resultado, ${stats.errores} errores)`
      );
      guardar();
    }
  },
});

guardar();

console.log('\n=== RESUMEN ===\n');
console.log(`Encontrados    : ${encontrados}`);
console.log(`Sin resultado  : ${sinResultado} (se reintentan solos en la próxima corrida)`);
console.log(`Errores        : ${errores}`);
console.log(`Total en cache : ${Object.keys(cache).length} de ${bib.tracks.length}`);

const restantes = bib.tracks.length - Object.keys(cache).length;
if (restantes > 0) {
  console.log(`\nQuedan ${restantes}. Volvé a correr el script para seguir.`);
}
