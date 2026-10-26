import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirRedMedida } from './red-medida.js';

test('error del plugin sin connection en Android: medida (falla cerrada)', () => {
  assert.equal(decidirRedMedida({ errorNativo: true, esAndroid: true }), true);
});
test('error del plugin con connection wifi: no medida', () => {
  assert.equal(decidirRedMedida({ errorNativo: true, connection: { type: 'wifi' }, esAndroid: true }), false);
});
test('error del plugin con connection cellular o saveData: medida', () => {
  assert.equal(decidirRedMedida({ errorNativo: true, connection: { type: 'cellular' }, esAndroid: true }), true);
  assert.equal(decidirRedMedida({ errorNativo: true, connection: { saveData: true }, esAndroid: true }), true);
});
test('el sistema responde que no es medida: no medida', () => {
  assert.equal(decidirRedMedida({ nativo: { medida: false }, esAndroid: true }), false);
  assert.equal(decidirRedMedida({ nativo: { medida: true }, esAndroid: true }), true);
});
test('web sin connection: no medida', () => {
  assert.equal(decidirRedMedida({ esAndroid: false }), false);
});
