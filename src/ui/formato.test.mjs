import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatearTitulo, colorDeEje, reloj } from './formato.js';

test('reloj formatea minutos y segundos', () => {
  assert.equal(reloj(0), '0:00');
  assert.equal(reloj(65), '1:05');
  assert.equal(reloj(3599), '59:59');
  assert.equal(reloj(NaN), '0:00');
});

test('colorDeEje respeta el color propio y si no es estable por id', () => {
  assert.equal(colorDeEje({ id: 'x', color: '#123456' }), '#123456');
  assert.equal(colorDeEje({ id: 'rock' }), colorDeEje({ id: 'rock' }));
  assert.match(colorDeEje({ id: 'rock' }), /^hsl\(/);
});

test('formatearTitulo corrige solo todo mayúsculas o todo minúsculas', () => {
  assert.equal(formatearTitulo('HELLO OF THE WORLD'), 'Hello of the World');
  assert.equal(formatearTitulo('One Kiss'), 'One Kiss');
  assert.equal(formatearTitulo('dj snake'), 'DJ Snake');
  assert.equal(formatearTitulo('R.E.M.'), 'R.E.M.');
});
