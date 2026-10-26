import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obtenerCampo, verificarContrato } from './contratos-externos.mjs';

test('obtenerCampo navega rutas anidadas por punto', () => {
  const obj = { basic_info: { channel: { name: 'X' } } };
  assert.equal(obtenerCampo(obj, 'basic_info.channel.name'), 'X');
});

test('obtenerCampo devuelve undefined si falta un eslabon', () => {
  const obj = { basic_info: {} };
  assert.equal(obtenerCampo(obj, 'basic_info.channel.name'), undefined);
});

test('verificarContrato marca ok cuando todos los campos requeridos estan presentes', async () => {
  const contrato = {
    fuente: 'falsa-ok',
    ejecutar: async () => ({ a: { b: 1 } }),
    requiere: ['a.b'],
  };
  const resultado = await verificarContrato(contrato);
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.camposFaltantes, []);
});

test('verificarContrato detecta campos faltantes sin lanzar excepcion', async () => {
  const contrato = {
    fuente: 'falsa-rota',
    ejecutar: async () => ({ a: {} }),
    requiere: ['a.b', 'a.c'],
  };
  const resultado = await verificarContrato(contrato);
  assert.equal(resultado.ok, false);
  assert.deepEqual(resultado.camposFaltantes, ['a.b', 'a.c']);
});

test('verificarContrato captura excepciones de la propia consulta', async () => {
  const contrato = {
    fuente: 'falsa-que-explota',
    ejecutar: async () => { throw new Error('red caida'); },
    requiere: ['x'],
  };
  const resultado = await verificarContrato(contrato);
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /red caida/);
});
