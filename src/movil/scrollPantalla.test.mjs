import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearMemoriaScroll, esVuelta } from './scrollPantalla.js';

test('esVuelta: solo con la misma pestaña y menos profundidad', () => {
  const a = { pestana: 'buscar', profundidad: 2 };
  assert.equal(esVuelta(a, { pestana: 'buscar', profundidad: 1 }), true);
  assert.equal(esVuelta(a, { pestana: 'buscar', profundidad: 3 }), false);
  assert.equal(esVuelta(a, { pestana: 'modos', profundidad: 1 }), false);
  assert.equal(esVuelta(null, a), false);
});

test('memoria: arriba siempre salvo al volver a una pantalla guardada', () => {
  const m = crearMemoriaScroll();
  m.salir('buscar|0|raiz|', 480);
  assert.equal(m.entrar('buscar|0|raiz|', false), 0);
  assert.equal(m.entrar('buscar|0|raiz|', true), 480);
  assert.equal(m.entrar('otra', true), 0);
});
