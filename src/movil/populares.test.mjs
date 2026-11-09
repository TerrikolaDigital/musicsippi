import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MINIMO_PROPIAS,
  aleatorioDelArtista,
  claveArtista,
  hacenFaltaPopulares,
  nuevasParaCola,
  pestanaInicialArtista,
  pistasDeDeezer,
  pistasDePopulares,
  popularesSinLasPropias,
  unirCanciones,
} from './populares.js';

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

test('pistasDePopulares conserva el álbum de la canción para el reproductor', () => {
  const [p] = pistasDePopulares([{ trackId: 'd1', titulo: 'Clarity', artista: 'Zedd', albumTitulo: 'Clarity (Deluxe)' }], []);
  assert.equal(p.album, 'Clarity (Deluxe)');
});

test('pistasDeDeezer da una pista reproducible con portada, sin esperar a buscar el vídeo', () => {
  const [p] = pistasDeDeezer([{ id: 'deezer-5', titulo: 'Send Shots', artista: 'Rudimental', cover: 'http://c', album: 'Toast to Our Differences' }]);
  assert.equal(p.id, 'album-deezer-5');
  assert.equal(p.trackIdReal, 'deezer-5');
  assert.equal(p.youtubeQuery, 'Rudimental Send Shots');
  assert.equal(p.youtubeVideoId, null);
  assert.equal(p.coverUrl, 'http://c');
  assert.equal(p.album, 'Toast to Our Differences');
});

test('unirCanciones deja una por canción y gana la primera lista (la copia de la biblioteca)', () => {
  const propia = { id: 'x', titulo: 'Feel the Love (feat. John Newman)', artista: 'Rudimental · John Newman' };
  const deFuera = { id: 'album-d1', titulo: 'Feel the Love', artista: 'Rudimental' };
  const otra = { id: 'album-d2', titulo: 'Send Shots', artista: 'Rudimental' };
  assert.deepEqual(unirCanciones([propia], [deFuera, otra], [otra]), [propia, otra]);
});

test('nuevasParaCola quita lo que ya está en la cola y las repetidas entre sí', () => {
  const cola = [{ id: 'a', titulo: 'Clarity', artista: 'Zedd' }];
  const repetida = { id: 'album-b', titulo: 'Clarity (Radio Edit)', artista: 'Zedd' };
  const nueva = { id: 'album-c', titulo: 'Stay', artista: 'Zedd' };
  assert.deepEqual(nuevasParaCola(cola, [repetida, nueva, { ...nueva, id: 'album-d' }]), [nueva]);
});

test('aleatorio del artista: marcado solo si la cola salió de su botón y el aleatorio sigue puesto', () => {
  const ejeActivo = { nombre: 'Rudimental', origenArtista: claveArtista('Rudimental') };
  assert.equal(aleatorioDelArtista({ aleatorio: true, ejeActivo }, 'rudimental'), true);
  assert.equal(aleatorioDelArtista({ aleatorio: false, ejeActivo }, 'Rudimental'), false);
  assert.equal(aleatorioDelArtista({ aleatorio: true, ejeActivo }, 'Zedd'), false);
  assert.equal(aleatorioDelArtista({ aleatorio: true, ejeActivo: { nombre: 'Power' } }, 'Rudimental'), false);
  assert.equal(aleatorioDelArtista({ aleatorio: true, ejeActivo: null }, 'Rudimental'), false);
});
