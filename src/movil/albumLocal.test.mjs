import { test } from 'node:test';
import assert from 'node:assert/strict';
import { albumDe, primerArtista, cancionesDeAlbumLocal } from './albumLocal.js';

test('primerArtista separa colaboraciones por · coma, feat. o vs', () => {
  assert.equal(primerArtista('Zedd · Troye Sivan'), 'Zedd');
  assert.equal(primerArtista('Zedd, Troye Sivan'), 'Zedd');
  assert.equal(primerArtista('Zedd feat. Troye Sivan'), 'Zedd');
  assert.equal(primerArtista('Zedd ft. Troye Sivan'), 'Zedd');
  assert.equal(primerArtista('A vs B'), 'A');
  assert.equal(primerArtista('Simon & Garfunkel'), 'Simon & Garfunkel');
  assert.equal(primerArtista('Dua Lipa'), 'Dua Lipa');
  assert.equal(primerArtista(''), '');
});

const tracks = [
  { id: '1', artista: 'Zedd · Troye Sivan', titulo: 'Papercut' },
  { id: '2', artista: 'Zedd', titulo: 'Clarity' },
  { id: '3', artista: 'Zedd', titulo: 'Otro' },
  { id: '4', artista: 'Otro Artista', titulo: 'X' },
];
const albums = { 1: 'True Colors', 2: 'Clarity', 3: 'true colors', 4: 'True Colors' };
const metaDe = (id) => ({ album: albums[id], anio: 2015, coverUrl: `c${id}` });

test('cancionesDeAlbumLocal encuentra por primer artista y título normalizados', () => {
  const r = cancionesDeAlbumLocal(tracks, metaDe, 'Zedd, Troye Sivan', 'True Colors');
  assert.deepEqual(r.map((t) => t.id), ['1', '3']);
});
test('cancionesDeAlbumLocal sin coincidencias devuelve lista vacía', () => {
  assert.deepEqual(cancionesDeAlbumLocal(tracks, metaDe, 'Zedd', 'No existe'), []);
});

test('albumDe: la metadata manda; si no hay, el álbum de la propia canción', () => {
  assert.equal(albumDe({ album: 'B' }, { album: 'A' }), 'A');
  assert.equal(albumDe({ album: 'B' }, { album: null }), 'B');
  assert.equal(albumDe({}, null), null);
});
