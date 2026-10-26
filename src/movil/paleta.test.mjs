// src/movil/paleta.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paletaDeDatos, colorDeDatos } from '../colorPortada.js';

function pixeles(...bloques) {
  const out = [];
  for (const [n, r, g, b] of bloques) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  return Uint8ClampedArray.from(out);
}

test('paletaDeDatos: dos tonos lejanos dan principal (más peso) y secundario', () => {
  const p = paletaDeDatos(pixeles([80, 230, 30, 40], [30, 40, 60, 230]));
  assert.ok(p.principal.r > p.principal.b, 'principal rojizo');
  assert.ok(p.secundario.b > p.secundario.r, 'secundario azulado');
});

test('paletaDeDatos: el secundario exige >= 60 grados de tono', () => {
  // rojo y naranja (~25 grados) no son tonos distintos
  const p = paletaDeDatos(pixeles([80, 230, 30, 40], [40, 230, 100, 30]));
  assert.deepEqual(p.secundario, p.principal);
});

test('paletaDeDatos: el fondo es un tono oscuro del principal', () => {
  const p = paletaDeDatos(pixeles([80, 230, 30, 40]));
  assert.ok(Math.max(p.fondo.r, p.fondo.g, p.fondo.b) <= 60);
  assert.ok(p.fondo.r > p.fondo.b, 'mantiene el tono');
});

test('paletaDeDatos: portada sin color da null', () => {
  assert.equal(paletaDeDatos(pixeles([100, 20, 20, 20], [100, 128, 128, 128])), null);
});

test('colorDeDatos conserva el comportamiento de colorDePortada', () => {
  const c = colorDeDatos(pixeles([80, 230, 30, 40], [30, 40, 60, 230]));
  assert.ok(c.r > c.b);
});
