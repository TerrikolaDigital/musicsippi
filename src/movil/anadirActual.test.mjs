import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esCancionExterna } from './anadirActual.js';

const biblioteca = [{ id: 'a1' }, { id: 'a2' }];

test('una vista previa con vídeo y fuera de la biblioteca es externa', () => {
  assert.equal(esCancionExterna({ id: 'preview-xyz', youtubeVideoId: 'xyz' }, biblioteca), true);
  assert.equal(esCancionExterna({ id: 'radio-abc', youtubeVideoId: 'abc' }, biblioteca), true);
});

test('una canción de la biblioteca no es externa, aunque tenga vídeo', () => {
  assert.equal(esCancionExterna({ id: 'a1', youtubeVideoId: 'v' }, biblioteca), false);
  assert.equal(esCancionExterna({ id: 'copia', trackIdReal: 'a2', youtubeVideoId: 'v' }, biblioteca), false);
});

test('sin canción o sin vídeo no se puede añadir', () => {
  assert.equal(esCancionExterna(null, biblioteca), false);
  assert.equal(esCancionExterna({ id: 'preview-x' }, biblioteca), false);
});
