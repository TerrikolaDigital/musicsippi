import test from 'node:test';
import assert from 'node:assert/strict';
import { conTamano } from './tamanoPortada.js';

const H = 'a'.repeat(32);

test('conTamano: reduce las direcciones de Deezer y deja el resto como están', () => {
  assert.equal(conTamano(`https://cdn-images.dzcdn.net/images/cover/${H}/500x500-000000-80-0-0.jpg`, 120), `https://cdn-images.dzcdn.net/images/cover/${H}/120x120-000000-80-0-0.jpg`);
  assert.equal(conTamano(`https://cdn-images.dzcdn.net/images/artist/${H}/1000x1000-000000-80-0-0.jpg`, 250), `https://cdn-images.dzcdn.net/images/artist/${H}/250x250-000000-80-0-0.jpg`);
  // ya es más pequeña o igual: no se toca
  assert.equal(conTamano(`https://cdn-images.dzcdn.net/images/cover/${H}/120x120-000000-80-0-0.jpg`, 250), `https://cdn-images.dzcdn.net/images/cover/${H}/120x120-000000-80-0-0.jpg`);
  // otras fuentes y entradas raras
  assert.equal(conTamano('https://i.ytimg.com/vi/abc/hqdefault.jpg', 120), 'https://i.ytimg.com/vi/abc/hqdefault.jpg');
  assert.equal(conTamano(null, 120), null);
  assert.equal(conTamano(`https://cdn-images.dzcdn.net/images/cover/${H}/500x500-000000-80-0-0.jpg`, 0), `https://cdn-images.dzcdn.net/images/cover/${H}/500x500-000000-80-0-0.jpg`);
});
