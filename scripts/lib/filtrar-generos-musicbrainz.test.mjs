import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirGenerosRelevantes } from './filtrar-generos-musicbrainz.mjs';

// Datos reales, capturados en vivo de la API de MusicBrainz esta sesión
// (ver docs/superpowers/specs/2026-09-14-filtro-generos-musicbrainz-design.md).

test('Nirvana: se queda con los top 3 por votos y corta el ruido de 1 voto', () => {
  const generosNirvana = [
    { name: 'acoustic rock', count: 8 },
    { name: 'alternative metal', count: 1 },
    { name: 'alternative pop', count: 1 },
    { name: 'alternative rock', count: 29 },
    { name: 'ambient', count: 1 },
    { name: 'conscious hip hop', count: 1 },
    { name: 'electronic', count: 1 },
    { name: 'experimental', count: 1 },
    { name: 'grunge', count: 66 },
    { name: 'hip hop', count: 1 },
    { name: 'instrumental hip hop', count: 1 },
    { name: 'new age', count: 1 },
    { name: 'noise rock', count: 12 },
    { name: 'pigfuck', count: 1 },
    { name: 'pop', count: 1 },
    { name: 'post-hardcore', count: 1 },
    { name: 'psychedelic pop', count: 1 },
    { name: 'psytrance', count: 1 },
    { name: 'punk', count: 1 },
    { name: 'punk rock', count: 1 },
    { name: 'rock', count: 25 },
    { name: 'sludge metal', count: 3 },
    { name: 'underground hip hop', count: 1 },
  ];
  assert.deepEqual(elegirGenerosRelevantes(generosNirvana), ['grunge', 'alternative rock', 'rock']);
});

test('Rosalía: un empate a 2 votos se resuelve por orden alfabetico', () => {
  const generosRosalia = [
    { name: 'flamenco', count: 5 },
    { name: 'reggaeton', count: 3 },
    { name: 'flamenco pop', count: 2 },
    { name: 'latin', count: 2 },
    { name: 'latin pop', count: 2 },
    { name: 'hip hop', count: 1 },
    { name: 'pop', count: 1 },
    { name: 'singer-songwriter', count: 1 },
  ];
  assert.deepEqual(elegirGenerosRelevantes(generosRosalia), ['flamenco', 'reggaeton', 'flamenco pop']);
});

test('Soda Stereo: otro empate, esta vez en la segunda posicion', () => {
  const generosSodaStereo = [
    { name: 'alternative rock', count: 7 },
    { name: 'latin rock', count: 3 },
    { name: 'new wave', count: 3 },
    { name: 'rock', count: 3 },
    { name: 'latin', count: 2 },
    { name: 'shoegaze', count: 2 },
    { name: 'pop rock', count: 1 },
    { name: 'post-punk', count: 1 },
    { name: 'psychedelic rock', count: 1 },
  ];
  assert.deepEqual(elegirGenerosRelevantes(generosSodaStereo), ['alternative rock', 'latin rock', 'new wave']);
});

test('un artista sin consenso real (todos los tags con 1 solo voto) no recibe ningun genero', () => {
  const sinConsenso = [
    { name: 'algo', count: 1 },
    { name: 'otra cosa', count: 1 },
  ];
  assert.deepEqual(elegirGenerosRelevantes(sinConsenso), []);
});

test('una lista vacia o ausente no explota', () => {
  assert.deepEqual(elegirGenerosRelevantes([]), []);
  assert.deepEqual(elegirGenerosRelevantes(undefined), []);
});
