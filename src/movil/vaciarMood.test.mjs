import test from 'node:test';
import assert from 'node:assert/strict';
import { vaciarMood, restaurarMood } from './vaciarMood.js';

const crearCtx = (fallan = []) => {
  const llamadas = [];
  const f = (nombre) => async (...a) => {
    llamadas.push([nombre, ...a]);
    if (fallan.includes(a[0])) throw new Error('fallo');
  };
  return { llamadas, guardarColeccion: async (id, e, v) => f('col')(id, e, v), quitarModo: f('quitar'), asignarEje: f('asignar') };
};

test('un mood normal se vacía con quitarModo', async () => {
  const ctx = crearCtx();
  const r = await vaciarMood(ctx, { id: 'm1', tipo: 'estado' }, ['a', 'b']);
  assert.deepEqual(r, { quitadas: ['a', 'b'], falladas: 0 });
  assert.deepEqual(ctx.llamadas, [['quitar', 'a', 'm1'], ['quitar', 'b', 'm1']]);
});

test('listas y favoritos usan guardarColeccion', async () => {
  const ctx = crearCtx();
  await vaciarMood(ctx, { id: 'l', tipo: 'playlist' }, ['a']);
  await vaciarMood(ctx, { id: 'favoritos', tipo: 'sistema' }, ['b']);
  assert.deepEqual(ctx.llamadas, [['col', 'a', 'l', false], ['col', 'b', 'favoritos', false]]);
});

test('si una falla, las demás se quitan y se cuenta el fallo', async () => {
  const ctx = crearCtx(['b']);
  const r = await vaciarMood(ctx, { id: 'm1', tipo: 'estado' }, ['a', 'b', 'c']);
  assert.deepEqual(r, { quitadas: ['a', 'c'], falladas: 1 });
});

test('restaurar vuelve a asignar y cuenta fallos', async () => {
  const ctx = crearCtx(['b']);
  const r = await restaurarMood(ctx, { id: 'm1', tipo: 'estado' }, ['a', 'b']);
  assert.deepEqual(r, { restauradas: 1, falladas: 1 });
  assert.deepEqual(ctx.llamadas[0], ['asignar', 'a', 'm1']);
});
