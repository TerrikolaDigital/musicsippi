import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apoyaElTitulo, generoPrincipalDe, resolverVetosDeGeneroNuevo, vetoBlando, vetoDuro } from './compatibilidad-estados.js';

test('vetos duros y blandos de la matriz', () => {
  assert.ok(vetoDuro('tranquilo', 'pop-bailable'));
  assert.ok(vetoDuro('con-energia', 'instrumental'));
  assert.ok(!vetoDuro('feliz', 'instrumental'));
  assert.ok(!vetoDuro('tranquilo', null));
  assert.ok(vetoBlando('tranquilo', 'pop'));
  assert.ok(!vetoBlando('tranquilo', 'instrumental'));
});

test('el título puede apoyar a Zen o a Blue', () => {
  assert.ok(apoyaElTitulo('tranquilo', 'Piano Nights'));
  assert.ok(apoyaElTitulo('melancolico', 'So Lonely'));
  assert.ok(!apoyaElTitulo('feliz', 'Piano'));
});

test('generoPrincipalDe ignora Bandas sonoras', () => {
  const ids = new Set(['pop', 'bandas-sonoras']);
  assert.equal(generoPrincipalDe({ ejes: [{ ejeId: 'bandas-sonoras' }, { ejeId: 'pop' }] }, ids), 'pop');
  assert.equal(generoPrincipalDe({ ejes: [{ ejeId: 'bandas-sonoras' }] }, ids), null);
});

test('resolverVetosDeGeneroNuevo: quita el estado automático, conserva el manual y retira el género', () => {
  const g = new Set(['rock']);
  const a = resolverVetosDeGeneroNuevo([{ ejeId: 'tranquilo', origen: 'auto' }, { ejeId: 'rock' }], ['rock'], g);
  assert.deepEqual([a.ejes.map((x) => x.ejeId), a.quitados, a.anulados], [['rock'], ['tranquilo'], []]);
  const b = resolverVetosDeGeneroNuevo([{ ejeId: 'tranquilo', origen: 'manual' }, { ejeId: 'rock' }], ['rock'], g);
  assert.deepEqual([b.ejes.map((x) => x.ejeId), b.quitados, b.anulados], [['tranquilo'], [], ['rock']]);
});
