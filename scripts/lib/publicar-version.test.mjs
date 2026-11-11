import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearArgumentos,
  nombreVersion,
  nombreApk,
  urlApk,
  normalizarNotas,
  construirManifiesto,
  commitsDesdeUltima,
  APK_FIJO,
  MANIFIESTO,
  REPO_ANDROID,
  etiquetaVersion,
  baseUrlDeVersion,
  archivosAPublicar,
  comandoPublicar,
  faltanEnRelease,
  enlaceResponde,
} from './publicar-version.mjs';
import { DESCARGA_ANDROID } from '../../src/movil/compartir-salida.js';
import { URL_MANIFIESTO } from '../../src/data/actualizaciones.js';
import { urlNotasVersion } from '../../src/data/novedades.js';

// El enlace de «Compartir Musicsippi» no lleva número de versión: solo funciona si CADA
// release sube un archivo con ese nombre exacto. La 1.800 salió sin él y el enlace dio 404.
test('el enlace de compartir apunta a la copia de nombre fijo que genera la publicación', () => {
  assert.equal(DESCARGA_ANDROID, `https://github.com/${REPO_ANDROID}/releases/latest/download/${APK_FIJO}`);
  assert.equal(URL_MANIFIESTO, `https://github.com/${REPO_ANDROID}/releases/latest/download/${MANIFIESTO}`);
  assert.ok(archivosAPublicar('1.800').includes(APK_FIJO));
});

test('archivosAPublicar: APK con versión, copia de nombre fijo y manifiesto', () => {
  assert.deepEqual(archivosAPublicar('1.800'), ['musicsippi-1.800.apk', 'Musicsippi.apk', 'version.json']);
});

test('la dirección de cada versión sale sola del número (sin escribirla a mano)', () => {
  assert.equal(etiquetaVersion('1.800'), 'v1.800');
  assert.equal(baseUrlDeVersion('1.800'), 'https://github.com/TerrikolaDigital/musicsippi-android/releases/download/v1.800');
  // Misma carpeta que la app usa para leer las notas de una versión instalada.
  assert.equal(urlNotasVersion(800), `${baseUrlDeVersion('1.800')}/version.json`);
  assert.equal(
    construirManifiesto({ versionCode: 800, baseUrl: baseUrlDeVersion('1.800'), notas: [] }).url,
    'https://github.com/TerrikolaDigital/musicsippi-android/releases/download/v1.800/musicsippi-1.800.apk',
  );
});

test('comandoPublicar: nombra los tres archivos, sin comodín', () => {
  const c = comandoPublicar('1.800', 'dist-publicar');
  assert.match(c, /^gh release create v1\.800 --repo TerrikolaDigital\/musicsippi-android /);
  for (const a of archivosAPublicar('1.800')) assert.ok(c.includes(`dist-publicar/${a}`), a);
  assert.ok(!c.includes('*'));
});

test('faltanEnRelease: avisa de lo que no se subió', () => {
  assert.deepEqual(faltanEnRelease(['musicsippi-1.800.apk', 'version.json'], '1.800'), ['Musicsippi.apk']);
  assert.deepEqual(faltanEnRelease(['version.json', 'Musicsippi.apk', 'musicsippi-1.758.apk'], '1.758'), []);
  assert.deepEqual(faltanEnRelease([], '1.7'), ['musicsippi-1.7.apk', 'Musicsippi.apk', 'version.json']);
});

test('enlaceResponde: solo 200 y 206 valen', () => {
  assert.equal(enlaceResponde(200), true);
  assert.equal(enlaceResponde(206), true);
  assert.equal(enlaceResponde(404), false);
  assert.equal(enlaceResponde(0), false);
});

test('parsearArgumentos: valores por defecto y flags', () => {
  assert.deepEqual(parsearArgumentos([]), { baseUrl: '', notas: null, salida: 'dist-publicar', apk: null });
  const r = parsearArgumentos(['--base-url', 'https://x.io/r', '--notas', 'a|b', '--salida', 'out']);
  assert.equal(r.baseUrl, 'https://x.io/r');
  assert.equal(r.notas, 'a|b');
  assert.equal(r.salida, 'out');
  assert.throws(() => parsearArgumentos(['--raro']));
});

test('nombres y URL', () => {
  assert.equal(nombreVersion(42), '1.42');
  assert.equal(nombreApk('1.42'), 'musicsippi-1.42.apk');
  assert.equal(urlApk('https://x.io/r/', 'a.apk'), 'https://x.io/r/a.apk');
  assert.equal(urlApk('', 'a.apk'), 'a.apk');
});

test('normalizarNotas: --notas manda; si no, commits sin merges', () => {
  assert.deepEqual(normalizarNotas('uno | dos\ntres'), ['uno', 'dos', 'tres']);
  assert.deepEqual(normalizarNotas(null, ['Arreglo A', 'Merge branch x', '  ']), ['Arreglo A']);
  assert.equal(normalizarNotas(null, Array(40).fill('x')).length, 15);
});

test('construirManifiesto', () => {
  assert.deepEqual(construirManifiesto({ versionCode: 7, baseUrl: 'https://x.io', notas: ['n'] }), {
    versionCode: 7,
    versionName: '1.7',
    url: 'https://x.io/musicsippi-1.7.apk',
    notas: ['n'],
  });
  assert.equal(construirManifiesto({ versionCode: 7, baseUrl: '', notas: [], minimo: 5 }).minimo, 5);
});

test('commitsDesdeUltima', () => {
  assert.equal(commitsDesdeUltima(50, 45), 5);
  assert.equal(commitsDesdeUltima(50, null), 10);
  assert.equal(commitsDesdeUltima(500, 1), 30);
  assert.equal(commitsDesdeUltima(5, 9), 0);
});
