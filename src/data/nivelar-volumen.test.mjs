import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gananciaNivelada, loudnessRelativo, dbALineal, volumenEfectivo, leerNivelar, guardarNivelar } from './nivelar-volumen.js';

test('atenúa lo más fuerte que la referencia', () => {
  assert.equal(gananciaNivelada(3), -3);
  assert.equal(gananciaNivelada(0.99), -0.99);
});

test('nunca sube: pistas flojas o en la referencia quedan a 0 dB', () => {
  assert.equal(gananciaNivelada(-5), 0);
  assert.equal(gananciaNivelada(0), 0);
  assert.ok(Object.is(gananciaNivelada(0), 0));
});

test('limita la atenuación a -12 dB', () => {
  assert.equal(gananciaNivelada(20), -12);
});

test('sin dato -> 0 dB', () => {
  for (const v of [undefined, null, NaN, 'x']) assert.equal(gananciaNivelada(v), 0);
});

test('objetivo desplaza el punto de atenuación y sigue sin subir', () => {
  assert.equal(gananciaNivelada(5, { objetivo: 2 }), -3);
  assert.equal(gananciaNivelada(1, { objetivo: 2 }), 0);
});

test('loudnessRelativo usa loudnessDb o, si falta, la perceptual + 14', () => {
  assert.equal(loudnessRelativo({ loudnessDb: 1.5, perceptualLoudnessDb: -13 }), 1.5);
  assert.ok(Math.abs(loudnessRelativo({ perceptualLoudnessDb: -13.01 }) - 0.99) < 1e-9);
  assert.equal(loudnessRelativo({}), null);
  assert.equal(loudnessRelativo(), null);
});

test('dbALineal y volumenEfectivo', () => {
  assert.equal(dbALineal(0), 1);
  assert.ok(Math.abs(dbALineal(-6) - 0.501) < 0.001);
  assert.equal(dbALineal(5), 1); // no sube
  assert.equal(volumenEfectivo(80, 0), 80);
  assert.ok(Math.abs(volumenEfectivo(100, -6) - 50.1) < 0.1);
  assert.equal(volumenEfectivo(100, -6, false), 100);
});

test('preferencia: activada por defecto y persistida', () => {
  const mem = new Map();
  const almacen = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(leerNivelar(almacen), true);
  guardarNivelar(false, almacen);
  assert.equal(leerNivelar(almacen), false);
  guardarNivelar(true, almacen);
  assert.equal(leerNivelar(almacen), true);
  assert.equal(leerNivelar({ getItem() { throw new Error('x'); } }), true);
});
