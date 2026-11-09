import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularEstadisticas, inicioPeriodo, rachaDias, DURACION_ESTIMADA_S } from './estadisticas.js';

// Miércoles 14 de octubre de 2026, 12:00 (hora local).
const ahora = new Date(2026, 9, 14, 12, 0, 0).getTime();
const dia = (dias, h = 10) => new Date(2026, 9, 14 - dias, h, 0, 0).getTime();
const e = (trackId, ts, extra = {}) => ({ trackId, ts, ...extra });

const tracks = [
  { id: 't1', titulo: 'Uno', artista: 'Ana', ejes: [{ ejeId: 'rock' }] },
  { id: 't2', titulo: 'Dos', artista: 'Ana', ejes: [{ ejeId: 'rock' }, { ejeId: 'chill' }] },
  { id: 't3', titulo: 'Tres', artista: 'Beto', ejes: [{ ejeId: 'chill' }] },
];
const ejes = [
  { id: 'rock', nombre: 'Rock' },
  { id: 'chill', nombre: 'Chill' },
  { id: 'favoritos', nombre: 'Favoritas', sistema: true },
];

test('inicioPeriodo: la semana empieza el lunes', () => {
  assert.equal(inicioPeriodo('semana', ahora), new Date(2026, 9, 12).getTime());
  assert.equal(inicioPeriodo('mes', ahora), new Date(2026, 9, 1).getTime());
  assert.equal(inicioPeriodo('anio', ahora), new Date(2026, 0, 1).getTime());
  assert.equal(inicioPeriodo('siempre', ahora), 0);
});

test('tiempo: usa la duración guardada, luego la de la biblioteca y luego la estimada', () => {
  const historial = [e('t1', dia(0), { duracionS: 100 }), e('t2', dia(0)), e('t3', dia(0))];
  const r = calcularEstadisticas({ historial, tracks, ejes, periodo: 'siempre', ahora, duracionDe: (id) => (id === 't2' ? 50 : null) });
  assert.equal(r.segundos, 100 + 50 + DURACION_ESTIMADA_S);
  assert.equal(r.reproducciones, 3);
  assert.equal(r.cancionesDistintas, 3);
});

test('periodos: semana, mes y total; el filtro del periodo seleccionado', () => {
  const historial = [
    e('t1', dia(1), { duracionS: 60 }), // martes (semana)
    e('t1', dia(5), { duracionS: 60 }), // viernes anterior (mes, no semana)
    e('t1', dia(20), { duracionS: 60 }), // septiembre (no mes)
  ];
  const r = calcularEstadisticas({ historial, tracks, ejes, periodo: 'semana', ahora });
  assert.deepEqual(r.tiempos, { semana: 60, mes: 120, total: 180 });
  assert.equal(r.segundos, 60);
  assert.equal(calcularEstadisticas({ historial, tracks, ejes, periodo: 'mes', ahora }).segundos, 120);
  assert.equal(calcularEstadisticas({ historial, tracks, ejes, periodo: 'siempre', ahora }).segundos, 180);
});

test('tops: canciones, artistas y modos, ordenados', () => {
  const historial = [
    e('t1', dia(0), { duracionS: 100, ejeId: 'rock' }),
    e('t1', dia(0, 9), { duracionS: 100, ejeId: 'rock' }),
    e('t2', dia(0, 8), { duracionS: 100, ejeId: 'chill' }),
    e('t3', dia(0, 7), { duracionS: 100, ejeId: 'chill' }),
    { trackId: 'fuera', ts: dia(0, 6), titulo: 'Suelta', artista: 'Zoe', duracionS: 100 },
  ];
  const r = calcularEstadisticas({ historial, tracks, ejes, ahora });
  assert.deepEqual(r.topCanciones.map((c) => [c.trackId, c.n]), [['t1', 2], ['t2', 1], ['t3', 1], ['fuera', 1]]);
  assert.deepEqual(r.topArtistas.map((a) => [a.nombre, a.n]), [['Ana', 3], ['Beto', 1], ['Zoe', 1]]);
  assert.equal(r.topCanciones[3].titulo, 'Suelta');
  assert.deepEqual(r.topModos.map((m) => m.ejeId), ['rock', 'chill']);
});

