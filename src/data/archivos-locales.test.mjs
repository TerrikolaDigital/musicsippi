import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenMemoria } from './lib/almacen-memoria.js';
import {
  anotarParaCopiar,
  confirmarCopia,
  guardarArchivoLocal,
  obtenerArchivoLocal,
  pendientesDeCopia,
} from './archivos-locales.js';

test('guarda una URI content y confirma una copia pendiente de móvil a PC', async () => {
  const almacen = crearAlmacenMemoria();
  await guardarArchivoLocal({
    trackId: 'track-1',
    dispositivo: 'movil',
    uri: 'content://com.android.providers.media.documents/document/audio%3A42',
    nombre: 'Canción.mp3',
    tamano: 1234,
    sha256: 'a'.repeat(64),
    mime: 'audio/mpeg',
    actualizadoEn: '2026-10-15T10:00:00.000Z',
    bytes: new Uint8Array([1, 2, 3]),
  }, almacen);

  assert.deepEqual(await obtenerArchivoLocal('track-1', 'movil', almacen), {
    id: 'track-1:movil',
    trackId: 'track-1',
    dispositivo: 'movil',
    uri: 'content://com.android.providers.media.documents/document/audio%3A42',
    nombre: 'Canción.mp3',
    tamano: 1234,
    sha256: 'a'.repeat(64),
    mime: 'audio/mpeg',
    actualizadoEn: '2026-10-15T10:00:00.000Z',
  });

  await anotarParaCopiar({
    trackId: 'track-1', origen: 'movil', destino: 'pc', sha256: 'a'.repeat(64), tamano: 1234,
  }, almacen);
  assert.deepEqual(await pendientesDeCopia(almacen), [{
    trackId: 'track-1', origen: 'movil', destino: 'pc', sha256: 'a'.repeat(64), tamano: 1234,
    estado: 'pendiente', reanudableDesde: 0,
  }]);

  await confirmarCopia('track-1', 'pc', almacen);
  assert.deepEqual(await pendientesDeCopia(almacen), []);
});
