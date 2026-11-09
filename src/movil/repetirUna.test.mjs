import test from 'node:test';
import assert from 'node:assert/strict';
import { aleatorioRestaurado, repeticionSeCancela, repetirSegunAleatorio } from './repetirUna.js';

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

test('aleatorio y repetir se excluyen: una sesión guardada con los dos conserva repetir', () => {
  assert.equal(aleatorioRestaurado({ aleatorio: true, repetir: true }), false);
  assert.equal(aleatorioRestaurado({ aleatorio: true, repetir: false }), true);
  assert.equal(aleatorioRestaurado({ aleatorio: false, repetir: false }), false);
});

test('sin sesión guardada, aleatorio arranca encendido', () => {
  assert.equal(aleatorioRestaurado(null), true);
  assert.equal(aleatorioRestaurado({}), true);
});

test('encender aleatorio, por el camino que sea, apaga repetir', () => {
  assert.equal(repetirSegunAleatorio(true, true), false);
  assert.equal(repetirSegunAleatorio(true, false), false);
});

test('apagar aleatorio deja repetir como estaba', () => {
  assert.equal(repetirSegunAleatorio(false, true), true);
  assert.equal(repetirSegunAleatorio(false, false), false);
});
