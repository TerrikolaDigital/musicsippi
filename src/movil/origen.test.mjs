// src/movil/origen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esEjeSonando, esOrigenSintetico, origenSonando } from './origen.js';

test('origenSonando: nombre del eje o null', () => {
  assert.equal(origenSonando({ id: 'chill', nombre: 'Chill' }), 'Chill');
  assert.equal(origenSonando({ nombre: 'Infinito' }), 'Infinito');
  assert.equal(origenSonando(null), null);
  assert.equal(origenSonando({ nombre: '' }), null);
});
test('esEjeSonando compara por id y nunca con ids vacíos', () => {
  assert.equal(esEjeSonando({ id: 'chill', nombre: 'Chill' }, 'chill'), true);
  assert.equal(esEjeSonando({ id: 'chill', nombre: 'Chill' }, 'gym'), false);
  assert.equal(esEjeSonando({ nombre: 'Infinito' }, undefined), false);
  assert.equal(esEjeSonando(null, 'chill'), false);
});
test('esOrigenSintetico: solo sin id y con ese nombre', () => {
  assert.equal(esOrigenSintetico({ nombre: 'Infinito' }, 'Infinito'), true);
  assert.equal(esOrigenSintetico({ id: 'x', nombre: 'Infinito' }, 'Infinito'), false);
  assert.equal(esOrigenSintetico(null, 'Infinito'), false);
});

import { complementoSegundaLinea } from './origen.js';

test('complementoSegundaLinea: origen distinto del artista; si no, el álbum', () => {
  assert.equal(complementoSegundaLinea({ artista: 'Galantis', origen: 'Chill', album: 'Pharmacy' }), 'Chill');
  assert.equal(complementoSegundaLinea({ artista: 'Galantis', origen: 'Galantis', album: 'Pharmacy' }), 'Pharmacy');
  assert.equal(complementoSegundaLinea({ artista: 'Galantís', origen: 'galantis', album: 'Pharmacy' }), 'Pharmacy');
  assert.equal(complementoSegundaLinea({ artista: 'Galantis', origen: null, album: 'Pharmacy' }), 'Pharmacy');
  assert.equal(complementoSegundaLinea({ artista: 'Galantis', origen: 'Galantis', album: '' }), '');
  assert.equal(complementoSegundaLinea({ artista: 'Galantis', origen: null }), '');
});