test('reparto por modo: usa el modo de la reproducción o reparte entre los de la canción', () => {
  const historial = [
    e('t1', dia(0), { duracionS: 100, ejeId: 'rock' }),
    e('t2', dia(0, 9), { duracionS: 100 }), // sin modo guardado: mitad rock, mitad chill
    e('t3', dia(0, 8), { duracionS: 100, ejeId: 'borrado' }), // modo que ya no existe: cae en los de la canción
  ];
  const r = calcularEstadisticas({ historial, tracks, ejes, ahora });
  const por = Object.fromEntries(r.reparto.map((x) => [x.ejeId, x.segundos]));
  assert.deepEqual(por, { rock: 150, chill: 150 });
  assert.ok(Math.abs(r.reparto.reduce((s, x) => s + x.fraccion, 0) - 1) < 1e-9);
});

test('racha: actual (aunque hoy aún no hayas escuchado) y mejor', () => {
  const dias = (...ns) => ns.map((n) => e('t1', dia(n)));
  assert.deepEqual(rachaDias(dias(0, 1, 2, 5, 6), ahora), { actual: 3, mejor: 3 });
  assert.deepEqual(rachaDias(dias(1, 2, 3, 4, 8), ahora), { actual: 4, mejor: 4 }); // hoy sin escuchar, sigue viva
  assert.deepEqual(rachaDias(dias(2, 3, 4, 5, 6, 0 + 9), ahora), { actual: 0, mejor: 5 }); // se cortó ayer
  assert.deepEqual(rachaDias([], ahora), { actual: 0, mejor: 0 });
});

test('historial vacío: todo a cero', () => {
  const r = calcularEstadisticas({ historial: [], tracks, ejes, ahora });
  assert.equal(r.segundos, 0);
  assert.deepEqual(r.topCanciones, []);
  assert.deepEqual(r.reparto, []);
});

test('la misma canción con ids distintos cuenta junta: biblioteca, vista previa y otra subida', () => {
  const biblio = [{ id: 'lib1', titulo: 'Dance Alone', artista: 'Sia', ejes: [] }];
  const vista = (id, ts) => e(id, ts, { titulo: 'Dance Alone', artista: 'Sia' });
  const historial = [e('lib1', dia(0, 9)), vista('preview-v1', dia(0, 10)), vista('preview-v2', dia(0, 11)), vista('preview-v1', dia(0, 11.5))];
  const r = calcularEstadisticas({ historial, tracks: biblio, periodo: 'siempre', ahora });
  assert.equal(r.topCanciones.length, 1);
  assert.equal(r.topCanciones[0].n, 4);
  assert.equal(r.cancionesDistintas, 1);
  assert.equal(r.topCanciones[0].track?.id, 'lib1', 'gana la copia de la biblioteca');
});

test('la copia de la biblioteca gana aunque su entrada sea la última en llegar', () => {
  const biblio = [{ id: 'lib1', titulo: 'Dance Alone', artista: 'Sia', ejes: [] }];
  const historial = [e('preview-v1', dia(0, 9), { titulo: 'Dance Alone', artista: 'Sia' }), e('lib1', dia(0, 10))];
  const c = calcularEstadisticas({ historial, tracks: biblio, periodo: 'siempre', ahora }).topCanciones[0];
  assert.equal(c.n, 2);
  assert.equal(c.trackId, 'lib1');
  assert.equal(c.track?.id, 'lib1');
});

test('entradas sin título ni canción en la biblioteca siguen contando por su id', () => {
  const r = calcularEstadisticas({ historial: [e('x', dia(0)), e('x', dia(0)), e('y', dia(0))], periodo: 'siempre', ahora });
  assert.deepEqual(r.topCanciones.map((c) => [c.trackId, c.n]), [['x', 2], ['y', 1]]);
});
