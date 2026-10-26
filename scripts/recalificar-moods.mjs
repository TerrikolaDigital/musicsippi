/**
 * Recalificar moods en el PC (reglas R1-R9 de la auditoría de moods). Ver src/organizador/recalificar-moods.js.
 *
 * Por defecto SOLO SIMULA: imprime la tabla por mood y una muestra de cambios. Con --aplicar:
 *   1. comprueba que la app de escritorio no esté en marcha (o exige --app-cerrada si no se puede saber),
 *   2. copia biblioteca.json a <data>/backup-recalificar-moods-<fecha-hora>/,
 *   3. escribe biblioteca.json (atómico) y <data>/recalificacion-moods.json (la lista de cambios para «Revisar moods»).
 * Para deshacer: copia biblioteca.json de esa carpeta de backup de vuelta a <data>.
 * Usa como copia previa la backup-migracion-moods-* más reciente de <data> (o --copia <carpeta>): sin ella no se
 * distingue lo heredado de una lista importada de lo que hizo el usuario, y R1/R8 no actúan.
 *
 *   node scripts/recalificar-moods.mjs --data "$APPDATA/Musicsippi/data"              # simulación
 *   node scripts/recalificar-moods.mjs --data <carpeta> --aplicar [--app-cerrada]
 *   opciones: --copia <carpeta>  --fiesta-estricta  --muestra <n>
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { platform } from 'node:os';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { escribirAtomico } from './lib/escribir-atomico.mjs';
import { formatearRecalificacion, MOTIVOS_TEXTO } from '../src/organizador/recalificar-moods.js';
import {
  ARCHIVO_CAMBIOS,
  appEnMarcha,
  buscarCopiaPrevia,
  leerArgumentos,
  leerVectores,
  nombreCarpetaBackup,
  permisoParaEscribir,
  prepararRecalificacion,
} from './lib/recalificar-moods-pc.mjs';

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
const rutas = { biblioteca: join(dataDir, 'biblioteca.json'), ejes: join(dataDir, 'ejes.json'), mb: join(dataDir, 'metadata-musicbrainz.json'), cambios: join(dataDir, ARCHIVO_CAMBIOS) };

const ejesData = leer(rutas.ejes);
if (!(ejesData.ejes ?? []).some((e) => e.familia === 'estado' || e.familia === 'genero')) {
  console.error('Estos datos aún no están migrados a moods: ejecuta antes scripts/aplicar-migracion-moods.mjs.');
  process.exit(1);
}
const copiaPrevia = buscarCopiaPrevia(dataDir, args.copia ? resolve(args.copia) : null);
const r = prepararRecalificacion({
  biblioteca: leer(rutas.biblioteca),
  ejesData,
  musicbrainz: existsSync(rutas.mb) ? leer(rutas.mb) : null,
  copiaPrevia,
  vectores: leerVectores(dataDir),
  fiestaEstricta: args.fiestaEstricta,
});

console.log(`Datos: ${dataDir}`);
console.log(`Copia previa a la reorganización: ${copiaPrevia ? `${copiaPrevia.tracks.length} canciones` : 'NO encontrada'}`);
console.log(args.aplicar ? 'Modo: APLICAR' : 'Modo: SIMULACIÓN (nada se escribe; usa --aplicar)');
console.log('');
for (const linea of formatearRecalificacion(r.plan)) console.log(linea);
if (args.muestra > 0 && r.plan.cambios.length) {
  console.log('', `MUESTRA (${Math.min(args.muestra, r.plan.cambios.length)} de ${r.plan.cambios.length})`);
  const paso = Math.max(1, Math.floor(r.plan.cambios.length / args.muestra));
  for (let i = 0; i < r.plan.cambios.length && i / paso < args.muestra; i += paso) {
    const c = r.plan.cambios[i];
    const sal = c.sale.map((s) => `${s.ejeId} (${MOTIVOS_TEXTO[s.motivo] ?? s.motivo})`).join(', ');
    const ent = c.entra.map((e) => e.ejeId).join(', ');
    console.log(`  ${c.artista} - ${c.titulo}: sale [${sal || '-'}] entra [${ent || '-'}]`);
  }
}
if (!args.aplicar) process.exit(0);

const permiso = permisoParaEscribir({ enMarcha: appEnMarcha(listaDeProcesos()), appCerrada: args.appCerrada });
if (!permiso.permitido) {
  console.error(`\nNo se ha escrito nada. ${permiso.motivo}`);
  process.exit(1);
}

const carpeta = join(dataDir, nombreCarpetaBackup(new Date()));
mkdirSync(carpeta, { recursive: true });
copyFileSync(rutas.biblioteca, join(carpeta, 'biblioteca.json'));
escribirAtomico(rutas.biblioteca, r.biblioteca);
escribirAtomico(rutas.cambios, r.archivoCambios);
console.log(`\nListo. Copia de seguridad en ${carpeta}`);
console.log(`Lista de cambios para «Revisar moods»: ${rutas.cambios}`);
