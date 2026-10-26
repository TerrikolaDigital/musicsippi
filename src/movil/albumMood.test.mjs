import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnadirAlbumAMood, textoAvisoAlbumMood } from './albumMood.js';

const tracks = [
  { id: 'a', ejes: [{ ejeId: 'sound' }] },
  { id: 'b', ejes: [{ ejeId: 'otro' }] },
  { id: 'c' },
];

test('solo se ponen las que aún no tienen el mood', () => {
  assert.deepEqual(planAnadirAlbumAMood(['a', 'b', 'c'], tracks, 'sound'), { poner: ['b', 'c'], yaEstaban: 1 });
});

test('entradas vacías no rompen', () => {
  assert.deepEqual(planAnadirAlbumAMood(['x'], tracks, 'sound'), { poner: ['x'], yaEstaban: 0 });
  assert.deepEqual(planAnadirAlbumAMood(undefined, undefined, 'sound'), { poner: [], yaEstaban: 0 });
});

test('textos del aviso', () => {
  assert.equal(textoAvisoAlbumMood(3, 0, 'Soundtracks'), '3 canciones añadidas a «Soundtracks»');
  assert.equal(textoAvisoAlbumMood(1, 2, 'S'), '1 canción añadida a «S» (2 ya estaban)');
  assert.equal(textoAvisoAlbumMood(0, 4, 'S'), 'Todas las canciones ya estaban en «S»');
});
