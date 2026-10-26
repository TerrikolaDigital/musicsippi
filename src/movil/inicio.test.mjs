import test from 'node:test';
import assert from 'node:assert/strict';
import { sinEscucharHaceTiempo, contarSinModo, textoSincronizacion } from './inicio.js';

const D = 86400000;
const ahora = 100 * D;
const pistas = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

test('sinEscucharHaceTiempo: antiguas por antigüedad, luego las nunca, sin las recientes', () => {
  const hist = [
    { trackId: 'a', ts: ahora - 5 * D },
    { trackId: 'b', ts: ahora - 40 * D },
    { trackId: 'b', ts: ahora - 90 * D },
    { trackId: 'c', ts: ahora - 60 * D },
  ];
  const r = sinEscucharHaceTiempo(pistas, hist, { ahora });
  assert.deepEqual(r.map((t) => t.id), ['c', 'b', 'd']);
  assert.equal(sinEscucharHaceTiempo(pistas, hist, { ahora, limite: 1 }).length, 1);
});

test('contarSinModo ignora sin-clasificar y favoritos', () => {
  const t = [{ id: 1 }, { id: 2, ejes: [{ ejeId: 'sin-clasificar' }, { ejeId: 'favoritos' }] }, { id: 3, ejes: [{ ejeId: 'x' }] }];
  assert.equal(contarSinModo(t), 2);
});

test('textoSincronizacion', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  assert.equal(textoSincronizacion(null, 3, now), null);
  assert.equal(textoSincronizacion('2026-10-18T10:00:00Z', 0, now), 'Sincronizado con el PC · hace 2 h');
  assert.equal(textoSincronizacion('2026-10-18T10:00:00Z', 1, now), 'Hay 1 cambio pendiente de enviar al PC');
  assert.equal(textoSincronizacion('2026-10-18T10:00:00Z', 4, now), 'Hay 4 cambios pendientes de enviar al PC');
});

import { esMovimiento } from './pulsacionModo.js';
test('esMovimiento distingue scroll de pulsación quieta', () => {
  assert.equal(esMovimiento(0, 0, 3, 3), false);
  assert.equal(esMovimiento(0, 0, 12, 0), true);
});
