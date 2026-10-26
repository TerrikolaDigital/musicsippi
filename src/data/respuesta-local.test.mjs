import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comoRespuesta, envolverMutador } from './respuesta-local.js';

test('comoRespuesta imita ok/status/json', async () => {
  const r = comoRespuesta({ ok: true, ejes: [1] });
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, ejes: [1] });
});

test('un resultado vacío da un json vacío que sigue funcionando con .catch', async () => {
  const r = comoRespuesta(undefined);
  assert.deepEqual(await r.json().catch(() => ({})), {});
});

test('envolverMutador pasa los argumentos y propaga los errores', async () => {
  const f = envolverMutador(async (a, b) => ({ suma: a + b }));
  assert.deepEqual(await (await f(1, 2)).json(), { suma: 3 });
  const g = envolverMutador(async () => { throw new Error('x'); });
  await assert.rejects(g(), /x/);
});
