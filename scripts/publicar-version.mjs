/**
 * Prepara una versión para publicar, DESPUÉS de `gradlew assembleRelease`:
 * copia el APK a dist-publicar/musicsippi-<versionName>.apk y escribe version.json.
 * No sube nada a internet (ver docs/actualizaciones.md).
 *
 *   node scripts/publicar-version.mjs --base-url https://host/ruta [--notas "a|b"] [--salida carpeta] [--apk ruta]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commitsDesdeUltima,
  construirManifiesto,
  nombreApk,
  nombreVersion,
  normalizarNotas,
  parsearArgumentos,
} from './lib/publicar-version.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();

try {
  const args = parsearArgumentos(process.argv.slice(2));
  // Mismo versionCode que android/app/build.gradle: nº de commits.
  const versionCode = parseInt(git('rev-list', '--count', 'HEAD'), 10);
  const versionName = nombreVersion(versionCode);

  const candidatos = args.apk
    ? [resolve(args.apk)]
    : ['app-release.apk', 'app-release-unsigned.apk'].map((n) => join(raiz, 'android/app/build/outputs/apk/release', n));
  const apk = candidatos.find((c) => existsSync(c));
  if (!apk) throw new Error(`No encuentro el APK. Ejecuta antes assembleRelease. Busqué: ${candidatos.join(', ')}`);
  if (apk.endsWith('unsigned.apk')) console.warn('AVISO: APK sin firmar (falta ~/.musicsippi/firma.properties); no se podrá instalar ni actualizar.');

  const salida = resolve(raiz, args.salida);
  mkdirSync(salida, { recursive: true });
  const manifiestoRuta = join(salida, 'version.json');

  let ultimoCodigo = null;
  try {
    ultimoCodigo = JSON.parse(readFileSync(manifiestoRuta, 'utf8')).versionCode;
  } catch {}
  let asuntos = [];
  if (args.notas == null) {
    const n = commitsDesdeUltima(versionCode, ultimoCodigo);
    if (n > 0) asuntos = git('log', `-n${n}`, '--pretty=%s').split(/\r?\n/);
  }

  const destino = join(salida, nombreApk(versionName));
  copyFileSync(apk, destino);
  const manifiesto = construirManifiesto({
    versionCode,
    baseUrl: args.baseUrl,
    notas: normalizarNotas(args.notas, asuntos),
  });
  writeFileSync(manifiestoRuta, JSON.stringify(manifiesto, null, 2) + '\n');

  console.log(`APK:       ${destino}`);
  console.log(`Manifiesto: ${manifiestoRuta}`);
  console.log(`Versión ${versionName} (código ${versionCode}) · ${manifiesto.notas.length} notas`);
  if (!args.baseUrl) console.log('Nota: sin --base-url la url del manifiesto es relativa; ponla absoluta antes de publicar.');
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
