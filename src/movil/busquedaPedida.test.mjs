// src/movil/busquedaPedida.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pedirBusquedaEnBiblioteca, tomarBusquedaPedida, irABuscarEnBiblioteca } from './busquedaPedida.js';

test('tomarBusquedaPedida: sin petición devuelve null', () => {
  assert.equal(tomarBusquedaPedida(), null);
});

test('tomarBusquedaPedida: la petición se consume una sola vez', () => {
  pedirBusquedaEnBiblioteca();
  assert.deepEqual(tomarBusquedaPedida(), { filtro: 'biblioteca' });
  assert.equal(tomarBusquedaPedida(), null);
});

test('irABuscarEnBiblioteca: deja la petición y navega a Buscar', () => {
  const llamadas = [];
  irABuscarEnBiblioteca({ irAPestana: (p) => llamadas.push(p) });
  assert.deepEqual(llamadas, ['buscar']);
  assert.deepEqual(tomarBusquedaPedida(), { filtro: 'biblioteca' });
});
