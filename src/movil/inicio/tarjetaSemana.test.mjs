import test from 'node:test';
import assert from 'node:assert/strict';
import { claveResumen, estadoTarjetaSemana, marcarResumenVisto, resumenVisto } from './tarjetaSemana.js';

const almacenFalso = () => {
  const d = new Map();
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => d.set(k, String(v)) };
};

test('sin resumen que tocar no hay banda (los datos de la semana viven en Estadísticas)', () => {
  assert.equal(estadoTarjetaSemana({ toca: null }), null);
});

test('cuando toca el resumen semanal sale la banda con su texto', () => {
  const e = estadoTarjetaSemana({ toca: 'semana' });
  assert.equal(e.periodo, 'semana');
  assert.match(e.titulo, /Tu semana en Musicsippi está lista/);
});

test('el resumen del año: en curso o edición completa', () => {
  assert.match(estadoTarjetaSemana({ toca: 'anio' }).titulo, /está listo/);
  assert.match(estadoTarjetaSemana({ toca: 'anio', anioCompleto: true }).titulo, /edición completa/);
});

test('al abrirla desaparece: la banda no sale si ya se vio', () => {
  assert.equal(estadoTarjetaSemana({ toca: 'semana', visto: true }), null);
});

test('recuerda lo visto por semana (lunes de inicio) y la edición completa del año cuenta aparte', () => {
  const lunes = new Date(2026, 9, 19, 10).getTime(); // lunes 19-oct-2026
  const a = almacenFalso();
  const k = claveResumen('semana', { ahora: lunes });
  assert.equal(resumenVisto(k, a), false);
  marcarResumenVisto(k, a);
  assert.equal(resumenVisto(k, a), true);
  assert.equal(resumenVisto(claveResumen('semana', { ahora: lunes + 3600000 }), a), true, 'misma semana');
  assert.equal(resumenVisto(claveResumen('semana', { ahora: lunes + 8 * 86400000 }), a), false, 'otra semana');
  assert.notEqual(claveResumen('anio', { ahora: lunes }), claveResumen('anio', { ahora: lunes, completo: true }));
});

test('sin localStorage no revienta: se considera no visto', () => {
  assert.equal(resumenVisto('x', null), false);
  marcarResumenVisto('x', null);
});
