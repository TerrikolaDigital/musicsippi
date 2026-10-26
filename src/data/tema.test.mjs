import test from 'node:test';
import assert from 'node:assert/strict';
import { leerTema, temaEfectivo } from './tema.js';

const almacen = (v) => ({ getItem: () => v });

test('sin preferencia guardada el tema es «sistema»', () => {
  assert.equal(leerTema(almacen(null)), 'sistema');
  assert.equal(leerTema(almacen('rosa')), 'sistema');
  assert.equal(leerTema({ getItem: () => { throw new Error('x'); } }), 'sistema');
});

test('lee claro y oscuro guardados', () => {
  assert.equal(leerTema(almacen('claro')), 'claro');
  assert.equal(leerTema(almacen('oscuro')), 'oscuro');
});

test('«sistema» sigue al móvil; claro y oscuro mandan', () => {
  assert.equal(temaEfectivo('sistema', true), 'oscuro');
  assert.equal(temaEfectivo('sistema', false), 'claro');
  assert.equal(temaEfectivo('claro', true), 'claro');
  assert.equal(temaEfectivo('oscuro', false), 'oscuro');
});
