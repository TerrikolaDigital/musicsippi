import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirNovedades, urlNotasVersion, leerVersionVista, guardarVersionVista, CLAVE_VISTA } from './novedades.js';

test('decidirNovedades: instalación nueva (sin vista ni uso previo) registra sin mostrar', () => {
  assert.equal(decidirNovedades({ instalada: 638, vista: null }), 'registrar');
  assert.equal(decidirNovedades({ instalada: 638 }), 'registrar');
  assert.equal(decidirNovedades({ instalada: 638, vista: null, usuarioPrevio: false }), 'registrar');
});
test('decidirNovedades: vista ausente + usuario previo muestra', () => {
  assert.equal(decidirNovedades({ instalada: 639, vista: null, usuarioPrevio: true }), 'mostrar');
  assert.equal(decidirNovedades({ instalada: 639, usuarioPrevio: true }), 'mostrar');
});
test('decidirNovedades: usuarioPrevio no altera el caso con vista guardada', () => {
  assert.equal(decidirNovedades({ instalada: 639, vista: 639, usuarioPrevio: true }), 'nada');
});
test('decidirNovedades: actualizada muestra; igual o menor no', () => {
  assert.equal(decidirNovedades({ instalada: 639, vista: 638 }), 'mostrar');
  assert.equal(decidirNovedades({ instalada: 638, vista: 638 }), 'nada');
  assert.equal(decidirNovedades({ instalada: 637, vista: 638 }), 'nada');
});
test('decidirNovedades: versión instalada inválida no hace nada', () => {
  assert.equal(decidirNovedades({ instalada: null, vista: 1 }), 'nada');
  assert.equal(decidirNovedades({ instalada: NaN, vista: null }), 'nada');
});
test('urlNotasVersion', () => {
  assert.equal(urlNotasVersion(638), 'https://github.com/TerrikolaDigital/musicsippi-android/releases/download/v1.638/version.json');
});
function almacenFalso(inicial = {}) {
  const d = { ...inicial };
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } };
}
test('leer/guardar versión vista', () => {
  const a = almacenFalso();
  assert.equal(leerVersionVista(a), null);
  guardarVersionVista(639, a);
  assert.equal(a.getItem(CLAVE_VISTA), '639');
  assert.equal(leerVersionVista(a), 639);
});
test('almacenamiento que lanza o ausente no rompe', () => {
  const malo = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(leerVersionVista(malo), null);
  assert.doesNotThrow(() => guardarVersionVista(1, malo));
  assert.equal(leerVersionVista(null), null);
});
