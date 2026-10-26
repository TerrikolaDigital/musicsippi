import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conPortadasPropias, tamanoMaximo } from './portadaEje.js';

test('la portada propia del eje va la primera y no se repite', () => {
  const covers = new Map([['a', ['u1', 'u2']], ['b', ['u3']]]);
  const r = conPortadasPropias(covers, [{ id: 'a', portada: 'u2' }, { id: 'b', portada: 'data:x' }, { id: 'c', portada: 'data:y' }, { id: 'd' }]);
  assert.deepEqual(r.get('a'), ['u2', 'u1']);
  assert.deepEqual(r.get('b'), ['data:x', 'u3']);
  assert.deepEqual(r.get('c'), ['data:y']);
  assert.equal(r.has('d'), false);
  assert.deepEqual(covers.get('a'), ['u1', 'u2']); // no muta
});
test('sin portadas propias devuelve el mismo mapa', () => {
  const covers = new Map();
  assert.equal(conPortadasPropias(covers, [{ id: 'a' }]), covers);
});
test('tamanoMaximo reduce sin pasar de 1024 y conserva la proporción', () => {
  assert.deepEqual(tamanoMaximo(4000, 2000), { w: 1024, h: 512 });
  assert.deepEqual(tamanoMaximo(500, 800), { w: 500, h: 800 });
  assert.deepEqual(tamanoMaximo(1000, 3000), { w: 341, h: 1024 });
});
