import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrasteBlanco, luminanciaDeDatos, luminanciaRgb, veloMini, veloReproductor } from './veloRep.js';

const mezcla = (l, a) => (1 - a) * l + a * 0.004;

test('luminanciaRgb: negro 0, blanco 1', () => {
  assert.equal(luminanciaRgb(0, 0, 0), 0);
  assert.ok(Math.abs(luminanciaRgb(255, 255, 255) - 1) < 1e-6);
});

test('luminanciaDeDatos: toma la mitad inferior si es más clara', () => {
  const px = [];
  for (let i = 0; i < 8; i++) px.push(0, 0, 0, 255);
  for (let i = 0; i < 8; i++) px.push(255, 255, 255, 255);
  const l = luminanciaDeDatos(Uint8ClampedArray.from(px));
  assert.ok(l > 0.99);
});

test('carátula oscura: valores de siempre', () => {
  assert.deepEqual(veloReproductor(0.02), { medio: 0.25, fin: 0.72, mascara: 0.55 });
  assert.deepEqual(veloReproductor(NaN), { medio: 0.25, fin: 0.72, mascara: 0.55 });
  assert.equal(veloMini(0.05), 0.35);
});

test('carátula clara: el texto blanco llega a 4.5:1 en todo el rango', () => {
  for (let l = 0; l <= 1.0001; l += 0.05) {
    const v = veloReproductor(l);
    assert.ok(v.fin >= v.medio && v.medio >= 0.25);
    assert.ok(contrasteBlanco(mezcla(l, v.fin)) >= 4.5, `fin l=${l}`);
    assert.ok(contrasteBlanco(mezcla(l, v.medio)) >= 4.5, `medio l=${l}`);
    const m = veloMini(l);
    assert.ok(contrasteBlanco(mezcla(l * 0.33, m)) >= 4.5, `mini l=${l}`);
  }
});

test('carátula clara refuerza el degradado de la portada', () => {
  assert.ok(veloReproductor(0.9).mascara < 0.55);
  assert.ok(veloReproductor(0.9).fin > 0.72);
});
