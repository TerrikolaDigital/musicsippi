import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveDesfase, ajustarDesfase, textoDesfase } from './desfase-letra.js';

test('claveDesfase normaliza artista y título', () => {
  assert.equal(claveDesfase({ artista: 'Shakira ', titulo: 'El Jefe' }), 'shakira|el jefe');
});

test('ajustarDesfase suma, redondea a décimas y limita a ±120 s', () => {
  assert.equal(ajustarDesfase(0, 0.5), 0.5);
  assert.equal(ajustarDesfase(0.1, 0.2), 0.3);
  assert.equal(ajustarDesfase(118, 5), 120);
  assert.equal(ajustarDesfase(-118, -5), -120);
  assert.equal(ajustarDesfase(NaN, 5), 5);
});

test('textoDesfase', () => {
  assert.equal(textoDesfase(0), 'Sincronizada');
  assert.equal(textoDesfase(16), 'Letra +16,0 s');
  assert.equal(textoDesfase(-0.5), 'Letra −0,5 s');
});
