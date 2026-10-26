import test from 'node:test';
import assert from 'node:assert/strict';
import { insertarDespues, agregarAlFinal } from './insertarCola.js';

const t = (...ids) => ids.map((id) => ({ id }));
const ids = (c) => c.map((x) => x.id);

test('insertarDespues con cola vacía arranca con la lista completa en orden', () => {
  const r = insertarDespues([], -1, t('a', 'b', 'c'));
  assert.deepEqual(ids(r.cola), ['a', 'b', 'c']);
  assert.equal(r.indice, 0);
});

test('insertarDespues con cola mete todas tras la actual conservando orden', () => {
  const r = insertarDespues(t('x', 'y', 'z'), 1, t('a', 'b', 'c'));
  assert.deepEqual(ids(r.cola), ['x', 'y', 'a', 'b', 'c', 'z']);
  assert.equal(r.indice, 1);
});

test('insertarDespues con la actual al final añade tras ella', () => {
  const r = insertarDespues(t('x', 'y'), 1, t('a', 'b'));
  assert.deepEqual(ids(r.cola), ['x', 'y', 'a', 'b']);
});

test('insertarDespues con índice fuera de rango no rompe', () => {
  assert.deepEqual(ids(insertarDespues(t('x'), 9, t('a')).cola), ['x', 'a']);
  assert.deepEqual(ids(insertarDespues(t('x'), -5, t('a')).cola), ['a', 'x']);
});

test('insertarDespues sin pistas no cambia nada y no muta la entrada', () => {
  const cola = t('x');
  const r = insertarDespues(cola, 0, []);
  assert.equal(r.cola, cola);
  insertarDespues(cola, 0, t('a'));
  assert.deepEqual(ids(cola), ['x']);
});

test('agregarAlFinal con cola vacía arranca; con cola añade todas al final', () => {
  const v = agregarAlFinal([], -1, t('a', 'b'));
  assert.deepEqual(ids(v.cola), ['a', 'b']);
  assert.equal(v.indice, 0);
  const r = agregarAlFinal(t('x', 'y'), 0, t('a', 'b'));
  assert.deepEqual(ids(r.cola), ['x', 'y', 'a', 'b']);
  assert.equal(r.indice, 0);
});
