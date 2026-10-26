import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSeguimientoUso } from './seguimiento-uso.js';

function crear() {
  const cierres = [];
  return { cierres, s: crearSeguimientoUso({ alCerrar: (...a) => cierres.push(a) }) };
}
const reproducir = (s, desde, hasta, duracion) => {
  for (let t = desde; t <= hasta; t += 1) s.tiempo(t, duracion);
};

test('escuchada casi entera: fracción alta al pasar a la siguiente', () => {
  const { s, cierres } = crear();
  s.cambio('a', 'feliz');
  reproducir(s, 0, 190, 200);
  s.cambio('b', 'feliz');
  assert.equal(cierres.length, 1);
  assert.deepEqual(cierres[0].slice(0, 2), ['a', 'feliz']);
  assert.ok(cierres[0][2] > 0.9 && cierres[0][2] <= 1);
});

test('saltada pronto: fracción baja; el tiempo viejo de la anterior no cuenta para la nueva', () => {
  const { s, cierres } = crear();
  s.cambio('a', 'tranquilo');
  reproducir(s, 0, 10, 200);
  s.cambio('b', 'tranquilo'); // cierra a (5 %)
  s.tiempo(10, 200); // reloj aún de la anterior
  reproducir(s, 0, 150, 200); // empieza b: 0 -> 150
  s.cambio('c', 'tranquilo');
  assert.equal(cierres.length, 2);
  assert.ok(cierres[0][2] < 0.1);
  assert.ok(Math.abs(cierres[1][2] - 0.75) < 0.01);
});

test('arrastrar la barra no cuenta como escucha', () => {
  const { s, cierres } = crear();
  s.cambio('a', 'feliz');
  reproducir(s, 0, 5, 200);
  s.tiempo(180, 200); // salto adelante
  s.tiempo(181, 200);
  s.cambio(null, null);
  assert.ok(cierres[0][2] < 0.1);
});

test('sin chip no se sigue nada; sin tiempo no hay cierre', () => {
  const { s, cierres } = crear();
  s.cambio('a', null);
  reproducir(s, 0, 100, 200);
  s.cambio('b', 'feliz');
  s.cambio('c', 'feliz'); // b nunca avanzó: no hay duración
  s.cambio(null, null);
  assert.equal(cierres.length, 0);
});
