// src/movil/ordenAlbumes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarAlbumes, leerOrdenAlbumes, guardarOrdenAlbumes } from './ordenAlbumes.js';

const albumes = [
  { titulo: 'Beta', artista: 'X', indice: 5 },
  { titulo: 'alfa', artista: 'Y', indice: 40 },
  { titulo: 'Zeta', artista: 'Z', indice: 12 },
];

test('recientes: el último añadido primero', () => {
  assert.deepEqual(ordenarAlbumes(albumes, 'recientes').map((a) => a.titulo), ['alfa', 'Zeta', 'Beta']);
});

test('A-Z: por título sin distinguir mayúsculas; no muta la entrada', () => {
  assert.deepEqual(ordenarAlbumes(albumes, 'az').map((a) => a.titulo), ['alfa', 'Beta', 'Zeta']);
  assert.equal(albumes[0].titulo, 'Beta');
});

test('la elección se guarda y un valor inválido vuelve al de por defecto', () => {
  const m = new Map();
  const almacen = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(leerOrdenAlbumes(almacen), 'recientes');
  guardarOrdenAlbumes('az', almacen);
  assert.equal(leerOrdenAlbumes(almacen), 'az');
  guardarOrdenAlbumes('raro', almacen);
  assert.equal(leerOrdenAlbumes(almacen), 'recientes');
});
