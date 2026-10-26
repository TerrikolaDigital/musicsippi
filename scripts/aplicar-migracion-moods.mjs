/**
 * Migración de la biblioteca del PC a moods (estados + géneros + listas). Ver src/organizador/migrar-moods.js.
 *
 * Por defecto SOLO SIMULA (imprime los recuentos). Con --aplicar:
 *   1. comprueba que la app de escritorio no esté en marcha (o exige --app-cerrada si no se puede saber),
 *   2. copia data/biblioteca.json y data/ejes.json a <data>/backup-migracion-moods-<fecha-hora>/,
 *   3. escribe los dos archivos de forma atómica (ejes.json lleva esquemaMoods: 1).
 * Para deshacer: copia los dos archivos de esa carpeta de backup de vuelta a <data>.
 * Después de migrar el PC, sincroniza el móvil; si el móvil no está reorganizado, la sincronización se bloquea con un aviso.
 *
 *   node scripts/aplicar-migracion-moods.mjs                       # simulación sobre data/ del proyecto
 *   node scripts/aplicar-migracion-moods.mjs --data "$APPDATA/Musicsippi/data"
 *   node scripts/aplicar-migracion-moods.mjs --data <carpeta> --aplicar [--app-cerrada]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { platform } from 'node:os';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { escribirAtomico } from './lib/escribir-atomico.mjs';
import { formatearSimulacion } from '../src/organizador/migrar-moods.js';
import { appEnMarcha, leerArgumentos, nombreCarpetaBackup, permisoParaEscribir, prepararMigracion } from './lib/migrar-moods-pc.mjs';

const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

function listaDeProcesos() {
  try {
    return platform() === 'win32'
      ? execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' })
      : execFileSync('ps', ['-A', '-o', 'comm='], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

const args = leerArgumentos(process.argv.slice(2));
if (args.errores.length) {
  for (const e of args.errores) console.error(e);
  process.exit(2);
}
const dataDir = args.dataDir ? resolve(args.dataDir) : resolverRaizYDataDir(import.meta.url).dataDir;
const rutas = { biblioteca: join(dataDir, 'biblioteca.json'), ejes: join(dataDir, 'ejes.json'), mb: join(dataDir, 'metadata-musicbrainz.json') };

const r = prepararMigracion({
  biblioteca: leer(rutas.biblioteca),
  ejesData: leer(rutas.ejes),
  musicbrainz: existsSync(rutas.mb) ? leer(rutas.mb) : null,
});

console.log(`Datos: ${dataDir}`);
if (r.yaMigrado) {
  console.log('Estos datos ya están migrados a moods. Nada que hacer.');
  process.exit(0);
}
console.log(args.aplicar ? 'Modo: APLICAR' : 'Modo: SIMULACIÓN (nada se escribe; usa --aplicar)');
console.log('');
for (const linea of formatearSimulacion(r.plan)) console.log(linea);
if (!args.aplicar) process.exit(0);

const permiso = permisoParaEscribir({ enMarcha: appEnMarcha(listaDeProcesos()), appCerrada: args.appCerrada });
if (!permiso.permitido) {
  console.error(`\nNo se ha escrito nada. ${permiso.motivo}`);
  process.exit(1);
}

const carpeta = join(dataDir, nombreCarpetaBackup(new Date()));
mkdirSync(carpeta, { recursive: true });
copyFileSync(rutas.biblioteca, join(carpeta, 'biblioteca.json'));
copyFileSync(rutas.ejes, join(carpeta, 'ejes.json'));
escribirAtomico(rutas.biblioteca, r.biblioteca);
escribirAtomico(rutas.ejes, r.ejesData);
console.log(`\nListo. Copia de seguridad en ${carpeta}`);
console.log('Siguiente: abre la app de escritorio y sincroniza el móvil (reorganízalo antes en Ajustes si aún no lo está).');
