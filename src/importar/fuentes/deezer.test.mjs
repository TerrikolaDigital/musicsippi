import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearPlaylistDeezer, leerPlaylist, AVISO_PARCIAL } from './deezer.js';

const fixture = (n) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');
const ok = (texto) => ({ status: 200, texto, url: '' });

test('lee nombre, portada y canciones con álbum', () => {
  const r = parsearPlaylistDeezer(JSON.parse(fixture('deezer-playlist.json')));
  assert.equal(r.nombre, 'Top USA');
  assert.equal(r.filas.length, 3);
  assert.deepEqual(r.filas[2], { titulo: "Choosin' Texas", artista: 'Ella Langley', album: "Choosin' Texas", playlist: 'Top USA', tipo: 'Track' });
  assert.equal(r.total, 3);
  assert.equal(r.leidas, 3);
});

test('el error 800 de Deezer es una playlist privada o inexistente', () => {
  assert.throws(() => parsearPlaylistDeezer(JSON.parse(fixture('deezer-error.json'))), (e) => e.codigo === 'privada');
});

test('pagina con index= cuando la playlist trae menos de las que anuncia', async () => {
  const pedidas = [];
  const http = {
    async get(url) {
      pedidas.push(url);
      if (url === 'https://api.deezer.com/playlist/1313621735') return ok(fixture('deezer-playlist-larga.json'));
      if (url === 'https://api.deezer.com/playlist/1313621735/tracks?index=2&limit=100') return ok(fixture('deezer-pagina-2.json'));
      return { status: 404, texto: '{}', url };
    },
  };
  const r = await leerPlaylist('1313621735', http);
  assert.deepEqual(r.filas.map((f) => f.titulo), ['Boston', 'Been By Now', "Choosin' Texas"]);
  assert.equal(pedidas.length, 2);
  assert.equal(r.aviso, null);
});

test('una playlist sin canciones es vacía', async () => {
  const vacia = JSON.stringify({ id: 1, title: 'Nada', nb_tracks: 0, tracks: { data: [] } });
  await assert.rejects(leerPlaylist('1', { get: async () => ok(vacia) }), (e) => e.codigo === 'vacia');
});

test('si falla la página siguiente, devuelve lo leído con aviso de lectura parcial', async () => {
  const http = {
    async get(url) {
      if (url === 'https://api.deezer.com/playlist/1313621735') return ok(fixture('deezer-playlist-larga.json'));
      return ok(fixture('deezer-error.json'));
    },
  };
  const r = await leerPlaylist('1313621735', http);
  assert.equal(r.filas.length, 2);
  assert.equal(r.aviso, AVISO_PARCIAL);
});
