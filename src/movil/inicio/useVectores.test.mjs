// Caché de vectores de Inicio: se invalida al cambiar la biblioteca y tolera fallos de lectura.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarVectores, reiniciarCacheVectores } from './useVectores.js';

const ctxCon = (n, leerVectores) => ({ tracks: new Array(n).fill({}), leerVectores });

test('reutiliza la caché mientras la biblioteca no cambia', async () => {
  reiniciarCacheVectores();
  let llamadas = 0;
  const leer = () => (llamadas++, [1]);
  await cargarVectores(ctxCon(3, leer));
  await cargarVectores(ctxCon(3, leer));
  assert.equal(llamadas, 1);
});

test('invalida la caché si cambia el número de canciones', async () => {
  reiniciarCacheVectores();
  let llamadas = 0;
  const leer = () => (llamadas++, [llamadas]);
  assert.deepEqual(await cargarVectores(ctxCon(3, leer)), [1]);
  assert.deepEqual(await cargarVectores(ctxCon(4, leer)), [2]);
});

test('caduca pasado el minuto', async () => {
  reiniciarCacheVectores();
  let llamadas = 0;
  const leer = () => (llamadas++, []);
  await cargarVectores(ctxCon(1, leer), 0);
  await cargarVectores(ctxCon(1, leer), 61_000);
  assert.equal(llamadas, 2);
});

test('si leerVectores lanza (síncrono o asíncrono) devuelve []', async () => {
  reiniciarCacheVectores();
  assert.deepEqual(await cargarVectores(ctxCon(1, () => { throw new Error('x'); })), []);
  reiniciarCacheVectores();
  assert.deepEqual(await cargarVectores(ctxCon(1, async () => { throw new Error('x'); })), []);
});
