// src/movil/verTodo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinoVerTodo, irVerTodo } from './verTodo.js';
import { tomarPestanaBiblioteca } from './biblioteca.js';

test('cada sección de Inicio lleva a su sitio', () => {
  assert.deepEqual(destinoVerTodo('seguidos'), { tipo: 'pestana', pestana: 'modos' });
  assert.equal(destinoVerTodo('artistas').biblioteca, 'artistas');
  assert.deepEqual(destinoVerTodo('recientes'), { tipo: 'pantalla', pantalla: { tipo: 'historial' } });
  assert.equal(destinoVerTodo('inventada'), null);
});

test('irVerTodo: artistas abre Biblioteca en Artistas; favoritas, con el filtro ♥', () => {
  const llamadas = [];
  const nav = { irAPestana: (p) => llamadas.push(['pestana', p]), abrir: (p) => llamadas.push(['abrir', p.tipo]) };
  irVerTodo(nav, 'artistas');
  assert.deepEqual(tomarPestanaBiblioteca(), { pestana: 'artistas', favoritas: false });
  irVerTodo(nav, 'favoritas');
  assert.deepEqual(tomarPestanaBiblioteca(), { pestana: 'canciones', favoritas: true });
  irVerTodo(nav, 'recientes');
  assert.deepEqual(llamadas, [['pestana', 'biblioteca'], ['pestana', 'biblioteca'], ['abrir', 'historial']]);
});
