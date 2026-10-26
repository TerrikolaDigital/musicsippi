// scripts/diagnostico.mjs
//
// Diagnóstico de las fuentes externas (YouTube, MusicBrainz, Deezer): corre
// consultas fijas y públicas (nunca datos del usuario) contra cada una y
// guarda un informe en data/diagnostico-<fecha>.json. Ver contratos en
// scripts/lib/contratos-externos.mjs.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { cargarFuentes } from './lib/fuentes.mjs';
import { verificarTodos } from './lib/contratos-externos.mjs';

const { dataDir } = resolverRaizYDataDir(import.meta.url);
const fuentes = cargarFuentes(dataDir);

if (!fuentes) {
  console.error('No se pudo cargar fuentes.json — corré la Tarea 10 o revisá data/fuentes.json');
  process.exit(1);
}

const resultados = await verificarTodos(fuentes);

let commit = 'desconocido';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* build empaquetado sin git */ }

const informe = {
  fecha: new Date().toISOString(),
  commit,
  node: process.version,
  so: process.platform,
  fuentes: resultados,
};

const nombre = `diagnostico-${informe.fecha.replace(/[:.]/g, '-')}.json`;
writeFileSync(join(dataDir, nombre), JSON.stringify(informe, null, 2));

console.log(`Diagnóstico guardado en data/${nombre}\n`);
for (const r of resultados) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.fuente}${r.ok ? '' : ` — faltan: ${r.camposFaltantes?.join(', ') ?? r.error}`}`);
}
