import test from 'node:test';
import assert from 'node:assert/strict';
import { esPortadaGenerica } from './portadaPlaceholder.js';

const H1 = 'a'.repeat(32);
const H2 = 'b'.repeat(32);
const url = (h) => `https://cdn-images.dzcdn.net/images/cover/${h}/500x500-000000-80-0-0.jpg`;

test('portada genérica de Deezer: se detecta por la dirección final tras la redirección y se recuerda', async () => {
  let llamadas = 0;
  const pedirGris = async () => {
    llamadas++;
    return { url: url('d41d8cd98f00b204e9800998ecf8427e') };
  };
  assert.equal(await esPortadaGenerica(url(H1), pedirGris), true);
  assert.equal(await esPortadaGenerica(url(H1), pedirGris), true);
  assert.equal(llamadas, 1, 'la segunda vez sale de la memoria');
  assert.equal(await esPortadaGenerica(url(H2), async () => ({ url: url(H2) })), false);
});

test('portada genérica: lo que no es de Deezer, el hash vacío directo y los fallos de red', async () => {
  assert.equal(await esPortadaGenerica('https://i.ytimg.com/vi/abc/hqdefault.jpg'), false);
  assert.equal(await esPortadaGenerica(url('d41d8cd98f00b204e9800998ecf8427e')), true);
  assert.equal(await esPortadaGenerica(url('c'.repeat(32)), async () => { throw new Error('sin red'); }), false);
  assert.equal(await esPortadaGenerica(null), false);
});
