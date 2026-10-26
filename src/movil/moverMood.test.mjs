import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarDestinos, deshacerMover, destinosDeMover, planMover } from './moverMood.js';

const ejes = [
  { id: 'favoritos', nombre: 'Favoritas', tipo: 'gusto', sistema: true },
  { id: 'rock', nombre: 'Rock', tipo: 'gusto', familia: 'genero' },
  { id: 'pop', nombre: 'Pop', tipo: 'gusto', familia: 'genero' },
  { id: 'tranquilo', nombre: 'Tranquilo', tipo: 'funcional', familia: 'estado' },
  { id: 'feliz', nombre: 'Feliz', tipo: 'funcional', familia: 'estado' },
  { id: 'oculto', nombre: 'Oculto', tipo: 'gusto', familia: 'genero', activo: false },
  { id: 'lista', nombre: 'Mi lista', tipo: 'playlist' },
];
const ej = (...ids) => ids.map((ejeId) => ({ ejeId }));

test('destinos: solo moods activos de gusto/funcional, sin sistema ni listas', () => {
  assert.deepEqual(destinosDeMover(ejes).map((e) => e.id), ['rock', 'pop', 'tranquilo', 'feliz']);
});

test('mover un género quita el género actual y deja los estados', () => {
  const p = planMover(ej('rock', 'tranquilo', 'lista'), ejes[2], ejes);
  assert.deepEqual(p, { poner: 'pop', quitar: ['rock'] });
});

test('mover a un estado en el que no hay ninguno de esa familia solo añade', () => {
  assert.deepEqual(planMover(ej('rock'), ejes[4], ejes), { poner: 'feliz', quitar: [] });
});

test('mover a un mood en el que ya está no se quita a sí mismo', () => {
  assert.deepEqual(planMover(ej('rock', 'pop'), ejes[2], ejes), { poner: 'pop', quitar: ['rock'] });
});

test('deshacer invierte el movimiento', () => {
  assert.deepEqual(deshacerMover({ poner: ['pop'], quitar: ['rock'] }), { poner: ['rock'], quitar: ['pop'] });
});

test('buscador: sin tildes ni mayúsculas y orden A–Z', () => {
  const lista = [{ id: 'a', nombre: 'Melancólico' }, { id: 'b', nombre: 'Rock' }, { id: 'c', nombre: 'Electrónica' }];
  assert.deepEqual(buscarDestinos(lista, 'melanco').map((e) => e.id), ['a']);
  assert.deepEqual(buscarDestinos(lista, 'ELECTRONICA').map((e) => e.id), ['c']);
  assert.deepEqual(buscarDestinos(lista, '').map((e) => e.id), ['c', 'a', 'b']);
});
