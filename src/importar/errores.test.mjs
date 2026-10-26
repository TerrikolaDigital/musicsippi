import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorImportar, mensajeError, jsonDe } from './errores.js';

test('cada código tiene un mensaje para la UI y hay uno genérico', () => {
  for (const codigo of ['no-reconocido', 'privada', 'vacia', 'sin-red', 'formato-cambiado']) {
    assert.ok(mensajeError(codigo).length > 20, codigo);
  }
  assert.equal(mensajeError('otro'), 'No se pudo importar la playlist.');
});

test('ErrorImportar lleva código, detalle y el mensaje de la UI', () => {
  const e = new ErrorImportar('privada', 'HTTP 404');
  assert.equal(e.codigo, 'privada');
  assert.equal(e.detalle, 'HTTP 404');
  assert.equal(e.message, mensajeError('privada'));
  assert.ok(e instanceof Error);
});

test('formato-cambiado sugiere probar más tarde o compartir desde otra app', () => {
  assert.match(mensajeError('formato-cambiado'), /más tarde/);
  assert.match(mensajeError('formato-cambiado'), /compart/);
});

test('jsonDe convierte el texto o falla como formato-cambiado', () => {
  assert.deepEqual(jsonDe({ texto: '{"a":1}' }), { a: 1 });
  assert.throws(() => jsonDe({ texto: '<html>' }), (e) => e.codigo === 'formato-cambiado');
});
