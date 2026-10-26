import test from 'node:test';
import assert from 'node:assert/strict';
import { SECCIONES, rotativasDelDia, cuantasRotativas, estadoSeccionHoy, motivoSinDatos } from './secciones.js';
import { conModo, conSeccion, leerConfigInicio, guardarConfigInicio, modoSeccion, normalizarConfig, seccionActivada } from './config.js';

const base = { modos: {} };
const lunes = new Date(2026, 9, 19, 9); // 19-oct-2026 es lunes
const martes = new Date(2026, 9, 20, 9);

test('los ids del registro son únicos y las rotativas son las 8 pedidas', () => {
  assert.equal(new Set(SECCIONES.map((s) => s.id)).size, SECCIONES.length);
  assert.equal(SECCIONES.filter((s) => s.tipo === 'rotativa').length, 8);
});

test('la elección del día es determinista y no cambia durante el día', () => {
  const a = rotativasDelDia(new Date(2026, 9, 21, 8), base);
  const b = rotativasDelDia(new Date(2026, 9, 21, 23, 59), base);
  assert.deepEqual(a, b);
  assert.equal(a.max, 2);
});

test('cambia de un día a otro', () => {
  const dias = Array.from({ length: 10 }, (_, i) => rotativasDelDia(new Date(2026, 9, 20 + i), base).ids.join());
  assert.ok(new Set(dias).size > 3);
});

test('el lunes Descubrimiento semanal va primero', () => {
  assert.equal(rotativasDelDia(lunes, base).ids[0], 'descubrimiento');
  assert.ok(cuantasRotativas(lunes) >= 2);
});

test('«nunca» no entra; «siempre» va primero y sale todos los días', () => {
  const cfg = { modos: { joyas: 'nunca', capsula: 'nunca', olvidadas: 'siempre', parecidos: 'siempre' } };
  const r = rotativasDelDia(martes, cfg);
  assert.ok(!r.ids.includes('joyas') && !r.ids.includes('capsula'));
  assert.deepEqual(r.ids.slice(0, 2), ['parecidos', 'olvidadas']);
  assert.equal(r.ids.length, 6);
});

test('valores por defecto: fijas «siempre», rotativas «a veces»', () => {
  assert.equal(modoSeccion(base, 'accesos'), 'siempre');
  assert.equal(modoSeccion(base, 'joyas'), 'aveces');
  assert.ok(seccionActivada(base, 'joyas'));
});

test('config: normaliza, migra el formato anterior y persiste', () => {
  assert.deepEqual(normalizarConfig({ modos: { joyas: 'siempre', capsula: 'raro', accesos: 'aveces', olvidadas: 'aveces' } }), { modos: { joyas: 'siempre' } });
  assert.deepEqual(normalizarConfig({ desactivadas: ['x', 3, 'joyas'], todasCadaDia: false }), { modos: { joyas: 'nunca' } });
  const m = normalizarConfig({ desactivadas: ['joyas', 'accesos'], todasCadaDia: true }).modos;
  assert.equal(m.joyas, 'nunca');
  assert.equal(m.accesos, 'nunca');
  assert.equal(m.capsula, 'siempre');
  const c = conSeccion(base, 'joyas', false);
  assert.ok(!seccionActivada(c, 'joyas'));
  assert.ok(seccionActivada(conSeccion(c, 'joyas', true), 'joyas'));
  assert.deepEqual(conModo(conModo(base, 'joyas', 'siempre'), 'joyas', 'aveces'), base);
  const almacen = new Map();
  const ls = { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, v) };
  assert.deepEqual(leerConfigInicio(ls), base);
  guardarConfigInicio({ modos: { joyas: 'nunca' } }, ls);
  assert.deepEqual(leerConfigInicio(ls), { modos: { joyas: 'nunca' } });
});

const dia = 86400000;
const ahora = new Date(2026, 9, 21, 12).getTime();
const hist = (n, haceDias = 1) => Array.from({ length: n }, (_, i) => ({ trackId: `t${i}`, ts: ahora - haceDias * dia }));

