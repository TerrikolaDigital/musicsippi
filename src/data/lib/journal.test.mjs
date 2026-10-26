import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anotarCambio, descartarCambios, CLAVE_CAMBIOS } from './journal.js';
import { crearAlmacenMemoria } from './almacen-memoria.js';

test('anota los cambios en orden con su endpoint y cuerpo', async () => {
  const almacen = crearAlmacenMemoria();
  await anotarCambio(almacen, 'importar-tunemymusic', { contenido: 'csv' }, 1);
  await anotarCambio(almacen, 'confirmar-modos', { modosConfirmados: [] }, 2);
  assert.deepEqual(await almacen.obtenerValorConfig(CLAVE_CAMBIOS, []), [
    { endpoint: 'importar-tunemymusic', cuerpo: { contenido: 'csv' }, ts: 1 },
    { endpoint: 'confirmar-modos', cuerpo: { modosConfirmados: [] }, ts: 2 },
  ]);
});

test('dos anotarCambio concurrentes no pierden entradas', async () => {
  const almacen = crearAlmacenMemoria();
  await Promise.all([
    anotarCambio(almacen, 'a', {}, 1),
    anotarCambio(almacen, 'b', {}, 2),
    anotarCambio(almacen, 'c', {}, 3),
  ]);
  const hechos = await almacen.obtenerValorConfig(CLAVE_CAMBIOS, []);
  assert.deepEqual(hechos.map((c) => c.endpoint).sort(), ['a', 'b', 'c']);
});

test('descartar los aplicados no pierde lo anotado a la vez', async () => {
  const almacen = crearAlmacenMemoria();
  await anotarCambio(almacen, 'a', {}, 1);
  await anotarCambio(almacen, 'b', {}, 2);
  await Promise.all([descartarCambios(almacen, 1), anotarCambio(almacen, 'c', {}, 3)]);
  const hechos = await almacen.obtenerValorConfig(CLAVE_CAMBIOS, []);
  assert.deepEqual(hechos.map((c) => c.endpoint), ['b', 'c']);
});
