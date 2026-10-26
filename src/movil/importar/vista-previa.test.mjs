// src/movil/importar/vista-previa.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenVistaPrevia, textoImportado } from './vista-previa.js';

const lectura = { origen: 'spotify', nombre: 'Clásicos', filas: new Array(58).fill({}) };

test('la vista previa dice origen y número de canciones', () => {
  assert.equal(resumenVistaPrevia(lectura), 'Spotify · 58 canciones');
  assert.equal(resumenVistaPrevia({ ...lectura, origen: 'youtube', filas: [{}] }), 'YouTube Music · 1 canción');
});

test('el texto tras importar distingue si había canciones nuevas', () => {
  assert.equal(textoImportado({ tracksNuevos: 58 }, lectura), '«Clásicos»: 58 canciones nuevas. Ya puedes escucharlas; ahora las ordeno en moods.');
  assert.equal(textoImportado({ tracksNuevos: 0 }, lectura), '«Clásicos» ya estaba en tu biblioteca: he actualizado la lista.');
});
