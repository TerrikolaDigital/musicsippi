import test from 'node:test';
import assert from 'node:assert/strict';
import { fotoUtil } from './fotoUtil.js';

test('fotoUtil descarta la silueta genérica de Deezer y lo que no es dirección', () => {
  assert.equal(fotoUtil('https://cdn-images.dzcdn.net/images/artist/abc123/500x500.jpg'), 'https://cdn-images.dzcdn.net/images/artist/abc123/500x500.jpg');
  assert.equal(fotoUtil('https://cdn-images.dzcdn.net/images/artist/d41d8cd98f00b204e9800998ecf8427e/500x500.jpg'), null);
  assert.equal(fotoUtil(null), null);
  assert.equal(fotoUtil(''), null);
});
