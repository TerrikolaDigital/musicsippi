import test from 'node:test';
import assert from 'node:assert/strict';
import { tocaOrganizarSolo, INTERVALO_ORGANIZAR_AUTO_MS } from './organizarAuto.js';

const base = { sinModo: 66, ahora: 10 * INTERVALO_ORGANIZAR_AUTO_MS, organizando: false, modeloDisponible: true, redMedida: false };

test('organiza si hay canciones sin modo y nada lo impide', () => {
  assert.deepEqual(tocaOrganizarSolo(base), { organizar: true, motivo: 'auto' });
});
test('no hace nada sin canciones sin modo ni si ya está organizando', () => {
  assert.equal(tocaOrganizarSolo({ ...base, sinModo: 0 }).organizar, false);
  assert.equal(tocaOrganizarSolo({ ...base, organizando: true }).motivo, 'ya-organizando');
});
test('como mucho una vez cada 6 h', () => {
  assert.equal(tocaOrganizarSolo({ ...base, ultimaAuto: base.ahora - 3600_000 }).motivo, 'reciente');
  assert.equal(tocaOrganizarSolo({ ...base, ultimaAuto: base.ahora - INTERVALO_ORGANIZAR_AUTO_MS }).organizar, true);
});
test('respeta la protección contra bucles', () => {
  assert.equal(tocaOrganizarSolo({ ...base, bloqueadoPorBucle: true }).motivo, 'bucle');
});
test('sin modelo y con datos móviles espera al WiFi; con modelo no importa la red', () => {
  assert.equal(tocaOrganizarSolo({ ...base, modeloDisponible: false, redMedida: true }).motivo, 'esperar-wifi');
  assert.equal(tocaOrganizarSolo({ ...base, redMedida: true }).organizar, true);
});
test('si quedan las mismas que la última vez no vuelve a intentarlo; si hay nuevas, sí', () => {
  assert.equal(tocaOrganizarSolo({ ...base, sinModo: 65, restantesTrasUltima: 65 }).motivo, 'sin-novedades');
  assert.equal(tocaOrganizarSolo({ ...base, sinModo: 70, restantesTrasUltima: 65 }).organizar, true);
});
test('con estados que se rellenan solos toca pasar aunque no falte ningún modo (y respeta las 6 h)', () => {
  assert.deepEqual(tocaOrganizarSolo({ ...base, sinModo: 0, estadosAlimentables: true }), { organizar: true, motivo: 'auto' });
  assert.equal(tocaOrganizarSolo({ ...base, sinModo: 0, estadosAlimentables: true, ultimaAuto: base.ahora - 3600_000 }).motivo, 'reciente');
  assert.equal(tocaOrganizarSolo({ ...base, sinModo: 65, restantesTrasUltima: 65, estadosAlimentables: true }).organizar, true);
});
