import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSeguimientoDescarga } from './descarga.js';

test('suma los bytes de todos los archivos y redondea', () => {
  const seguir = crearSeguimientoDescarga();
  assert.equal(seguir({ status: 'initiate', file: 'onnx/model_quantized.onnx' }), null);
  assert.equal(seguir({ status: 'progress', file: 'a', loaded: 50, total: 100 }), 50);
  assert.equal(seguir({ status: 'progress', file: 'b', loaded: 0, total: 300 }), 13);
  assert.equal(seguir({ status: 'done', file: 'a' }), 25);
});

test('los eventos sin archivo (ready) no cambian nada', () => {
  const seguir = crearSeguimientoDescarga();
  assert.equal(seguir({ status: 'ready', task: 'feature-extraction' }), null);
  assert.equal(seguir(null), null);
});
