import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearStoresQueFaltan, STORES_DB } from './db.js';

function dbFalsa(existentes) {
  const creados = [];
  return {
    creados,
    objectStoreNames: { contains: (n) => existentes.includes(n) },
    createObjectStore: (n, o) => creados.push([n, o]),
  };
}

test('una base nueva crea todos los stores', () => {
  const db = dbFalsa([]);
  crearStoresQueFaltan(db);
  assert.deepEqual(db.creados.map(([n]) => n), STORES_DB.map(([n]) => n));
});

test('al subir de la versión 1 crea los stores posteriores', () => {
  const db = dbFalsa(['biblioteca', 'ejes', 'overrides', 'cacheYoutube', 'metadataLocal', 'historial', 'configuracion']);
  crearStoresQueFaltan(db);
  assert.deepEqual(db.creados, [
    ['generos', { keyPath: 'trackId' }],
    ['vectores', { keyPath: 'trackId' }],
    ['seguidas', { keyPath: 'clave' }],
    ['archivosLocales', { keyPath: 'id' }],
  ]);
});

test('al subir de la versión 2 crea seguidas y archivos locales', () => {
  const db = dbFalsa(['biblioteca', 'ejes', 'overrides', 'cacheYoutube', 'metadataLocal', 'historial', 'configuracion', 'generos', 'vectores']);
  crearStoresQueFaltan(db);
  assert.deepEqual(db.creados, [['seguidas', { keyPath: 'clave' }], ['archivosLocales', { keyPath: 'id' }]]);
});
