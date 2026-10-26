import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPulsacionLarga } from './pulsacionFila.js';

function montar() {
  const timers = [];
  const disparos = [];
  const vibraciones = [];
  const pl = crearPulsacionLarga({
    alDisparar: () => disparos.push('menu'),
    programar: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    cancelar: (t) => (timers[t - 1] = null),
    vibrar: () => vibraciones.push(15),
  });
  const avanzar = () => {
    const t = timers.filter(Boolean).pop();
    timers.length = 0;
    t?.fn();
  };
  return { pl, disparos, vibraciones, timers, avanzar };
}

test('quieto medio segundo dispara el menú con vibración', () => {
  const { pl, disparos, vibraciones, timers, avanzar } = montar();
  pl.inicio(100, 100);
  assert.equal(timers.filter(Boolean)[0].ms, 500);
  avanzar();
  assert.deepEqual(disparos, ['menu']);
  assert.deepEqual(vibraciones, [15]);
  assert.equal(pl.fueDisparada(), true);
});

test('moverse más de 10 px antes del plazo cancela la pulsación', () => {
  const { pl, disparos, timers } = montar();
  pl.inicio(100, 100);
  pl.mover(100, 108); // 8 px: aún dentro de la tolerancia
  assert.equal(timers.filter(Boolean).length, 1);
  pl.mover(100, 115); // 15 px: se cancela
  assert.equal(timers.filter(Boolean).length, 0);
  assert.deepEqual(disparos, []);
  assert.equal(pl.fueDisparada(), false);
});

test('levantar el dedo antes del plazo no dispara (toque normal)', () => {
  const { pl, disparos, timers } = montar();
  pl.inicio(0, 0);
  pl.fin();
  assert.equal(timers.filter(Boolean).length, 0);
  assert.deepEqual(disparos, []);
  assert.equal(pl.fueDisparada(), false);
});

test('un nuevo inicio reinicia el estado de la pulsación anterior', () => {
  const { pl, avanzar } = montar();
  pl.inicio(0, 0);
  avanzar();
  assert.equal(pl.fueDisparada(), true);
  pl.inicio(0, 0);
  assert.equal(pl.fueDisparada(), false);
});
