import test from 'node:test';
import assert from 'node:assert/strict';
import { comandoCaducado, planAdopcion, indiceDePista } from './sincronizar-nativo.js';

test('comandoCaducado: solo ⏭/⏮ con retraso grande', () => {
  assert.equal(comandoCaducado('anterior', 1000, 20000), true);
  assert.equal(comandoCaducado('siguiente', 1000, 3000), false);
  assert.equal(comandoCaducado('favorito', 1000, 99999), false);
  assert.equal(comandoCaducado('aleatorio', 1000, 99999), false);
  assert.equal(comandoCaducado('anterior', undefined, 99999), false); // sin ts: compatible con versiones viejas
});

test('planAdopcion: nativo vacío o JS cargando no adopta', () => {
  assert.equal(planAdopcion({ nativo: {}, videoActual: 'a', cargando: 0 }), null);
  assert.equal(planAdopcion({ nativo: null, videoActual: 'a', cargando: 0 }), null);
  assert.equal(planAdopcion({ nativo: { id: 'b' }, videoActual: 'a', cargando: 3 }), null);
});

test('planAdopcion: misma pista no es cambio; otra sí', () => {
  const n = { id: 'b', posicionMs: 4200, duracionMs: 180000, estado: 'reproduciendo' };
  assert.deepEqual(planAdopcion({ nativo: n, videoActual: 'b', cargando: 0 }), {
    id: 'b', cambioPista: false, posicionMs: 4200, duracionMs: 180000, estado: 'reproduciendo',
  });
  assert.equal(planAdopcion({ nativo: n, videoActual: 'a', cargando: 0 }).cambioPista, true);
  assert.equal(planAdopcion({ nativo: n, videoActual: null, cargando: 0 }).cambioPista, true); // WebView recién abierto
});

test('indiceDePista: busca en círculo desde el actual y reconoce ids locales', () => {
  const cola = [{ id: 't1', v: 'a' }, { id: 't2', v: 'b' }, { id: 't3', v: 'a' }];
  const idsDe = (t) => [t.v, `local:${t.id}`];
  assert.equal(indiceDePista(cola, 'a', 1, idsDe), 2); // duplicado: el más cercano hacia delante
  assert.equal(indiceDePista(cola, 'a', 0, idsDe), 0);
  assert.equal(indiceDePista(cola, 'a', 2, idsDe), 2);
  assert.equal(indiceDePista(cola, 'local:t2', 0, idsDe), 1);
  assert.equal(indiceDePista(cola, 'zzz', 0, idsDe), -1);
  assert.equal(indiceDePista([], 'a', 0, idsDe), -1);
});
