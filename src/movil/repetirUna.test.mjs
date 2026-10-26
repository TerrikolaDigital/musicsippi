import test from 'node:test';
import assert from 'node:assert/strict';
import { repeticionSeCancela } from './repetirUna.js';

test('repetir: si la canción cambia, se desactiva', () => {
  assert.equal(repeticionSeCancela({ repetir: true, idAnterior: 'a', idNuevo: 'b' }), true);
  assert.equal(repeticionSeCancela({ repetir: true, idAnterior: 'a', idNuevo: null }), true);
});

test('repetir: la misma canción (fin natural, reorden de cola) lo conserva', () => {
  assert.equal(repeticionSeCancela({ repetir: true, idAnterior: 'a', idNuevo: 'a' }), false);
});

test('repetir: sin canción previa (arranque, sesión restaurada) lo conserva', () => {
  assert.equal(repeticionSeCancela({ repetir: true, idAnterior: null, idNuevo: 'a' }), false);
  assert.equal(repeticionSeCancela({ repetir: true, idAnterior: undefined, idNuevo: 'a' }), false);
});

test('repetir: apagado nunca se "cancela"', () => {
  assert.equal(repeticionSeCancela({ repetir: false, idAnterior: 'a', idNuevo: 'b' }), false);
});
