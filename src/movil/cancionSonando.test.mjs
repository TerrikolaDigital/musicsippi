import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esLaQueSuena } from './cancionSonando.js';

const deBiblioteca = { id: 'a1b2c3d4e5f6', titulo: 'Feel the Love (feat. John Newman)', artista: 'Rudimental · John Newman', youtubeVideoId: 'v1' };

test('una canción de la biblioteca se reconoce por su id', () => {
  assert.equal(esLaQueSuena(deBiblioteca, deBiblioteca), true);
  assert.equal(esLaQueSuena(deBiblioteca, { id: 'otro', titulo: 'These Days', artista: 'Rudimental' }), false);
});

test('la provisional de Deezer se reconoce en la fila de populares por su trackId', () => {
  const suena = { id: 'album-deezer:rudimental|send shots', trackIdReal: 'deezer:rudimental|send shots', titulo: 'Send Shots', artista: 'Rudimental' };
  assert.equal(esLaQueSuena(suena, { trackId: 'deezer:rudimental|send shots', titulo: 'Send Shots', artista: 'Rudimental' }), true);
});

test('la provisional de una fila de éxitos se reconoce por su id de Deezer', () => {
  const suena = { id: 'album-deezer-123', trackIdReal: 'deezer-123', titulo: 'Send Shots', artista: 'Rudimental' };
  assert.equal(esLaQueSuena(suena, { id: 'deezer-123', titulo: 'Send Shots', artista: 'Rudimental' }), true);
});

test('la misma canción se reconoce entre los dos tipos de id de Deezer', () => {
  const suena = { id: 'album-deezer-123', trackIdReal: 'deezer-123', titulo: 'Send Shots', artista: 'Rudimental' };
  assert.equal(esLaQueSuena(suena, { trackId: 'deezer:rudimental|send shots', titulo: 'Send Shots', artista: 'Rudimental' }), true);
});

test('dos versiones de Deezer con ids distintos no se confunden aunque normalicen igual', () => {
  const suena = { id: 'album-deezer:r|these days (acoustic)', trackIdReal: 'deezer:r|these days (acoustic)', titulo: 'These Days (Acoustic)', artista: 'Rudimental' };
  assert.equal(esLaQueSuena(suena, { trackId: 'deezer:r|these days', titulo: 'These Days', artista: 'Rudimental' }), false);
});

test('una vista previa marca la fila de Deezer por artista y título', () => {
  const suena = { id: 'preview-abc', titulo: 'Sun Comes Up (feat. James Arthur)', artista: 'Rudimental', youtubeVideoId: 'abc' };
  assert.equal(esLaQueSuena(suena, { id: 'deezer-9', titulo: 'Sun Comes Up (feat. James Arthur)', artista: 'Rudimental' }), true);
  assert.equal(esLaQueSuena(suena, { id: 'deezer-8', titulo: 'Send Shots', artista: 'Rudimental' }), false);
});

test('una canción de fuera que suena marca su copia de la biblioteca', () => {
  const suena = { id: 'album-deezer:rudimental|feel the love', trackIdReal: 'deezer:rudimental|feel the love', titulo: 'Feel the Love', artista: 'Rudimental' };
  assert.equal(esLaQueSuena(suena, deBiblioteca), true);
});

test('una canción añadida desde la búsqueda sigue en la cola con el id de la vista previa: cuenta el vídeo', () => {
  const suena = { id: 'preview-v1', titulo: 'Título de YouTube', artista: 'Canal', youtubeVideoId: 'v1' };
  assert.equal(esLaQueSuena(suena, deBiblioteca), true);
});

test('dos canciones de la biblioteca con el mismo título son canciones distintas', () => {
  const remix = { id: 'ffffffffffff', titulo: 'Feel the Love (Remix)', artista: 'Rudimental' };
  assert.equal(esLaQueSuena(deBiblioteca, remix), false);
});

test('sin nada sonando no hay fila activa', () => {
  assert.equal(esLaQueSuena(null, deBiblioteca), false);
  assert.equal(esLaQueSuena(undefined, deBiblioteca), false);
});

test('una remezcla no se marca cuando suena la original de otro origen, ni al revés', () => {
  const original = { id: 'abc123def456', artista: 'Rudimental', titulo: 'Feel the Love (feat. John Newman)' };
  const vip = { id: 'album-deezer-9', trackIdReal: 'deezer-9', artista: 'Rudimental', titulo: 'Feel the Love (feat. John Newman) (Rudimental VIP)' };
  assert.equal(esLaQueSuena(original, vip), false);
  assert.equal(esLaQueSuena(vip, original), false);
});

test('una edición de radio sí es la misma canción que la de la biblioteca', () => {
  const biblioteca = { id: 'abc123def456', artista: 'Rudimental', titulo: 'Sun Comes Up (feat. James Arthur)' };
  const radio = { id: 'deezer-1', artista: 'Rudimental', titulo: 'Sun Comes Up (feat. James Arthur) (Radio Edit)' };
  assert.equal(esLaQueSuena(biblioteca, radio), true);
});
