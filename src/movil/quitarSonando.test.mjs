import test from 'node:test';
import assert from 'node:assert/strict';
import { accionAlQuitar } from './quitarSonando.js';

const cola = [{ id: 'a' }, { id: 'b' }, { id: 'c', trackIdReal: 'real' }];

test('quitar la que suena salta a la siguiente', () => {
  assert.equal(accionAlQuitar(cola, 1, 'b'), 'siguiente');
});

test('una canción de la cola con id propio se compara por su id real', () => {
  assert.equal(accionAlQuitar(cola, 2, 'real'), 'siguiente');
  assert.equal(accionAlQuitar(cola, 2, 'c'), 'nada');
});

test('la vista previa de una canción añadida se reconoce por el vídeo', () => {
  const previa = [{ id: 'preview-x', youtubeVideoId: 'vid' }, { id: 'b' }];
  assert.equal(accionAlQuitar(previa, 0, 'biblioteca-x', 'vid'), 'siguiente');
  assert.equal(accionAlQuitar(previa, 0, 'biblioteca-x', 'otro'), 'nada');
  assert.equal(accionAlQuitar(previa, 0, 'biblioteca-x'), 'nada');
});

test('si es la única de la cola se para', () => {
  assert.equal(accionAlQuitar([{ id: 'a' }], 0, 'a'), 'parar');
});

test('quitar otra canción no toca lo que suena', () => {
  assert.equal(accionAlQuitar(cola, 0, 'b'), 'nada');
  assert.equal(accionAlQuitar([], 0, 'a'), 'nada');
});
