/**
 * Carátula + foto de artista vía la API pública de Deezer (api.deezer.com) —
 * sin API key, sin registro. Medido en vivo contra esta biblioteca real:
 * 93% de hit rate en una muestra mainstream, 97.5% en una muestra dispersa
 * de "sin-clasificar" (los artistas más nicho/oscuros de toda la biblioteca)
 * — muy por encima de Cover Art Archive (0/40 probados) y del scraping de
 * Spotify embed (solo cubre lo que está en alguna playlist, 19% del total).
 *
 * Es incremental: lo ya consultado queda en data/metadata-deezer.json y no
 * se vuelve a pedir. Se puede cortar con Ctrl+C y retomar sin perder trabajo.
 *
 * La lógica real vive en scripts/lib/enriquecer-deezer-core.mjs — también la
 * usa el enriquecimiento automático en background (ver
 * scripts/lib/enriquecimiento-automatico.mjs). Este script es solo la
 * interfaz de terminal para correrlo a mano.
 *
 *   node scripts/enriquecer-deezer.mjs
 *   node scripts/enriquecer-deezer.mjs --limite=500
 */
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { enriquecerDeezer } from './lib/enriquecer-deezer-core.mjs';

const { dataDir } = resolverRaizYDataDir(import.meta.url);

const args = process.argv.slice(2);
const limite = Number(args.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? 100000);

const resultado = await enriquecerDeezer(dataDir, {
  limite,
  onProgreso: (procesados, total) => {
    if (procesados % 25 === 0 || procesados === total) {
      console.log(`  ${procesados}/${total}`);
    }
  },
});

console.log('\n=== RESUMEN ===\n');
console.log(`Encontrados   : ${resultado.encontrados}`);
console.log(`Sin resultado : ${resultado.sinResultado}`);
console.log(`Guardado en data/metadata-deezer.json`);

if (resultado.total === 0) {
  console.log('\nNada que consultar.');
}
