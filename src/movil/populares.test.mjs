import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINIMO_PROPIAS, hacenFaltaPopulares, pestanaInicialArtista, pistasDePopulares, popularesSinLasPropias } from './populares.js';

test('hacen falta populares con menos de 5 canciones propias', () => {
  assert.equal(MINIMO_PROPIAS, 5);
  assert.equal(hacenFaltaPopulares(0), true);
  assert.equal(hacenFaltaPopulares(4), true);
  assert.equal(hacenFaltaPopulares(5), false);
});
test('quita las canciones que ya están en la biblioteca (artista+título normalizados)', () => {
  const top = [
    { id: 'd1', titulo: 'Clarity', artista: 'Zedd' },
    { id: 'd2', titulo: 'Stay (feat. Alessia Cara)', artista: 'Zedd' },
    { id: 'd3', titulo: 'Papercut', artista: 'Zedd' },
  ];
  const propias = [{ id: 'x', titulo: 'clarity', artista: 'Zedd · Foxes' }, { id: 'y', titulo: 'Stay', artista: 'Zedd' }];
  assert.deepEqual(popularesSinLasPropias(top, propias).map((c) => c.id), ['d3']);
});

test('la ficha del artista abre en Populares solo si no hay ninguna canción propia', () => {
  assert.equal(pestanaInicialArtista(0), 'populares');
  assert.equal(pestanaInicialArtista(1), 'biblioteca');
  assert.equal(pestanaInicialArtista(12), 'biblioteca');
});
test('pistasDePopulares usa la copia de la biblioteca o una provisional reproducible', () => {
  const real = { id: 'd1', titulo: 'Clarity', artista: 'Zedd', ejes: [] };
  const pistas = pistasDePopulares(
    [{ trackId: 'd1', titulo: 'Clarity', artista: 'Zedd' }, { trackId: 'd2', titulo: 'Stay', artista: 'Zedd', coverUrl: 'http://c' }],
    [real],
  );
  assert.equal(pistas[0], real);
  assert.equal(pistas[1].id, 'album-d2');
  assert.equal(pistas[1].youtubeQuery, 'Zedd Stay');
  assert.equal(pistas[1].coverUrl, 'http://c');
  assert.deepEqual(pistasDePopulares(undefined, []), []);
});
