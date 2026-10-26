import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashTexto, cargarVectores, guardarVectores } from './vectores.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';

test('hashTexto es estable, de 16 hex, y distingue textos', () => {
  assert.equal(hashTexto('Soda Stereo — Persiana americana.'), hashTexto('Soda Stereo — Persiana americana.'));
  assert.match(hashTexto('a'), /^[0-9a-f]{16}$/);
  assert.notEqual(hashTexto('a'), hashTexto('b'));
});

test('guarda y carga solo los vectores pedidos', async () => {
  const almacen = crearAlmacenMemoria();
  await guardarVectores(almacen, [
    { trackId: 'a', hash: 'h1', vector: Float32Array.from([1, 2]) },
    { trackId: 'b', hash: 'h2', vector: Float32Array.from([3, 4]) },
  ]);
  const r = await cargarVectores(almacen, ['b']);
  assert.equal(r.length, 1);
  assert.equal(r[0].trackId, 'b');
  assert.ok(r[0].vector instanceof Float32Array);
});
