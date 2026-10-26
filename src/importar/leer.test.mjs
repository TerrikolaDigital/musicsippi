import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerEnlace, NOMBRE_ORIGEN } from './leer.js';

const lectura = { nombre: 'L', portada: null, filas: [{ titulo: 'a', artista: 'b', album: '', playlist: 'L', tipo: 'Track' }] };

test('sin enlace o con un enlace que no es una playlist: no-reconocido', async () => {
  await assert.rejects(leerEnlace('hola', { get: async () => ({}) }), (e) => e.codigo === 'no-reconocido');
  await assert.rejects(leerEnlace('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy', { get: async () => ({}) }), (e) => e.codigo === 'no-reconocido');
});

test('resuelve un enlace corto siguiendo la redirección y despacha a la fuente', async () => {
  const llamadas = [];
  const http = { get: async (url) => ({ status: 200, texto: '', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=z' }) };
  const r = await leerEnlace('Mira esta: https://spotify.link/AbCdEf123', http, {
    spotify: async (id) => {
      llamadas.push(id);
      return lectura;
    },
  });
  assert.deepEqual(llamadas, ['37i9dQZF1DXcBWIGoYBM5M']);
  assert.equal(r.origen, 'spotify');
  assert.equal(r.id, '37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(r.aviso, null);
  assert.equal(NOMBRE_ORIGEN[r.origen], 'Spotify');
});

test('un enlace corto que no lleva a una playlist es no-reconocido', async () => {
  const http = { get: async () => ({ status: 200, texto: '', url: 'https://www.deezer.com/es/album/1' }) };
  await assert.rejects(leerEnlace('https://deezer.page.link/x', http, {}), (e) => e.codigo === 'no-reconocido');
});

test('spotify.app.link (el que genera la app de Spotify al compartir) también es un enlace corto', async () => {
  const http = { get: async () => ({ status: 200, texto: '', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' }) };
  const r = await leerEnlace('https://spotify.app.link/AbCd', http, { spotify: async () => lectura });
  assert.equal(r.id, '37i9dQZF1DXcBWIGoYBM5M');
});
