/**
 * Enriquecimiento de metadata contra la API de Genius (api.genius.com).
 *
 * Guarda el id/URL de la página de cada track en Genius para uso futuro
 * (todavía no se muestra en la UI). No trae letra: la API de Genius no la
 * devuelve, solo metadata y anotaciones — ver enriquecer-genius-core.mjs.
 *
 * Requiere GENIUS_ACCESS_TOKEN en .env.local — se consigue creando un cliente
 * en https://genius.com/api-clients (el "Client Access Token" que muestra ahí
 * alcanza, no hace falta el flujo OAuth completo).
 *
 * La lógica real vive en scripts/lib/enriquecer-genius-core.mjs — también la
 * usa el enriquecimiento automático en background (ver
 * scripts/lib/enriquecimiento-automatico.mjs). Este script es solo la
 * interfaz de terminal para correrlo a mano.
 *
 *   node scripts/enriquecer-genius.mjs
 *   node scripts/enriquecer-genius.mjs --limite=300
 *   node scripts/enriquecer-genius.mjs --informe   # no pide nada, solo muestra el plan
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { enriquecerGenius } from './lib/enriquecer-genius-core.mjs';

const { raiz, dataDir } = resolverRaizYDataDir(import.meta.url);

const args = process.argv.slice(2);
const soloInforme = args.includes('--informe');
const limite = Number(args.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? 100000);

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

const token = leerEnv().GENIUS_ACCESS_TOKEN;

if (soloInforme) {
  const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
  const metaPath = join(dataDir, 'metadata-genius.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : { tracks: {} };
  const pendientes = biblioteca.tracks.filter((t) => !meta.tracks[t.id]);
  console.log(`\nBiblioteca      : ${biblioteca.tracks.length} tracks`);
  console.log(`Ya enriquecidos : ${Object.keys(meta.tracks).length}`);
  console.log(`Pendientes      : ${pendientes.length}`);
  console.log('\n(--informe: no se hizo ninguna petición)');
  process.exit(0);
}

if (!token) {
  console.error(
    '\nFalta GENIUS_ACCESS_TOKEN en .env.local.\n' +
      'Se consigue creando un cliente en https://genius.com/api-clients\n' +
      '(el "Client Access Token" alcanza, no hace falta el flujo OAuth completo).\n' +
      'Agregá: GENIUS_ACCESS_TOKEN=tu-token'
  );
  process.exit(1);
}

console.log('\nEnriqueciendo…\n');

const resultado = await enriquecerGenius(dataDir, {
  token,
  limite,
  onProgreso: (procesados, total) => {
    if (procesados % 20 === 0 || procesados === total) console.log(`  ${procesados}/${total}`);
  },
});

console.log('\n=== RESUMEN ===\n');
console.log(`Encontrados   : ${resultado.encontrados}`);
console.log(`Sin resultado : ${resultado.sinResultado}`);
console.log(`Saltados      : ${resultado.saltados}`);
console.log(`\nGuardado en data/metadata-genius.json`);
