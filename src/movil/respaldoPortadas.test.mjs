import test from 'node:test';
import assert from 'node:assert/strict';
import { registrarRespaldo, respaldoDeUrl } from './respaldoPortadas.js';

test('respaldo de portadas: se registra por dirección y se ignoran datos inválidos o iguales', () => {
  registrarRespaldo('https://a/1.jpg', 'https://b/2.jpg');
  registrarRespaldo('https://a/3.jpg', 'https://a/3.jpg');
  registrarRespaldo(null, 'https://b/2.jpg');
  assert.equal(respaldoDeUrl('https://a/1.jpg'), 'https://b/2.jpg');
  assert.equal(respaldoDeUrl('https://a/3.jpg'), null);
  assert.equal(respaldoDeUrl(undefined), null);
});