test('motivos de «sin datos»', () => {
  assert.equal(motivoSinDatos('novedades', { enLinea: false }), 'necesita conexión');
  assert.equal(motivoSinDatos('novedades', { enLinea: true }), null);
  assert.equal(motivoSinDatos('capsula', { historial: hist(50, 10), ahora }), 'necesita un mes de historial');
  assert.equal(motivoSinDatos('capsula', { historial: [], ahora }), 'necesita un mes de historial');
  assert.equal(motivoSinDatos('capsula', { historial: hist(5, 60), ahora }), null);
  assert.equal(motivoSinDatos('joyas', { historial: hist(14) }), 'escucha un poco más (15 canciones)');
  assert.equal(motivoSinDatos('joyas', { historial: hist(15) }), null);
  assert.equal(motivoSinDatos('joyas', {}), null);
  assert.match(motivoSinDatos('mezcla-modos', { modosConCanciones: 1 }), /dos moods/);
});

test('estadoSeccionHoy: nunca, siempre, a veces y sin datos', () => {
  const fecha = new Date(2026, 9, 21, 12);
  const datos = { historial: hist(20, 2), enLinea: true };
  const est = (id, config = base, d = datos) => estadoSeccionHoy(id, { config, fecha, datos: d });
  assert.deepEqual(est('joyas', { modos: { joyas: 'nunca' } }), { estado: 'nunca', texto: 'No sale en Inicio' });
  assert.deepEqual(est('accesos'), { estado: 'hoy', texto: 'Hoy en Inicio' });
  assert.equal(est('olvidadas', { modos: { olvidadas: 'siempre' } }).estado, 'hoy');
  assert.deepEqual(est('capsula'), { estado: 'sinDatos', texto: 'Aún sin datos: necesita un mes de historial' });
  assert.equal(est('descubrimiento', base, { ...datos, enLinea: false }).texto, 'Aún sin datos: necesita conexión');
  // Sin «siempre» ni sin datos, exactamente `max` rotativas «a veces» salen hoy y el resto no.
  const todas = SECCIONES.filter((s) => s.tipo === 'rotativa').map((s) => s.id);
  const conDatos = todas.filter((id) => !motivoSinDatos(id, { ...datos, ahora: fecha.getTime() }));
  const salen = conDatos.filter((id) => est(id).estado === 'hoy');
  assert.equal(salen.length, Math.min(cuantasRotativas(fecha), conDatos.length));
  assert.ok(conDatos.filter((id) => est(id).estado === 'noToca').every((id) => est(id).texto === 'Hoy no le toca; saldrá otro día'));
  // Una en «siempre» no gasta cupo de las de «a veces».
  const cfg = { modos: { olvidadas: 'siempre' } };
  const salen2 = conDatos.filter((id) => estadoSeccionHoy(id, { config: cfg, fecha, datos }).estado === 'hoy');
  assert.equal(salen2.length, Math.min(cuantasRotativas(fecha), conDatos.length - 1) + 1);
});

test('orden de Inicio: Mood del momento, ¿Cómo te sientes?, Favoritas e Infinito, Creado para ti, Sigue escuchando, géneros y luego las rotativas', () => {
  const ids = [...SECCIONES].sort((a, b) => a.orden - b.orden).map((s) => s.id);
  assert.deepEqual(ids.slice(0, 7), ['modo-momento', 'animo', 'accesos', 'estadisticas', 'creado-para-ti', 'sigue-escuchando', 'generos']);
  assert.ok(ids.slice(7).every((id) => SECCIONES.find((s) => s.id === id).tipo === 'rotativa'));
  assert.ok(!ids.includes('recientes') && !ids.includes('tus-artistas'));
});

test('máximo 2 rotativas al día, todos los días', () => {
  for (let d = 1; d <= 14; d++) assert.equal(cuantasRotativas(new Date(2026, 9, d)), 2);
});

test('normalizarConfig traslada «nunca» de Recientes y Tus artistas a las secciones que los sustituyen y descarta ids viejos', async () => {
  const { normalizarConfig } = await import('./config.js');
  assert.deepEqual(normalizarConfig({ modos: { recientes: 'nunca', 'tus-artistas': 'siempre', fantasma: 'nunca' } }), {
    modos: { 'sigue-escuchando': 'nunca' },
  });
  assert.deepEqual(normalizarConfig({ modos: { recientes: 'nunca', 'sigue-escuchando': 'siempre' } }), { modos: {} });
});
