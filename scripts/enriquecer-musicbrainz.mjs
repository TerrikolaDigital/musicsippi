/**
 * Enriquecimiento de metadata contra la API pública de MusicBrainz.
 *
 * No requiere cuenta ni clave: es una base de datos abierta. A cambio exige dos
 * cosas de "buen ciudadano" que si se ignoran terminan en bloqueo silencioso:
 *  - User-Agent identificable con contacto real (política de la propia API).
 *  - Máximo 1 petición por segundo por IP.
 *
 * Qué agrega, y para qué:
 *  - álbum y año de lanzamiento  -> la ficha de la canción en la barra
 *  - géneros del artista         -> clasificar los tracks sin eje
 *
 * Es incremental: lo ya consultado queda en data/metadata-musicbrainz.json y no
 * se vuelve a pedir. Se puede cortar con Ctrl+C y retomar sin perder trabajo.
 *
 * La lógica real vive en scripts/lib/enriquecer-musicbrainz-core.mjs —
 * también la usa el enriquecimiento automático en background (ver
 * scripts/lib/enriquecimiento-automatico.mjs). Este script es solo la
 * interfaz de terminal para correrlo a mano.
 *
 *   node scripts/enriquecer-musicbrainz.mjs
 *   node scripts/enriquecer-musicbrainz.mjs --limite=300
 *   node scripts/enriquecer-musicbrainz.mjs --informe   # no pide nada, solo muestra el plan
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { enriquecerMusicbrainz } from './lib/enriquecer-musicbrainz-core.mjs';

const { raiz, dataDir } = resolverRaizYDataDir(import.meta.url);

const args = process.argv.slice(2);
const soloInforme = args.includes('--informe');
const limite = Number(args.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? 2200);

function leerEnv() {
  const p = join(raiz, '.env.local');
  if (!existsSync(p)) return {};
  const env = {};
  for (const linea of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const contacto = leerEnv().MUSICBRAINZ_CONTACT;

if (soloInforme) {
  const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
  const metaPath = join(dataDir, 'metadata-musicbrainz.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : { tracks: {}, artistas: {} };
  const pendientes = biblioteca.tracks.filter((t) => !meta.tracks[t.id]);
  console.log(`\nBiblioteca        : ${biblioteca.tracks.length} tracks`);
  console.log(`Ya enriquecidos   : ${Object.keys(meta.tracks).length}`);
  console.log(`Pendientes        : ${pendientes.length}`);
  console.log(`Artistas cacheados: ${Object.keys(meta.artistas).length}`);
  console.log('\n(--informe: no se hizo ninguna petición)');
  process.exit(0);
}

if (!contacto) {
  console.error(
    '\nFalta MUSICBRAINZ_CONTACT en .env.local.\n' +
      'MusicBrainz exige un User-Agent con un contacto real (su propia política de uso).\n' +
      'Agregá: MUSICBRAINZ_CONTACT=tu-email@ejemplo.com'
  );
  process.exit(1);
}

console.log('\nEnriqueciendo…\n');

const resultado = await enriquecerMusicbrainz(dataDir, {
  contacto,
  limite,
  onProgreso: (procesados, total) => {
    if (procesados % 20 === 0 || procesados === total) console.log(`  ${procesados}/${total}`);
  },
});

console.log('\n=== RESUMEN ===\n');
console.log(`Encontrados   : ${resultado.encontrados}`);
console.log(`Sin resultado : ${resultado.sinResultado}`);
console.log(`Saltados      : ${resultado.saltados}`);
console.log(`Artistas nuevos consultados: ${resultado.artistasNuevos}`);
console.log(`\nGuardado en data/metadata-musicbrainz.json`);
