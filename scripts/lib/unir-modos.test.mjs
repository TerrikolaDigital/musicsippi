import test from 'node:test';
import assert from 'node:assert/strict';
import { unirModos } from './unir-modos.mjs';

const datos = () => ({
  ejesData: { ejes: [
    { id: 'nw', nombre: 'New Wave', tipo: 'gusto' },
    { id: 'rock-es', nombre: 'Rock en español', tipo: 'gusto' },
    { id: 'favoritos', nombre: 'Favoritas', tipo: 'playlist' },
    { id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', sistema: true },
  ] },
  bib: { tracks: [
    { id: 'a', ejes: [{ ejeId: 'nw', origen: 'auto', score: 0.8 }] },
    { id: 'b', ejes: [{ ejeId: 'nw' }, { ejeId: 'rock-es' }] },
    { id: 'c', ejes: [{ ejeId: 'rock-es' }, { ejeId: 'favoritos' }] },
  ] },
});

test('mueve las pertenencias sin duplicar y borra el modo origen', () => {
  const { ejesData, bib } = datos();
  const r = unirModos(ejesData, bib, 'nw', 'rock-es');
  assert.equal(r.ok, true);
  assert.equal(r.movidas, 1);
  assert.equal(r.yaEnDestino, 1);
  assert.deepEqual(ejesData.ejes.map((e) => e.id), ['rock-es', 'favoritos', 'sin-clasificar']);
  assert.deepEqual(bib.tracks[0].ejes.map((a) => a.ejeId), ['rock-es']);
  assert.deepEqual(bib.tracks[1].ejes.map((a) => a.ejeId), ['rock-es']);
  assert.equal(bib.tracks[2].ejes.length, 2);
});

test('rechaza ids iguales, inexistentes o que no son modos', () => {
  const { ejesData, bib } = datos();
  assert.equal(unirModos(ejesData, bib, 'nw', 'nw').ok, false);
  assert.equal(unirModos(ejesData, bib, 'nw', 'nada').error, 'modo_no_existe');
  assert.equal(unirModos(ejesData, bib, 'nw', 'sin-clasificar').error, 'eje_no_es_modo');
  assert.equal(unirModos(ejesData, bib, 'sin-clasificar', 'nw').error, 'eje_no_es_modo');
  assert.equal(ejesData.ejes.length, 4);
});

test('actualiza historial y últimos modos', () => {
  const { ejesData, bib } = datos();
  const hist = [{ ejeId: 'nw', ejeNombre: 'New Wave' }];
  const ult = ['nw', 'rock-es'];
  unirModos(ejesData, bib, 'nw', 'rock-es', hist, ult);
  assert.equal(hist[0].ejeId, 'rock-es');
  assert.deepEqual(ult, ['rock-es']);
});

test('une un modo con una lista y una lista con un modo', () => {
  const a = datos();
  const r = unirModos(a.ejesData, a.bib, 'nw', 'favoritos');
  assert.equal(r.ok, true);
  assert.deepEqual(a.bib.tracks[0].ejes.map((x) => x.ejeId), ['favoritos']);
  const b = datos();
  const r2 = unirModos(b.ejesData, b.bib, 'favoritos', 'nw', [{ ejeId: 'favoritos', ejeNombre: 'Favoritas' }]);
  assert.equal(r2.ok, true);
  assert.equal(r2.movidas, 1);
  assert.deepEqual(b.bib.tracks[2].ejes.map((x) => x.ejeId), ['rock-es', 'nw']);
  assert.ok(!b.ejesData.ejes.some((e) => e.id === 'favoritos'));
});

test('unir hacia una lista no quita «sin-clasificar» de las canciones', () => {
  const { ejesData, bib } = datos();
  bib.tracks[0].ejes.push({ ejeId: 'sin-clasificar' });
  unirModos(ejesData, bib, 'rock-es', 'favoritos');
  assert.ok(bib.tracks[0].ejes.some((a) => a.ejeId === 'sin-clasificar'));
});
