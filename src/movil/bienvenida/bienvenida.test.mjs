// src/movil/bienvenida/bienvenida.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASOS, debeMostrarBienvenida, pasoPorGesto, pasoValido } from './bienvenida.js';

test('se muestra solo la primera vez, aunque luego la biblioteca esté vacía', () => {
  assert.equal(debeMostrarBienvenida({ vista: false, numTracks: 500 }), true);
  assert.equal(debeMostrarBienvenida({ vista: true, numTracks: 0 }), false);
  assert.equal(debeMostrarBienvenida({ vista: true, numTracks: 3 }), false);
});

test('el recorrido tiene 6 pantallas y el paso se mantiene dentro', () => {
  assert.equal(PASOS, 6);
  assert.equal(pasoValido(0), 1);
  assert.equal(pasoValido(9), 6);
  assert.equal(pasoValido(undefined), 1);
  assert.equal(pasoValido(4), 4);
});

test('el gesto horizontal avanza o retrocede; el vertical o corto no', () => {
  const base = { ms: 300, ancho: 390 };
  assert.equal(pasoPorGesto({ ...base, dx: -120, dy: 10 }), 1);
  assert.equal(pasoPorGesto({ ...base, dx: 120, dy: 10 }), -1);
  assert.equal(pasoPorGesto({ ...base, dx: -40, dy: 5 }), 0);
  assert.equal(pasoPorGesto({ ...base, dx: -100, dy: 160 }), 0);
  assert.equal(pasoPorGesto({ dx: -50, dy: 4, ms: 80, ancho: 390 }), 1); // golpe rápido
  assert.equal(pasoPorGesto({ dx: NaN, dy: 0, ms: 80, ancho: 390 }), 0);
});
