import test from 'node:test';
import assert from 'node:assert/strict';
import { ventanaResumenAnual, rangoResumen, resumenQueToca, armarResumen, armarPantallas, fraseHora, fraseComparativa, textoRango } from './resumen.js';

const f = (a, m, d, h = 12) => new Date(a, m, d, h).getTime();
const e = (trackId, ts, extra = {}) => ({ trackId, ts, duracionS: 600, ...extra });
const biblioteca = [
  { id: 't1', titulo: 'Uno', artista: 'Ana', ejes: [{ ejeId: 'rock' }] },
  { id: 't2', titulo: 'Dos', artista: 'Beto', ejes: [{ ejeId: 'chill' }] },
];
const ejes = [{ id: 'rock', nombre: 'Rock' }, { id: 'chill', nombre: 'Chill' }];

test('rangoResumen: semana desde el lunes; el lunes cuenta la anterior', () => {
  assert.equal(rangoResumen('semana', f(2026, 9, 18)).desde, f(2026, 9, 12, 0)); // domingo
  const lun = rangoResumen('semana', f(2026, 9, 19));
  assert.equal(lun.desde, f(2026, 9, 12, 0));
  assert.equal(lun.hasta, f(2026, 9, 19, 0));
});

test('rangoResumen: año; en enero resume el anterior', () => {
  assert.equal(rangoResumen('anio', f(2026, 11, 5)).desde, f(2026, 0, 1, 0));
  assert.equal(rangoResumen('anio', f(2027, 0, 10)).desde, f(2026, 0, 1, 0));
});

test('resumenQueToca: semana con ≥ 1 h solo en domingo, año en diciembre', () => {
  const poco = [e('t1', f(2026, 9, 14)), e('t1', f(2026, 9, 15))]; // 20 min
  assert.equal(resumenQueToca(poco, { ahora: f(2026, 9, 18) }), null);
  const mucho = Array.from({ length: 8 }, (_, i) => e('t1', f(2026, 9, 13, 8 + i))); // 80 min
  assert.equal(resumenQueToca(mucho, { ahora: f(2026, 9, 18) }), 'semana');
  assert.equal(resumenQueToca(mucho, { ahora: f(2026, 9, 19) }), null); // lunes: ya no sale
  assert.equal(resumenQueToca(mucho, { ahora: f(2026, 9, 21) }), null); // miércoles
  assert.equal(resumenQueToca([e('t1', f(2026, 5, 1))], { ahora: f(2026, 11, 3) }), 'anio');
  assert.equal(resumenQueToca([], { ahora: f(2026, 11, 3) }), null);
});

test('armarResumen: bucle, hora, descubrimiento, racha y comparativa', () => {
  const desde = f(2026, 9, 12, 0);
  const hasta = f(2026, 9, 18, 23);
  const h = [
    e('t1', f(2026, 9, 5)), // semana anterior (t1 ya conocida)
    e('t1', f(2026, 9, 12, 23)), e('t1', f(2026, 9, 13, 23)), e('t1', f(2026, 9, 14, 8)),
    e('t2', f(2026, 9, 15, 23)), e('t2', f(2026, 9, 16, 23)),
  ];
  const r = armarResumen(h, biblioteca, { desde, hasta, ejes });
  assert.equal(r.bucle.trackId, 't1');
  assert.equal(r.bucle.n, 3);
  assert.equal(r.minutos, 50);
  assert.equal(r.horaFavorita, 23);
  assert.equal(r.descubrimiento.trackId, 't2');
  assert.equal(r.descubrimiento.n, 2);
  assert.equal(r.cambioPct, 400);
  assert.equal(r.modo.ejeId, 'rock');
  assert.equal(r.racha, 5);
  assert.equal(fraseHora(23), 'Eres de escuchar a las 23 h');
  assert.match(fraseComparativa(r, 'semana'), /400 % más que la semana pasada/);
});

test('sin periodo previo no hay comparativa; las pantallas acaban siempre en la final', () => {
  const desde = f(2026, 9, 12, 0);
  const r = armarResumen([e('t1', f(2026, 9, 13))], biblioteca, { desde, hasta: f(2026, 9, 18), ejes });
  assert.equal(r.cambioPct, null);
  const ids = armarPantallas(r, 'semana').map((p) => p.id);
  assert.equal(ids.at(-1), 'final');
  assert.ok(ids.includes('minutos') && ids.includes('bucle'));
  assert.deepEqual(armarPantallas(armarResumen([], biblioteca, { desde, hasta: f(2026, 9, 18) }), 'semana').map((p) => p.id), ['final']);
});

test('ventanaResumenAnual: límites de la ventana', () => {
  const v = (a, m, d) => ventanaResumenAnual(new Date(a, m, d, 12));
  assert.deepEqual(v(2026, 10, 29), { visible: false, anio: 2026, completo: false });
  assert.deepEqual(v(2026, 10, 30), { visible: true, anio: 2026, completo: false }); // último lunes de noviembre
  assert.deepEqual(v(2026, 11, 31), { visible: true, anio: 2026, completo: false });
  assert.deepEqual(v(2027, 0, 1), { visible: true, anio: 2026, completo: true });
  assert.deepEqual(v(2027, 0, 15), { visible: true, anio: 2026, completo: true });
  assert.deepEqual(v(2027, 0, 16), { visible: false, anio: 2027, completo: false });
  assert.equal(v(2025, 10, 24).visible, true); // 2025: el último lunes es el 24
  assert.equal(v(2025, 10, 23).visible, false);
});

test('rangoResumen anual: hasta hoy en diciembre, año entero en enero', () => {
  const dic = rangoResumen('anio', f(2026, 11, 5));
  assert.equal(dic.completo, false);
  assert.equal(dic.hasta, f(2026, 11, 5) + 1);
  const ene = rangoResumen('anio', f(2027, 0, 5));
  assert.equal(ene.completo, true);
  assert.equal(ene.hasta, f(2027, 0, 1, 0));
});

test('rango de la semana: el lunes es la semana pasada completa y el texto lo dice', () => {
  const { desde, hasta } = rangoResumen('semana', f(2026, 9, 19));
  assert.equal(textoRango(desde, hasta, 'semana'), 'Del 12 al 18 de octubre');
  assert.equal(textoRango(f(2026, 9, 28, 0), f(2026, 10, 3, 0), 'semana'), 'Del 28 de octubre al 2 de noviembre');
  assert.equal(textoRango(f(2026, 0, 1, 0), f(2027, 0, 1, 0), 'anio'), 'Año 2026');
});

test('armarPantallas: el texto de minutos depende del periodo', () => {
  const res = armarResumen([e('t1', f(2026, 9, 14))], biblioteca, { desde: f(2026, 9, 12, 0), hasta: f(2026, 9, 19, 0), ejes });
  assert.equal(armarPantallas(res, 'semana')[0].pre, 'Esta semana has escuchado');
  assert.equal(armarPantallas(res, 'anio')[0].pre, 'Este año has escuchado');
});
