import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filasDePlano, planoDePlaylistMusic, leerPlaylist, AVISO_PARCIAL, MAX_CANCIONES } from './youtube.js';

const plano = () => JSON.parse(readFileSync(new URL('./__fixtures__/youtube-music-plano.json', import.meta.url), 'utf8'));

test('las canciones traen su videoId y los artistas unidos con coma', () => {
  const r = filasDePlano(plano());
  assert.equal(r.nombre, 'Top 100 Songs Global');
  assert.deepEqual(r.filas[0], {
    titulo: 'Dai Dai',
    artista: 'Shakira, Burna Boy',
    album: '',
    playlist: 'Top 100 Songs Global',
    tipo: 'Track',
    videoId: 'fcnDmrtj6Sk',
  });
});

test('sin título es privada; sin canciones con artista es vacía', () => {
  assert.throws(() => filasDePlano({ titulo: null, portada: null, items: [] }), (e) => e.codigo === 'privada');
  assert.throws(
    () => filasDePlano({ titulo: 'X', portada: null, items: [{ id: 'a', titulo: 'Sin artista', artistas: [], album: null }] }),
    (e) => e.codigo === 'vacia'
  );
});

test('adapta el objeto de youtubei.js (authors cuando no hay artists)', () => {
  const pl = {
    header: { title: { toString: () => 'Mi lista' }, thumbnail: { contents: [{ url: 'https://img' }] } },
    contents: [{ id: 'v1', title: 'Uno', authors: [{ name: 'A' }, { name: 'B' }], album: { name: 'Disco' } }],
  };
  assert.deepEqual(planoDePlaylistMusic(pl), {
    titulo: 'Mi lista',
    portada: 'https://img',
    items: [{ id: 'v1', titulo: 'Uno', artistas: ['A', 'B'], album: 'Disco' }],
  });
});

test('junta las continuaciones y trata una lista inexistente como privada', async () => {
  const pagina2 = { contents: [{ id: 'v2', title: 'Dos', artists: [{ name: 'C' }] }], has_continuation: false };
  const pagina1 = {
    header: { title: { toString: () => 'Larga' } },
    contents: [{ id: 'v1', title: 'Uno', artists: [{ name: 'A' }] }],
    has_continuation: true,
    getContinuation: async () => pagina2,
  };
  const yt = { music: { getPlaylist: async () => pagina1 } };
  const r = await leerPlaylist('PLx', null, { crearInnertube: async () => yt });
  assert.deepEqual(r.filas.map((f) => f.videoId), ['v1', 'v2']);

  const inexistente = { music: { getPlaylist: async () => ({ header: undefined, contents: undefined }) } };
  await assert.rejects(leerPlaylist('PLno', null, { crearInnertube: async () => inexistente }), (e) => e.codigo === 'privada');
});

test('si una continuación falla, devuelve lo leído con aviso de lectura parcial', async () => {
  const pagina1 = {
    header: { title: { toString: () => 'Rota' } },
    contents: [{ id: 'v1', title: 'Uno', artists: [{ name: 'A' }] }],
    has_continuation: true,
    getContinuation: async () => { throw new Error('boom'); },
  };
  const r = await leerPlaylist('PLx', null, { crearInnertube: async () => ({ music: { getPlaylist: async () => pagina1 } }) });
  assert.equal(r.filas.length, 1);
  assert.equal(r.aviso, AVISO_PARCIAL);
});

test('recorta a MAX_CANCIONES y avisa de las primeras', async () => {
  const items = Array.from({ length: MAX_CANCIONES + 50 }, (_, i) => ({ id: `v${i}`, title: `T${i}`, artists: [{ name: 'A' }] }));
  const pl = { header: { title: { toString: () => 'Enorme' } }, contents: items, has_continuation: false };
  const r = await leerPlaylist('PLx', null, { crearInnertube: async () => ({ music: { getPlaylist: async () => pl } }) });
  assert.equal(r.filas.length, MAX_CANCIONES);
  assert.match(r.aviso, /primeras/);
});
