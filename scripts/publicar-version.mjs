/**
 * Prepara una versión para publicar, DESPUÉS de `gradlew assembleRelease`:
 * copia el APK a dist-publicar/ con dos nombres (musicsippi-<versionName>.apk y la copia de
 * nombre fijo Musicsippi.apk, la del enlace de compartir) y escribe version.json.
 * No sube nada a internet (ver docs/actualizaciones.md): imprime la orden para hacerlo.
 *
 *   node scripts/publicar-version.mjs [--notas "a|b"] [--base-url https://host/ruta] [--salida carpeta] [--apk ruta]
 * Sin --base-url usa la carpeta de esta versión en GitHub Releases.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APK_FIJO,
  archivosAPublicar,
  baseUrlDeVersion,
  comandoPublicar,
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
  // Copia de nombre fijo: es la que descarga el enlace de «Compartir Musicsippi».
  const fijo = join(salida, APK_FIJO);
  copyFileSync(apk, fijo);
  const manifiesto = construirManifiesto({
    versionCode,
    // Sin --base-url, la carpeta de esta versión en GitHub: no hay que escribir el número a mano.
    baseUrl: args.baseUrl || baseUrlDeVersion(versionName),
    notas: normalizarNotas(args.notas, asuntos),
  });
  writeFileSync(manifiestoRuta, JSON.stringify(manifiesto, null, 2) + '\n');

  console.log(`APK:        ${destino}`);
  console.log(`Copia fija: ${fijo}`);
  console.log(`Manifiesto: ${manifiestoRuta}`);
  console.log(`Versión ${versionName} (código ${versionCode}) · ${manifiesto.notas.length} notas`);
  console.log(`Descarga:   ${manifiesto.url}`);

  const esperados = archivosAPublicar(versionName);
  const sobran = readdirSync(salida).filter((n) => !esperados.includes(n));
  if (sobran.length) console.warn(`AVISO: en ${salida} hay archivos de otra publicación (${sobran.join(', ')}): no los subas.`);

  console.log('\nPara publicar (sube a internet; solo con el sí del usuario):');
  console.log(`  ${comandoPublicar(versionName, args.salida)}`);
  console.log('Después, comprueba que los enlaces de compartir responden:');
  console.log('  npm run comprobar-descargas');
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
