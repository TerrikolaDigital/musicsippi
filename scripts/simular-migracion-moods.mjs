/**
 * SIMULACIÓN de la migración a moods (ver src/organizador/migrar-moods.js y
 * docs/revision-usabilidad-y-moods-2026-10-19.md). SOLO LEE y SOLO IMPRIME: no escribe nada,
 * ni en data/ ni en ningún otro sitio. Aplicar la migración es un paso aparte que aún no existe.
 *
 *   node scripts/simular-migracion-moods.mjs                      # data/ del proyecto
 *   node scripts/simular-migracion-moods.mjs --data <carpeta>     # otra carpeta de datos (p. ej. la real de la app)
 *   node scripts/simular-migracion-moods.mjs --json               # el plan completo en JSON (para revisarlo)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { formatearSimulacion, planificarMigracion } from '../src/organizador/migrar-moods.js';

const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

const args = process.argv.slice(2);
const i = args.indexOf('--data');
const dataDir = i >= 0 && args[i + 1] ? resolve(args[i + 1]) : resolverRaizYDataDir(import.meta.url).dataDir;

const rutaMb = join(dataDir, 'metadata-musicbrainz.json');
const biblioteca = leer(join(dataDir, 'biblioteca.json'));
const ejesData = leer(join(dataDir, 'ejes.json'));
const musicbrainz = existsSync(rutaMb) ? leer(rutaMb) : null;

const plan = planificarMigracion({ tracks: biblioteca.tracks, ejes: ejesData.ejes, musicbrainz });

if (args.includes('--json')) {
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.log(`Datos: ${dataDir}`);
  console.log('Modo: SIMULACIÓN (no se escribe nada)');
  console.log(musicbrainz ? 'Con etiquetas de MusicBrainz.' : 'Sin metadata-musicbrainz.json: solo cuenta la evidencia de los modos actuales.');
  console.log('');
  for (const linea of formatearSimulacion(plan)) console.log(linea);
}
