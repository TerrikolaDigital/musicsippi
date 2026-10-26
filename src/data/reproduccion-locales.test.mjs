import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenMemoria } from './lib/almacen-memoria.js';
import { guardarArchivoLocal, pendientesDeCopia } from './archivos-locales.js';
import { esIdLocal, idLocal, idReproductor, resolverFuenteReproduccion, trackIdDeIdLocal } from './reproduccion-locales.js';

const URI = 'content://com.android.providers.media.documents/document/audio%3A9';
const noDebeLlamarse = async () => {
  throw new Error('YouTube no debía consultarse');
};
const archivo = (dispositivo, extra = {}) => ({ trackId: 't1', dispositivo, uri: URI, nombre: 'a.mp3', tamano: 10, sha256: 'b'.repeat(64), mime: 'audio/mpeg', ...extra });
const errorAudio = (codigo) => Object.assign(new Error(codigo), { codigo });

test('la URI local de este móvil tiene prioridad y no consulta YouTube', async () => {
  const almacen = crearAlmacenMemoria();
  await guardarArchivoLocal(archivo('movil'), almacen);
  const r = await resolverFuenteReproduccion({ trackId: 't1', videoId: 'abc', resolver: noDebeLlamarse, almacen });
  assert.equal(r.tipo, 'local');
  assert.equal(r.url, URI);
  assert.deepEqual(r.headers, {});
  assert.equal(r.mime, 'audio/mpeg');
});

test('sin archivo local sigue con YouTube; usarLocal:false lo salta aunque exista', async () => {
  const almacen = crearAlmacenMemoria();
  const resolver = async (id) => ({ url: `https://yt/${id}`, headers: { 'User-Agent': 'x' }, mime: 'audio/mp4', duracion: 200 });
  const r = await resolverFuenteReproduccion({ trackId: 't1', videoId: 'abc', resolver, almacen });
  assert.deepEqual([r.tipo, r.url, r.duracion], ['youtube', 'https://yt/abc', 200]);
  await guardarArchivoLocal(archivo('movil'), almacen);
  assert.equal((await resolverFuenteReproduccion({ trackId: 't1', videoId: 'abc', usarLocal: false, resolver, almacen })).tipo, 'youtube');
});

test('un error temporal de YouTube no crea pendiente, aunque el PC tenga el archivo', async () => {
  const almacen = crearAlmacenMemoria();
  await guardarArchivoLocal(archivo('pc', { uri: 'C:/Musica/a.mp3' }), almacen);
  const resolver = async () => {
    throw errorAudio('resolucion');
  };
  await assert.rejects(resolverFuenteReproduccion({ trackId: 't1', videoId: 'abc', resolver, almacen }), (e) => e.codigo === 'resolucion' && !e.paraCopiar);
  assert.deepEqual(await pendientesDeCopia(almacen), []);
});

test('no_disponible con el archivo en el PC crea exactamente un pendiente PC a móvil', async () => {
  const almacen = crearAlmacenMemoria();
  await guardarArchivoLocal(archivo('pc', { uri: 'C:/Musica/a.mp3' }), almacen);
  const resolver = async () => {
    throw errorAudio('no_disponible');
  };
  for (let i = 0; i < 2; i += 1) {
    await assert.rejects(resolverFuenteReproduccion({ trackId: 't1', videoId: 'abc', resolver, almacen }), (e) => e.codigo === 'no_disponible' && e.paraCopiar === true);
  }
  assert.deepEqual(await pendientesDeCopia(almacen), [
    { trackId: 't1', origen: 'pc', destino: 'movil', sha256: 'b'.repeat(64), tamano: 10, estado: 'pendiente', reanudableDesde: 0 },
  ]);
});

test('no_disponible sin archivo en el PC no anota nada; sin videoId ni local es no_disponible', async () => {
  const almacen = crearAlmacenMemoria();
  const resolver = async () => {
    throw errorAudio('no_disponible');
  };
  await assert.rejects(resolverFuenteReproduccion({ trackId: 't1', videoId: 'abc', resolver, almacen }), (e) => !e.paraCopiar);
  await assert.rejects(resolverFuenteReproduccion({ trackId: 't1', almacen }), (e) => e.codigo === 'no_disponible');
  assert.deepEqual(await pendientesDeCopia(almacen), []);
});

test('ids locales de la cola nativa', () => {
  assert.equal(idLocal('t1'), 'local:t1');
  assert.ok(esIdLocal('local:t1') && !esIdLocal('dQw4w9WgXcQ') && !esIdLocal(null));
  assert.equal(trackIdDeIdLocal('local:t1'), 't1');
  assert.equal(idReproductor({ id: 't1', youtubeVideoId: 'yt' }, new Map([['t1', 'local:t1']])), 'local:t1');
  assert.equal(idReproductor({ id: 't1', youtubeVideoId: 'yt' }, new Map()), 'yt');
  assert.equal(idReproductor({ id: 't1', youtubeVideoId: null }, new Map([['t1', 'abc']])), 'abc');
});
