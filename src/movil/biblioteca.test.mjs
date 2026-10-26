// src/movil/biblioteca.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancionesDeBiblioteca, pedirPestanaBiblioteca, tomarPestanaBiblioteca } from './biblioteca.js';

const tracks = [
  { id: 'a', titulo: 'Zeta' },
  { id: 'b', titulo: 'Álamo' },
  { id: 'c', titulo: 'beso' },
];

test('canciones por título sin distinguir tildes ni mayúsculas', () => {
  assert.deepEqual(cancionesDeBiblioteca(tracks).map((t) => t.id), ['b', 'c', 'a']);
});
test('filtro de favoritas', () => {
  const r = cancionesDeBiblioteca(tracks, { soloFavoritas: true, favoritasIds: new Set(['a', 'c']) });
  assert.deepEqual(r.map((t) => t.id), ['c', 'a']);
});
test('no altera la lista original', () => {
  cancionesDeBiblioteca(tracks);
  assert.equal(tracks[0].id, 'a');
});
test('pestaña pedida: se consume una vez y por defecto son las canciones', () => {
  assert.deepEqual(tomarPestanaBiblioteca(), { pestana: 'canciones', favoritas: false });
  pedirPestanaBiblioteca('artistas', { favoritas: true });
  assert.deepEqual(tomarPestanaBiblioteca(), { pestana: 'artistas', favoritas: false });
  assert.deepEqual(tomarPestanaBiblioteca(), { pestana: 'canciones', favoritas: false });
  pedirPestanaBiblioteca('canciones', { favoritas: true });
  assert.deepEqual(tomarPestanaBiblioteca(), { pestana: 'canciones', favoritas: true });
  pedirPestanaBiblioteca('inventada');
  assert.deepEqual(tomarPestanaBiblioteca(), { pestana: 'canciones', favoritas: false });
});

import { estadoAlbumEnBiblioteca } from './biblioteca.js';
import { norm } from './busqueda.js';

test('estadoAlbumEnBiblioteca: casa por id o por artista+título y devuelve lo que falta', () => {
  const lib = [
    { id: 'x1', artista: 'Galantis', titulo: 'Runaway' },
    { id: 'x2', artista: 'Galantis', titulo: 'Peanut Butter Jelly' },
  ];
  const pistas = [
    { trackId: 'x1', artista: 'Galantis', titulo: 'Runaway' }, // por id
    { trackId: 'zz', artista: 'galantís', titulo: 'PEANUT butter jelly' }, // por título
    { trackId: 'q', artista: 'Galantis', titulo: 'Gold Dust' }, // falta
  ];
  const r = estadoAlbumEnBiblioteca(pistas, lib, norm);
  assert.deepEqual(r.ids.sort(), ['x1', 'x2']);
  assert.deepEqual(r.faltan.map((p) => p.trackId), ['q']);
  assert.deepEqual(estadoAlbumEnBiblioteca(pistas.slice(0, 2), lib, norm).faltan, []);
});
