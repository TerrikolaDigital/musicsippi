import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarArchivoLocal, seleccionarArchivosLocales, escanearMediaStore } from './archivos-locales-movil.js';

test('archivo content sin tags: título derivado del nombre y Artista desconocido', () => {
  const r = normalizarArchivoLocal({ uri: 'content://media/external/audio/media/7', nombre: 'Mi_canción-demo.mp3', tamano: 1234, mime: 'audio/mpeg' });
  assert.equal(r.uri, 'content://media/external/audio/media/7');
  assert.equal(r.titulo, 'Mi canción-demo');
  assert.equal(r.artista, 'Artista desconocido');
  assert.equal(r.tamano, 1234);
  assert.equal(r.mime, 'audio/mpeg');
  assert.equal(r.portada, undefined);
});

test('conserva los tags, la duración y la portada cuando existen', () => {
  const r = normalizarArchivoLocal({ uri: 'content://x/1', nombre: 'a.flac', titulo: ' Tema ', artista: 'Ella', album: 'Disco', duracionMs: 215400, portada: 'data:image/jpeg;base64,AAAA' });
  assert.equal(r.titulo, 'Tema');
  assert.equal(r.artista, 'Ella');
  assert.equal(r.album, 'Disco');
  assert.equal(r.duracionMs, 215400);
  assert.equal(r.portada, 'data:image/jpeg;base64,AAAA');
});

test('rechaza URI http(s) y vacías', () => {
  assert.throws(() => normalizarArchivoLocal({ uri: 'http://example.com/a.mp3', nombre: 'a.mp3' }), /content|file/);
  assert.throws(() => normalizarArchivoLocal({ uri: 'https://example.com/a.mp3' }), /content|file/);
  assert.throws(() => normalizarArchivoLocal({ uri: '' }), /content|file/);
});

test('selector y escaneo separan archivos válidos de errores por entrada', async () => {
  const plugin = {
    seleccionarArchivos: async () => ({ archivos: [{ uri: 'content://a/1', nombre: 'uno.mp3' }, { uri: 'http://malo/2.mp3', nombre: '2.mp3' }], errores: [{ nombre: 'roto.mp3', error: 'ilegible' }] }),
    seleccionarCarpeta: async () => ({ archivos: [{ uri: 'content://a/3', nombre: 'tres.mp3' }], errores: [] }),
    escanearMediaStore: async () => ({ archivos: [{ uri: 'content://media/9', nombre: 'nueve.m4a' }], errores: [], permiso: true }),
  };
  const sel = await seleccionarArchivosLocales({ plugin });
  assert.equal(sel.archivos.length, 1);
  assert.equal(sel.errores.length, 2);
  const car = await seleccionarArchivosLocales({ carpeta: true, plugin });
  assert.equal(car.archivos[0].titulo, 'tres');
  const ms = await escanearMediaStore({ plugin });
  assert.equal(ms.archivos[0].titulo, 'nueve');
  assert.equal(ms.permiso, true);
});

test('sin plugin nativo devuelve resultado vacío', async () => {
  const r = await seleccionarArchivosLocales({ plugin: null });
  assert.deepEqual(r, { archivos: [], errores: [], cancelado: true });
});
