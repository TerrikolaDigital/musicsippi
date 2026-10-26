// src/movil/gestos.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deberiaCerrar, direccionDeslizar, VELOCIDAD_CIERRE } from './gestos.js';

test('cierra por distancia o por velocidad, no por un toque', () => {
  assert.equal(deberiaCerrar({ dy: 130, vy: 0.01 }), true);
  assert.equal(deberiaCerrar({ dy: 40, vy: 0.9 }), true);
  assert.equal(deberiaCerrar({ dy: 40, vy: 0.05 }), false);
  assert.equal(deberiaCerrar({ dy: -200, vy: -1 }), false);
});

test('el umbral de velocidad es 0.11 px/ms: un empujón corto ya cierra', () => {
  assert.equal(VELOCIDAD_CIERRE, 0.11);
  assert.equal(deberiaCerrar({ dy: 40, vy: 0.12 }), true);
  assert.equal(deberiaCerrar({ dy: 40, vy: 0.11 }), false); // estrictamente mayor
  assert.equal(deberiaCerrar({ dy: 40, vy: 0.2 }), true);
});

test('un roce de unos píxeles no cierra aunque vaya «rápido»', () => {
  assert.equal(deberiaCerrar({ dy: 3, vy: 0.5 }), false);
  assert.equal(deberiaCerrar({ dy: 0, vy: 1 }), false);
});

test('con el alto de la capa, cierra al pasar el 30 % de su altura', () => {
  assert.equal(deberiaCerrar({ dy: 100, vy: 0.01, alto: 300 }), true);
  assert.equal(deberiaCerrar({ dy: 80, vy: 0.01, alto: 300 }), false);
  // sin alto sigue valiendo el límite fijo de 120 px
  assert.equal(deberiaCerrar({ dy: 121, vy: 0.01 }), true);
  assert.equal(deberiaCerrar({ dy: 119, vy: 0.01 }), false);
});

test('direccionDeslizar: umbral por ancho y horizontalidad', () => {
  assert.equal(direccionDeslizar({ dx: -550, dy: 0, ancho: 390 }), -1);
  assert.equal(direccionDeslizar({ dx: 120, dy: 10, ancho: 390 }), 1);
  assert.equal(direccionDeslizar({ dx: -80, dy: 0, ancho: 390 }), 0); // corto: < 25 % del ancho
  assert.equal(direccionDeslizar({ dx: -150, dy: 140, ancho: 390 }), 0); // diagonal
  assert.equal(direccionDeslizar({ dx: 5, dy: 0, ancho: 390 }), 0);
});
