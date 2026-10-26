import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorTarjeta, saludo, duracionLarga, duracionTotalTexto, contrasteConBlanco, haceCuanto, textoEstadoResolucion, textoTemporizador } from './formato.js';

test('las tarjetas de modo tienen contraste AA con texto blanco', () => {
  for (const id of ['chill', 'rock', 'dance-pop', 'lofi', 'tango', 'gimnasio']) {
    assert.ok(contrasteConBlanco(colorTarjeta({ id })) >= 4.5, id);
  }
  assert.ok(contrasteConBlanco(colorTarjeta({ id: 'x', color: '#ffe680' })) >= 4.5);
});

test('saludo según la hora', () => {
  assert.equal(saludo(new Date(2026, 0, 1, 8)), 'Buenos días');
  assert.equal(saludo(new Date(2026, 0, 1, 15)), 'Buenas tardes');
  assert.equal(saludo(new Date(2026, 0, 1, 23)), 'Buenas noches');
});

test('duración larga', () => {
  assert.equal(duracionLarga(29 * 60000), '29 min');
  assert.equal(duracionLarga((7 * 60 + 31) * 60000), '7 h 31 min');
  assert.equal(duracionLarga(0), '0 min');
});

test('haceCuanto en lenguaje corriente', () => {
  const ahora = new Date('2026-10-14T12:00:00Z');
  const hace = (min) => new Date(ahora.getTime() - min * 60000).toISOString();
  assert.equal(haceCuanto(null, ahora), 'Nunca');
  assert.equal(haceCuanto('basura', ahora), 'Nunca');
  assert.equal(haceCuanto(hace(0), ahora), 'Ahora mismo');
  assert.equal(haceCuanto(hace(5), ahora), 'Hace 5 min');
  assert.equal(haceCuanto(hace(120), ahora), 'Hace 2 h');
  assert.equal(haceCuanto(hace(60 * 24), ahora), 'Hace 1 día');
  assert.equal(haceCuanto(hace(60 * 24 * 3), ahora), 'Hace 3 días');
});

test('duración total: exacta si se conocen todas; si faltan, estimada y marcada «(calculando)»', () => {
  const min = 60000;
  assert.equal(duracionTotalTexto([]), '');
  assert.equal(duracionTotalTexto([3 * min, 4 * min]), '7 min');
  assert.equal(duracionTotalTexto([3 * min, 3 * min, 0, 0]), '~12 min (calculando)');
  // Caso real: 508 canciones con pocas duraciones conocidas no puede decir «29 min».
  assert.equal(duracionTotalTexto([3 * min, ...new Array(507).fill(0)]), '~25 h 24 min (calculando)');
  // Sin ninguna conocida: 3,5 min por canción.
  assert.equal(duracionTotalTexto([0, undefined, 0, 0]), '~14 min (calculando)');
});

test('textos de fallo de reproducción', () => {
  assert.equal(textoEstadoResolucion(null), null);
  assert.equal(textoEstadoResolucion('ok'), null);
  assert.equal(textoEstadoResolucion('buscando'), 'Buscando en YouTube…');
  assert.equal(textoEstadoResolucion('error_red'), 'Sin conexión para buscar en YouTube.');
  assert.match(textoEstadoResolucion('sin_api_key'), /Configuración/);
  assert.match(textoEstadoResolucion('sin_api_key', false), /YOUTUBE_API_KEY/);
  assert.match(textoEstadoResolucion('cuota_agotada'), /cuota diaria/);
});

test('cuenta atrás del temporizador', () => {
  const ahora = 1_000_000;
  assert.equal(textoTemporizador(null), null);
  assert.equal(textoTemporizador({ alFinal: true }), 'Al final de la canción');
  assert.equal(textoTemporizador({ alFinal: true }, ahora, true), 'fin');
  assert.equal(textoTemporizador({ finMs: ahora + 23 * 60_000 - 5000 }, ahora), '23 min');
  assert.equal(textoTemporizador({ finMs: ahora + 10_000 }, ahora, true), '1′');
  assert.equal(textoTemporizador({ finMs: ahora - 5000 }, ahora), '1 min');
});
