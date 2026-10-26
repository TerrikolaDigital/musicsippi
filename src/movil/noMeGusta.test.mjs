import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agregarMarca,
  coincideEntrada,
  entradaArtista,
  entradaCancion,
  esNoMeGusta,
  filtrarNoMeGusta,
  quitarMarca,
} from './noMeGusta.js';

const t = (id, artista, titulo) => ({ id, artista, titulo });
const lista = [t('1', 'Ana', 'Sol'), t('2', 'Beto', 'Luna'), t('3', 'Ana, Cris', 'Mar'), t('4', 'Dani', 'Sol')];

test('sin marcas devuelve la misma lista', () => {
  assert.equal(filtrarNoMeGusta(lista, []), lista);
  assert.equal(filtrarNoMeGusta(lista, undefined), lista);
});

test('una canción marcada se quita por artista y título, sin mirar el id ni las tildes', () => {
  const marcas = [entradaCancion({ artista: 'ÁNA', titulo: 'sol (en vivo)' })];
  assert.deepEqual(filtrarNoMeGusta(lista, marcas).map((x) => x.id), ['2', '3', '4']);
});

test('un artista marcado quita todas sus canciones, también las colaboraciones', () => {
  const marcas = [entradaArtista('Ana')];
  assert.deepEqual(filtrarNoMeGusta(lista, marcas).map((x) => x.id), ['2', '4']);
});

test('filtra también artistas sueltos ({ nombre }) y álbumes', () => {
  const marcas = [entradaArtista('Beto')];
  assert.deepEqual(filtrarNoMeGusta([{ nombre: 'Beto' }, { nombre: 'Eva' }], marcas), [{ nombre: 'Eva' }]);
  assert.equal(esNoMeGusta({ artista: 'Beto', titulo: 'Disco' }, marcas), true);
});

test('una marca de canción no afecta a otras del mismo artista', () => {
  const marcas = [entradaCancion(lista[0])];
  assert.equal(esNoMeGusta(lista[2], marcas), false);
  assert.equal(esNoMeGusta(lista[0], marcas), true);
});

test('agregarMarca no duplica y quitarMarca la retira', () => {
  let marcas = agregarMarca([], entradaArtista('Ana'), 10);
  marcas = agregarMarca(marcas, entradaArtista('ana'), 20);
  assert.equal(marcas.length, 1);
  assert.equal(marcas[0].fecha, 10);
  assert.deepEqual(Object.keys(marcas[0]).sort(), ['clave', 'etiqueta', 'fecha', 'tipo']);
  assert.deepEqual(quitarMarca(marcas, 'artista', marcas[0].clave), []);
});

test('coincideEntrada: la canción que suena coincide con su marca o con la de su artista', () => {
  assert.equal(coincideEntrada(lista[0], entradaCancion(lista[0])), true);
  assert.equal(coincideEntrada(lista[0], entradaArtista('Ana')), true);
  assert.equal(coincideEntrada(lista[1], entradaArtista('Ana')), false);
  assert.equal(coincideEntrada(null, entradaArtista('Ana')), false);
});

test('si las marcas no son una lista (dato erróneo) no filtra ni lanza', () => {
  assert.equal(filtrarNoMeGusta(lista, () => {}), lista);
  assert.equal(esNoMeGusta(lista[0], () => {}), false);
});
