import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializarCopia, validarCopia } from './copia-movil.js';

test('serializa con formato, versión y fecha', () => {
  const c = serializarCopia({ biblioteca: [{ id: 'a' }] }, new Date('2026-10-14T10:00:00Z'));
  assert.equal(c.formato, 'musicsippi-copia-movil');
  assert.equal(c.version, 1);
  assert.equal(c.fecha, '2026-10-14T10:00:00.000Z');
  assert.deepEqual(c.stores.biblioteca, [{ id: 'a' }]);
});
test('rechaza basura, otro formato, otra versión y stores rotos', () => {
  assert.equal(validarCopia(null).ok, false);
  assert.equal(validarCopia({ formato: 'otra cosa', version: 1, stores: {} }).ok, false);
  assert.equal(validarCopia({ formato: 'musicsippi-copia-movil', version: 2, stores: {} }).ok, false);
  assert.equal(validarCopia({ formato: 'musicsippi-copia-movil', version: 1, stores: { biblioteca: 'x' } }).ok, false);
  assert.equal(validarCopia({ formato: 'musicsippi-copia-movil', version: 1, stores: { inventado: [] } }).ok, false);
});
test('acepta una copia buena', () => {
  assert.deepEqual(validarCopia(serializarCopia({ biblioteca: [], ejes: [] })), { ok: true });
});
test('rechaza una copia sin stores', () => {
  assert.equal(validarCopia({ formato: 'musicsippi-copia-movil', version: 1 }).ok, false);
});
