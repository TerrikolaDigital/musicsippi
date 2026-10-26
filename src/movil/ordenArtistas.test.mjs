// src/movil/ordenArtistas.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarArtistas, leerOrdenArtistas, guardarOrdenArtistas } from './ordenArtistas.js';

const artistas = [
  { nombre: 'Zazà', cantidad: 2 },
  { nombre: 'álvaro', cantidad: 5 },
  { nombre: 'Bruno', cantidad: 5 },
  { nombre: 'alba', cantidad: 9 },
  { nombre: 'Carlos', cantidad: 1 },
];

test('ordenarArtistas az: sin distinguir tildes ni mayúsculas', () => {
  assert.deepEqual(
    ordenarArtistas(artistas, 'az').map((a) => a.nombre),
    ['alba', 'álvaro', 'Bruno', 'Carlos', 'Zazà'],
  );
});

test('ordenarArtistas canciones: más canciones primero y, en empate, por nombre', () => {
  assert.deepEqual(
    ordenarArtistas(artistas, 'canciones').map((a) => a.nombre),
    ['alba', 'álvaro', 'Bruno', 'Zazà', 'Carlos'],
  );
});

test('ordenarArtistas no modifica la lista original', () => {
  const copia = [...artistas];
  ordenarArtistas(artistas, 'az');
  assert.deepEqual(artistas, copia);
});

test('leerOrdenArtistas: por defecto «canciones» si no hay nada guardado o el valor no vale', () => {
  const vacio = { getItem: () => null };
  assert.equal(leerOrdenArtistas(vacio), 'canciones');
  assert.equal(leerOrdenArtistas({ getItem: () => 'otro' }), 'canciones');
  assert.equal(leerOrdenArtistas(undefined), 'canciones');
});

test('leerOrdenArtistas y guardarOrdenArtistas: recuerdan la elección', () => {
  const datos = new Map();
  const almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)) };
  guardarOrdenArtistas('az', almacen);
  assert.equal(leerOrdenArtistas(almacen), 'az');
});

test('guardarOrdenArtistas y leerOrdenArtistas no lanzan si el almacén falla', () => {
  const roto = {
    getItem: () => {
      throw new Error('bloqueado');
    },
    setItem: () => {
      throw new Error('cuota');
    },
  };
  assert.doesNotThrow(() => guardarOrdenArtistas('az', roto));
  assert.equal(leerOrdenArtistas(roto), 'canciones');
});
