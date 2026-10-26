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
} from './publicar-version.mjs';

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
