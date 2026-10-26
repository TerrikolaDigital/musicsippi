// src/movil/importar/pasos-compartir.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASOS_COMPARTIR } from './pasos-compartir.js';

test('hay tres pasos, cada uno con icono y texto', () => {
  assert.equal(PASOS_COMPARTIR.length, 3);
  for (const p of PASOS_COMPARTIR) assert.ok(p.icono && p.texto.length > 10);
  assert.match(PASOS_COMPARTIR[2].texto, /Musicsippi/);
});
