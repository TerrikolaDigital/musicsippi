import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearPaginaApple, leerPlaylist } from './apple.js';

const fixture = (nombre) => readFileSync(new URL(`./__fixtures__/${nombre}`, import.meta.url), 'utf8');

test('Apple Music: lee una playlist desde serialized-server-data', () => {
  const r = parsearPaginaApple(fixture('apple-playlist.html'));
  assert.equal(r.nombre, 'Para caminar');
  assert.equal(r.filas.length, 2);
  assert.deepEqual(r.filas[0], { titulo: 'Luz de verano', artista: 'La Banda', album: 'Sol', playlist: 'Para caminar', tipo: 'Track' });
});

test('Apple Music: acepta las pistas de un álbum en JSON-LD', () => {
  const r = parsearPaginaApple(fixture('apple-album.html'));
  assert.equal(r.filas.length, 2);
  assert.equal(r.filas[1].titulo, 'Segunda');
});

test('Apple Music usa el HTTP nativo y trata el 404 como lista privada', async () => {
  await assert.rejects(
    leerPlaylist('https://music.apple.com/es/playlist/x/123', { get: async () => ({ status: 404, texto: '' }) }),
    (e) => e.codigo === 'privada',
  );
});

test('Apple Music: página real de playlist (trackLockup) con álbum por pista', () => {
  const r = parsearPaginaApple(fixture('apple-pagina-real-playlist.html'));
  assert.equal(r.nombre, 'Para caminar');
  assert.deepEqual(r.filas.map((f) => [f.titulo, f.artista, f.album]), [
    ['Luz de verano', 'La Banda', 'Sol'],
    ['Noche azul', 'Otra Voz', 'Luna'],
  ]);
});

test('Apple Music: en una página de álbum, las pistas sin álbum heredan el nombre del álbum', () => {
  const r = parsearPaginaApple(fixture('apple-pagina-real-album.html'));
  assert.equal(r.nombre, 'Sol');
  assert.deepEqual(r.filas.map((f) => [f.titulo, f.artista, f.album]), [
    ['Luz de verano', 'La Banda', 'Sol'],
    ['Noche azul', 'La Banda', 'Sol'],
  ]);
});
