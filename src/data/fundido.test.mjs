import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarFundido, leerFundido, guardarFundido, leerSinFundidoAlbumes, guardarSinFundidoAlbumes,
  encadenadaConAnterior,
} from './fundido.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test('fundido: 6 s por defecto, un valor elegido (incluido 0) se respeta y se limita a 0..12 s', () => {
  const a = memoria();
  assert.equal(leerFundido(a), 6);
  guardarFundido(0, a);
  assert.equal(leerFundido(a), 0);
  guardarFundido(9, a);
  assert.equal(leerFundido(a), 9);
  guardarFundido(99, a);
  assert.equal(leerFundido(a), 12);
  guardarFundido(-3, a);
  assert.equal(leerFundido(a), 0);
  assert.equal(normalizarFundido('abc'), 6);
  assert.equal(normalizarFundido(4.6), 5);
  assert.equal(leerFundido({ getItem() { throw new Error('x'); } }), 6);
});

test('sin fundido en álbumes: activado por defecto y persistido', () => {
  const a = memoria();
  assert.equal(leerSinFundidoAlbumes(a), true);
  guardarSinFundidoAlbumes(false, a);
  assert.equal(leerSinFundidoAlbumes(a), false);
});

test('encadenada: mismo álbum y artista en orden secuencial', () => {
  const a = { album: 'Live', artista: 'X' };
  const b = { album: 'live ', artista: 'x' };
  assert.equal(encadenadaConAnterior(a, b), true);
  assert.equal(encadenadaConAnterior(a, b, { aleatorio: true }), false);
  assert.equal(encadenadaConAnterior(a, { album: 'Otro', artista: 'X' }), false);
  assert.equal(encadenadaConAnterior(a, { album: 'Live', artista: 'Y' }), false);
  assert.equal(encadenadaConAnterior({ artista: 'X' }, { artista: 'X' }), false); // sin álbum
  assert.equal(encadenadaConAnterior(null, b), false);
});
