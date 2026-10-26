import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trocearTexto } from './trocear-texto.js';

test('texto vacío: sin trozos', () => assert.deepEqual(trocearTexto(''), []));
test('texto corto: un trozo', () => assert.deepEqual(trocearTexto('hola', 10), ['hola']));
test('trozos de tamaño máximo y recomposición exacta', () => {
  const t = 'abcdefghij'.repeat(35);
  const r = trocearTexto(t, 100);
  assert.equal(r.length, 4);
  assert.ok(r.every((x) => x.length <= 100));
  assert.equal(r.join(''), t);
});
test('no corta pares sustitutos', () => {
  const t = 'a' + '😀'.repeat(10);
  const r = trocearTexto(t, 4);
  assert.ok(r.every((x) => x.length <= 4));
  assert.ok(r.every((x) => !/[\ud800-\udbff]$/.test(x) && !/^[\udc00-\udfff]/.test(x)));
  assert.equal(r.join(''), t);
});
