import test from 'node:test';
import assert from 'node:assert/strict';
import {
  traducirPreset, opcionesPreset, etiquetaFrecuencia, etiquetaDb, fuerzaAPorcentaje, porcentajeAFuerza,
} from './efectos-audio.js';

test('presets: traducidos y con «Personalizado» al final', () => {
  assert.equal(traducirPreset('Classical'), 'Clásica');
  assert.equal(traducirPreset('Heavy Metal'), 'Heavy metal');
  assert.equal(traducirPreset('Preset del fabricante'), 'Preset del fabricante');
  const o = opcionesPreset(['Normal', 'Rock']);
  assert.deepEqual(o, [
    { indice: 0, nombre: 'Normal' },
    { indice: 1, nombre: 'Rock' },
    { indice: -1, nombre: 'Personalizado' },
  ]);
  assert.deepEqual(opcionesPreset(undefined), [{ indice: -1, nombre: 'Personalizado' }]);
});

test('etiquetas de frecuencia y de ganancia', () => {
  assert.equal(etiquetaFrecuencia(60), '60 Hz');
  assert.equal(etiquetaFrecuencia(1000), '1 kHz');
  assert.equal(etiquetaFrecuencia(3600), '3,6 kHz');
  assert.equal(etiquetaFrecuencia(0), '');
  assert.equal(etiquetaDb(0), '0 dB');
  assert.equal(etiquetaDb(300), '+3 dB');
  assert.equal(etiquetaDb(-250), '−2,5 dB');
});

test('fuerza nativa <-> porcentaje', () => {
  assert.equal(fuerzaAPorcentaje(700), 70);
  assert.equal(fuerzaAPorcentaje(5000), 100);
  assert.equal(porcentajeAFuerza(30), 300);
  assert.equal(porcentajeAFuerza(-4), 0);
});
