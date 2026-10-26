import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearQuitarDiferido } from './quitarDiferido.js';

function montar() {
  const quitados = [];
  const timers = [];
  const cambios = [];
  const q = crearQuitarDiferido({
    quitar: async (id) => quitados.push(id),
    programar: (fn) => (timers.push(fn), timers.length),
    cancelar: (t) => (timers[t - 1] = null),
    alCambiar: (p) => cambios.push(p?.etiqueta ?? null),
  });
  return { q, quitados, timers, cambios };
}

test('al vencer el plazo se quitan todas, en orden', async () => {
  const { q, quitados, timers } = montar();
  await q.programar(['a', 'b', 'c'], 'X');
  assert.deepEqual(quitados, []);
  timers[0]();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(quitados, ['a', 'b', 'c']);
  assert.equal(q.pendiente(), null);
});

test('deshacer cancela la baja', async () => {
  const { q, quitados, timers, cambios } = montar();
  await q.programar(['a'], 'X');
  q.deshacer();
  assert.equal(timers[0], null);
  assert.deepEqual(quitados, []);
  assert.deepEqual(cambios, ['X', null]);
});

test('una segunda baja aplica la primera antes; vaciar aplica la pendiente', async () => {
  const { q, quitados } = montar();
  await q.programar(['a'], 'X');
  await q.programar(['b'], 'Y');
  assert.deepEqual(quitados, ['a']);
  await q.vaciar();
  assert.deepEqual(quitados, ['a', 'b']);
});
