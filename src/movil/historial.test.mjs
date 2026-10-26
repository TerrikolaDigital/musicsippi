import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorDia, rankingCanciones, rankingModos } from './historial.js';

const hoy = new Date(2026, 9, 14, 15, 0);
const ts = (d, h) => new Date(2026, 9, d, h).getTime();

test('agrupa en Hoy, Ayer y fecha', () => {
  const g = agruparPorDia([{ ts: ts(14, 10) }, { ts: ts(13, 22) }, { ts: ts(10, 9) }, { ts: ts(14, 12) }], hoy);
  assert.deepEqual(g.map((x) => x.etiqueta), ['Hoy', 'Ayer', '10 de octubre']);
  assert.equal(g[0].entradas[0].ts, ts(14, 12));
});
test('vacío', () => {
  assert.deepEqual(agruparPorDia([], hoy), []);
});

test('ranking de canciones: cuenta por trackId, desempata por orden y prefiere la copia de la biblioteca', () => {
  const entradas = [
    { trackId: 'a', track: { id: 'hist-a' }, enBiblioteca: false },
    { trackId: 'b', track: { id: 'b' }, enBiblioteca: true },
    { trackId: 'a', track: { id: 'a' }, enBiblioteca: true },
    { trackId: 'a', track: { id: 'hist-a2' }, enBiblioteca: false },
    { trackId: 'c', track: { id: 'c' }, enBiblioteca: true },
  ];
  const r = rankingCanciones(entradas);
  assert.deepEqual(r.map((x) => [x.track.id, x.n]), [['a', 3], ['b', 1], ['c', 1]]);
  assert.equal(r[0].enBiblioteca, true);
  assert.equal(rankingCanciones(entradas, 2).length, 2);
});

test('ranking de modos: ignora modos borrados y entradas sin modo', () => {
  const entradas = [
    { ejeId: 'rock', ejeNombre: 'Rock' },
    { ejeId: 'chill', ejeNombre: 'Chill' },
    { ejeId: 'rock', ejeNombre: 'Rock' },
    { ejeId: 'viejo', ejeNombre: 'Viejo' },
    {},
  ];
  const r = rankingModos(entradas, [{ id: 'rock' }, { id: 'chill' }]);
  assert.deepEqual(r, [{ ejeId: 'rock', nombre: 'Rock', n: 2 }, { ejeId: 'chill', nombre: 'Chill', n: 1 }]);
});
