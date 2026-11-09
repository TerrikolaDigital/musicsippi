import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarEnBiblioteca, esCancionExterna, esFavoritaEnBiblioteca } from './anadirActual.js';

const biblioteca = [
  { id: 'a1', artista: 'David Guetta', titulo: 'Titanium', ejes: [{ ejeId: 'favoritos' }] },
  { id: 'a2', artista: 'Avicii', titulo: 'Levels', ejes: [] },
  { id: 'a3', artista: 'Rudimental', titulo: 'Feel the Love', youtubeVideoId: 'vid3', ejes: [] },
];
const ext = (extra) => ({ artista: 'Joachim Garraud', titulo: 'The World Is Mine', ...extra });

test('una vista previa con vídeo y fuera de la biblioteca es externa', () => {
  assert.equal(esCancionExterna(ext({ id: 'preview-xyz', youtubeVideoId: 'xyz' }), biblioteca), true);
  assert.equal(esCancionExterna(ext({ id: 'radio-abc', youtubeVideoId: 'abc' }), biblioteca), true);
});

test('una provisional de álbum sin vídeo resuelto también es externa (caso del aleatorio de artista)', () => {
  assert.equal(esCancionExterna(ext({ id: 'album-123', youtubeVideoId: null }), biblioteca), true);
  assert.equal(esCancionExterna(ext({ id: 'deezer:99' }), biblioteca), true);
});

test('una canción de la biblioteca no es externa, aunque tenga vídeo', () => {
  assert.equal(esCancionExterna({ id: 'a1', artista: 'x', titulo: 'y', youtubeVideoId: 'v' }, biblioteca), false);
  assert.equal(esCancionExterna(ext({ id: 'copia', trackIdReal: 'a2', youtubeVideoId: 'v' }), biblioteca), false);
});

test('la misma canción con otra identidad se reconoce por id real, por vídeo y por título', () => {
  assert.equal(buscarEnBiblioteca({ id: 'album-a2', artista: 'Avicii', titulo: 'Levels' }, biblioteca)?.id, 'a2');
  assert.equal(buscarEnBiblioteca({ id: 'preview-vid3', artista: 'otro', titulo: 'otro', youtubeVideoId: 'vid3' }, biblioteca)?.id, 'a3');
  assert.equal(buscarEnBiblioteca({ id: 'preview-q', artista: 'Rudimental', titulo: 'Feel The Love (Official Audio)' }, biblioteca)?.id, 'a3');
});

test('el vídeo de la caché de resolución cuenta como el mismo vídeo', () => {
  const cache = new Map([['a2', 'vidX']]);
  const videoDe = (t) => t.youtubeVideoId ?? cache.get(t.id) ?? null;
  assert.equal(buscarEnBiblioteca({ id: 'preview-vidX', artista: 'zz', titulo: 'zz', youtubeVideoId: 'vidX' }, biblioteca, videoDe)?.id, 'a2');
  assert.equal(esCancionExterna(ext({ id: 'preview-vidX', youtubeVideoId: 'vidX' }), biblioteca, videoDe), false);
});

test('sin canción, o sin título o artista, no se puede añadir', () => {
  assert.equal(esCancionExterna(null, biblioteca), false);
  assert.equal(esCancionExterna({ id: 'preview-x' }, biblioteca), false);
});

test('una remezcla no se confunde con la original de la biblioteca', () => {
  assert.equal(buscarEnBiblioteca({ id: 'preview-r', artista: 'Avicii', titulo: 'Levels (Remix)' }, biblioteca), null);
});

test('el corazón de una canción de fuera sigue a su copia de la biblioteca', () => {
  assert.equal(esFavoritaEnBiblioteca({ id: 'album-a1', artista: 'David Guetta', titulo: 'Titanium' }, biblioteca), true);
  assert.equal(esFavoritaEnBiblioteca({ id: 'album-a2', artista: 'Avicii', titulo: 'Levels' }, biblioteca), false);
  assert.equal(esFavoritaEnBiblioteca(ext({ id: 'album-zzz' }), biblioteca), false);
  assert.equal(esFavoritaEnBiblioteca(null, biblioteca), false);
});
