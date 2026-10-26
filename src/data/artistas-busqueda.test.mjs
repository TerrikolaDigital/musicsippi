import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artistasDeItem } from './audio-nativo.js';

test('artistasDeItem: artists, authors, author o el subtítulo', () => {
  assert.deepEqual(artistasDeItem({ artists: [{ name: 'Smash Mouth' }] }), ['Smash Mouth']);
  assert.deepEqual(artistasDeItem({ artists: [], authors: [{ name: 'The Offspring' }] }), ['The Offspring']);
  assert.deepEqual(artistasDeItem({ author: { name: 'Pixies' } }), ['Pixies']);
  assert.deepEqual(artistasDeItem({ subtitle: { text: 'Canción • The Smashing Pumpkins • Adore • 3:12' } }), ['The Smashing Pumpkins']);
  assert.deepEqual(artistasDeItem({}), []);
});
