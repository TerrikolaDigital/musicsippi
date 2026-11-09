import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializarCopia, validarCopia, CLAVES_SENSIBLES, limpiarSensibles, combinarConfiguracion } from './copia-movil.js';

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
test('limpiarSensibles quita las tres claves y deja el resto', () => {
  const stores = {
    biblioteca: [{ id: 'a' }],
    configuracion: [
      { clave: 'youtubeApiKey', valor: 'x' },
      { clave: 'claveEmparejamientoPC', valor: 'y' },
      { clave: 'direccionPC', valor: 'z' },
      { clave: 'letras:a', valor: 1 },
    ],
  };
  const limpia = limpiarSensibles(stores);
  assert.deepEqual(limpia.configuracion, [{ clave: 'letras:a', valor: 1 }]);
  assert.deepEqual(limpia.biblioteca, [{ id: 'a' }]);
  assert.equal(stores.configuracion.length, 4);
  assert.deepEqual([...CLAVES_SENSIBLES].sort(), ['claveEmparejamientoPC', 'direccionPC', 'youtubeApiKey']);
});
test('restaurar ignora claves sensibles del archivo y conserva las actuales', () => {
  const actual = [{ clave: 'direccionPC', valor: '192.168.1.5' }, { clave: 'youtubeApiKey', valor: 'mia' }];
  const entrante = [{ clave: 'direccionPC', valor: '1.2.3.4' }, { clave: 'letras:a', valor: 1 }];
  const r = combinarConfiguracion(actual, entrante);
  assert.equal(r.find((x) => x.clave === 'direccionPC').valor, '192.168.1.5');
  assert.equal(r.find((x) => x.clave === 'youtubeApiKey').valor, 'mia');
  assert.equal(r.find((x) => x.clave === 'letras:a').valor, 1);
  assert.equal(r.length, 3);
});
test('combinarConfiguracion sin clave sensible en el archivo conserva la actual', () => {
  const r = combinarConfiguracion([{ clave: 'direccionPC', valor: '192.168.1.5' }], []);
  assert.deepEqual(r, [{ clave: 'direccionPC', valor: '192.168.1.5' }]);
});

// --- Revisión final: I1, I2, I4 ---
import { contenidoParaHash, CLAVES_LOCALES, restaurarCopia, MAX_TEXTO_COPIA } from './copia-movil.js';

test('I2: copiaAuto es clave local del dispositivo: no se exporta y se conserva al restaurar', () => {
  assert.ok(CLAVES_LOCALES.includes('copiaAuto'));
  const stores = { configuracion: [{ clave: 'copiaAuto', valor: { uri: 'content://x' } }, { clave: 'letras:a', valor: 1 }] };
  assert.deepEqual(limpiarSensibles(stores).configuracion, [{ clave: 'letras:a', valor: 1 }]);
  const actual = [{ clave: 'copiaAuto', valor: { uri: 'content://mia' } }];
  const entrante = [{ clave: 'copiaAuto', valor: { uri: 'content://vieja' } }, { clave: 'letras:a', valor: 1 }];
  const r = combinarConfiguracion(actual, entrante);
  assert.deepEqual(r.find((x) => x.clave === 'copiaAuto').valor, { uri: 'content://mia' });
  assert.equal(r.length, 2);
  // sin copiaAuto actual (copia nunca activada) y con una entrante: no aparece
  assert.equal(combinarConfiguracion([], entrante).some((x) => x.clave === 'copiaAuto'), false);
});
test('I1: dos exportaciones con fechas distintas y datos iguales dan el mismo contenido para el hash', () => {
  const stores = { biblioteca: [{ id: 'a' }], configuracion: [{ clave: 'copiaAuto', valor: { hash: 'h1', ultimaCopia: 1 } }, { clave: 'letras:a', valor: 1 }] };
  const otros = { biblioteca: [{ id: 'a' }], configuracion: [{ clave: 'copiaAuto', valor: { hash: 'h2', ultimaCopia: 2 } }, { clave: 'letras:a', valor: 1 }] };
  const t1 = JSON.stringify(serializarCopia(stores, new Date('2026-10-14T10:00:00Z')));
  const t2 = JSON.stringify(serializarCopia(otros, new Date('2026-10-15T10:00:00Z')));
  assert.notEqual(t1, t2);
  assert.equal(contenidoParaHash(JSON.parse(t1).stores), contenidoParaHash(JSON.parse(t2).stores));
  const cambiado = { ...otros, biblioteca: [{ id: 'b' }] };
  assert.notEqual(contenidoParaHash(cambiado), contenidoParaHash(otros));
});
test('I4: restaurarCopia rechaza más de 50 MB (caracteres y bytes UTF-8) sin tocar nada', async () => {
  await assert.rejects(restaurarCopia('a'.repeat(MAX_TEXTO_COPIA + 1)), /demasiado grande/);
  // pocos caracteres pero > 50 MB en bytes (2 bytes por «é»)
  await assert.rejects(restaurarCopia('é'.repeat(MAX_TEXTO_COPIA / 2 + 1)), /demasiado grande/);
});
