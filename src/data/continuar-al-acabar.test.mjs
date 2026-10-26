import test from 'node:test';
import assert from 'node:assert/strict';
import { leerContinuar, guardarContinuar } from './continuar-al-acabar.js';

test('continuar al acabar: activado por defecto y persistido', () => {
  const mem = new Map();
  const almacen = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(leerContinuar(almacen), true);
  guardarContinuar(false, almacen);
  assert.equal(leerContinuar(almacen), false);
  guardarContinuar(true, almacen);
  assert.equal(leerContinuar(almacen), true);
  assert.equal(leerContinuar({ getItem() { throw new Error('x'); } }), true);
});
