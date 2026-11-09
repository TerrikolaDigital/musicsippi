import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDiscografia, leerDiscografia } from './discografia.js';

const cancion = (id, title, artista = 'Rudimental') => ({ id, title, artist: { name: artista } });

function dzDePrueba({ albumes = [], pistas = {}, top = [], artista = { id: 7, nombre: 'Rudimental' } } = {}) {
  const pedidas = [];
  return {
    pedidas,
    buscarArtista: async () => artista,
    top: async () => top,
    albumes: async () => albumes,
    crudo: async (ruta) => {
      pedidas.push(ruta);
      const id = /\/album\/(\d+)\//.exec(ruta)[1];
      if (pistas[id] === 'falla') throw new Error('red');
      return { data: pistas[id] ?? [] };
    },
  };
}

function almacenDePrueba() {
  const m = new Map();
  return { leer: async (k) => m.get(k), guardar: async (k, v) => void m.set(k, v) };
}

test('junta las canciones de los álbumes, con su portada y su álbum, y los éxitos', async () => {
  const dz = dzDePrueba({
    albumes: [{ id: 'deezer-album-1', titulo: 'Home', cover: 'http://home', tipo: 'album' }],
    pistas: { 1: [cancion(10, 'Feel the Love')] },
    top: [{ id: 'deezer-20', titulo: 'Sun Comes Up', artista: 'Rudimental', cover: 'http://sol' }],
  });
  const r = await leerDiscografia(dz, 'Rudimental');
  assert.equal(r.completa, true);
  assert.deepEqual(r.canciones[0], { id: 'deezer-10', titulo: 'Feel the Love', artista: 'Rudimental', cover: 'http://home', album: 'Home' });
  assert.equal(r.canciones[1].titulo, 'Sun Comes Up');
});

test('si hay más álbumes que el tope, los singles son los primeros en quedarse fuera', async () => {
  const albumes = [
    ...Array.from({ length: 45 }, (_, i) => ({ id: `deezer-album-${100 + i}`, titulo: `Single ${i}`, tipo: 'single' })),
    { id: 'deezer-album-1', titulo: 'Home', tipo: 'album' },
  ];
  const dz = dzDePrueba({ albumes });
  await leerDiscografia(dz, 'Rudimental');
  assert.equal(dz.pedidas.length, 40);
  assert.equal(dz.pedidas[0], '/album/1/tracks?limit=100');
});

test('los álbumes de remixes van después: al quitar repetidas se queda la versión original', async () => {
  const dz = dzDePrueba({
    albumes: [
      { id: 'deezer-album-1', titulo: 'Ground Control (The Remixes)', tipo: 'album' },
      { id: 'deezer-album-2', titulo: 'Ground Control', tipo: 'album' },
    ],
    pistas: { 1: [cancion(10, 'Instajets (Denis Sulta Remix)')], 2: [cancion(20, 'Instajets')] },
  });
  const r = await leerDiscografia(dz, 'Rudimental');
  assert.deepEqual(r.canciones.map((c) => c.titulo), ['Instajets', 'Instajets (Denis Sulta Remix)']);
});

test('un álbum que falla no tumba el resto y la lectura queda como incompleta', async () => {
  const dz = dzDePrueba({
    albumes: [
      { id: 'deezer-album-1', titulo: 'Home', tipo: 'album' },
      { id: 'deezer-album-2', titulo: 'We the Generation', tipo: 'album' },
    ],
    pistas: { 1: 'falla', 2: [cancion(30, 'Love Ain’t Just a Word')] },
  });
  const r = await leerDiscografia(dz, 'Rudimental');
  assert.equal(r.completa, false);
  assert.deepEqual(r.canciones.map((c) => c.id), ['deezer-30']);
});

test('un artista que Deezer no conoce no tiene discografía', async () => {
  const r = await leerDiscografia(dzDePrueba({ artista: null }), 'Nadie');
  assert.deepEqual(r, { canciones: [], completa: true });
});

test('la segunda vez sale de la caché, sin volver a pedir los álbumes', async () => {
  const dz = dzDePrueba({ albumes: [{ id: 'deezer-album-1', titulo: 'Home', tipo: 'album' }], pistas: { 1: [cancion(10, 'Feel the Love')] } });
  const almacen = almacenDePrueba();
  const primera = await cargarDiscografia(dz, 'Rudimental', almacen);
  const segunda = await cargarDiscografia(dz, 'Rudimental', almacen);
  assert.equal(primera.length, 1);
  assert.deepEqual(segunda, primera);
  assert.equal(dz.pedidas.length, 1);
});

test('una lectura incompleta no se reutiliza: la siguiente vez se vuelve a pedir', async () => {
  const pistas = { 1: 'falla' };
  const dz = dzDePrueba({ albumes: [{ id: 'deezer-album-1', titulo: 'Home', tipo: 'album' }], pistas });
  const almacen = almacenDePrueba();
  assert.deepEqual(await cargarDiscografia(dz, 'Rudimental', almacen), []);
  pistas[1] = [cancion(10, 'Feel the Love')];
  assert.equal((await cargarDiscografia(dz, 'Rudimental', almacen)).length, 1);
});
