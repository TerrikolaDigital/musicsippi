import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarManifiesto,
  compararVersiones,
  hayVersionNueva,
  debeComprobar,
  posponerHasta,
  debeAvisar,
  INTERVALO_COMPROBAR_MS,
  POSPONER_MS,
  URL_MANIFIESTO,
} from './actualizaciones.js';

const man = (extra = {}) => normalizarManifiesto({ versionCode: 20, versionName: '1.20', url: 'https://x.io/a.apk', notas: ['Mejora'], ...extra });

test('el manifiesto se pide a GitHub Releases por https', () => assert.match(URL_MANIFIESTO, /^https:\/\/github\.com\/.+\/releases\/latest\/download\/version\.json$/));

test('normalizarManifiesto: válido, notas limpias y minimo opcional', () => {
  assert.deepEqual(man({ notas: [' a ', '', 3] }), { versionCode: 20, versionName: '1.20', url: 'https://x.io/a.apk', notas: ['a'], minimo: null });
  assert.equal(man({ minimo: 15 }).minimo, 15);
});
test('normalizarManifiesto: rechaza basura', () => {
  assert.equal(normalizarManifiesto(null), null);
  assert.equal(normalizarManifiesto({ versionCode: 'x', url: 'https://a' }), null);
  assert.equal(normalizarManifiesto({ versionCode: 5, url: 'javascript:alert(1)' }), null);
  assert.equal(normalizarManifiesto({ versionCode: 5 }), null);
});

test('comparar y hayVersionNueva', () => {
  assert.ok(compararVersiones(10, 9) > 0);
  assert.equal(hayVersionNueva(19, man()), true);
  assert.equal(hayVersionNueva(20, man()), false);
  assert.equal(hayVersionNueva(21, man()), false);
  assert.equal(hayVersionNueva(null, man()), false);
  assert.equal(hayVersionNueva(1, null), false);
});

test('debeComprobar: 12 h', () => {
  const ahora = 1_000_000_000;
  assert.equal(debeComprobar({ ahora, ultima: null }), true);
  assert.equal(debeComprobar({ ahora, ultima: ahora - 1000 }), false);
  assert.equal(debeComprobar({ ahora, ultima: ahora - INTERVALO_COMPROBAR_MS }), true);
  assert.equal(debeComprobar({ ahora, ultima: ahora + 5 }), true);
});

test('debeAvisar: posponer 3 días, omitir y mínimo obligatorio', () => {
  const ahora = 5_000_000_000;
  const base = { instalada: 10, manifiesto: man(), ahora };
  assert.equal(debeAvisar(base), true);
  assert.equal(posponerHasta(ahora), ahora + POSPONER_MS);
  assert.equal(debeAvisar({ ...base, estado: { pospuestoHasta: ahora + 1 } }), false);
  assert.equal(debeAvisar({ ...base, estado: { pospuestoHasta: ahora } }), true);
  assert.equal(debeAvisar({ ...base, estado: { omitida: 20 } }), false);
  assert.equal(debeAvisar({ ...base, estado: { omitida: 19 } }), true);
  assert.equal(debeAvisar({ ...base, manifiesto: man({ minimo: 15 }), estado: { omitida: 20, pospuestoHasta: ahora + 9 } }), true);
  assert.equal(debeAvisar({ ...base, instalada: 20 }), false);
});
