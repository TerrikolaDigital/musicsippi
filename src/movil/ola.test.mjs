// src/movil/ola.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trazoOnda, progresoValido, xEscuchado } from './ola.js';

test('trazoOnda: empieza en (0,y) y cubre al menos el ancho pedido', () => {
  const d = trazoOnda(100, 10, 4, 20);
  assert.ok(d.startsWith('M0 10 Q5 6 10 10'));
  const xs = [...d.matchAll(/T(\d+(?:\.\d+)?) /g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...xs) >= 100 + 20);
  assert.equal(xs[0], 20);
});

test('trazoOnda: avanza media longitud de onda por tramo', () => {
  const xs = [...trazoOnda(60, 5, 2, 20).matchAll(/T(\d+(?:\.\d+)?) /g)].map((m) => Number(m[1]));
  for (let i = 1; i < xs.length; i++) assert.equal(xs[i] - xs[i - 1], 10);
});

test('trazoOnda: parámetros inválidos dan una recta, nunca NaN', () => {
  assert.ok(!trazoOnda(NaN, 5, 2, 20).includes('NaN'));
  assert.ok(!trazoOnda(100, 5, 2, 0).includes('NaN'));
  assert.ok(!trazoOnda(100, 5, 2, 0).includes('Infinity'));
});

test('progresoValido: clamp 0–1 y NaN a 0', () => {
  assert.equal(progresoValido(0.4), 0.4);
  assert.equal(progresoValido(-1), 0);
  assert.equal(progresoValido(3), 1);
  assert.equal(progresoValido(NaN), 0);
  assert.equal(progresoValido(undefined), 0);
  assert.equal(progresoValido(Infinity), 0);
});

test('xEscuchado: recorte en unidades del viewBox', () => {
  assert.equal(xEscuchado(0.5, 200), 100);
  assert.equal(xEscuchado(2, 200), 200);
  assert.equal(xEscuchado(NaN, 200), 0);
});
