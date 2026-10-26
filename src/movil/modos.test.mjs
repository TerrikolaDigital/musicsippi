// src/movil/modos.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hayModosSinMostrar, modoVisible, conVisibilidad, filtrarModos, ordenarModos, sinVacios } from './modos.js';

const ejes = [
  { id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', orden: 999 },
  { id: 'chill', nombre: 'Chill', tipo: 'gusto', orden: 2 },
  { id: 'gym', nombre: 'Gimnasio', tipo: 'funcional', orden: 1 },
  { id: 'rock-es', nombre: 'Rock español', tipo: 'playlist', orden: 3 },
  { id: 'vacio', nombre: 'Vacío', tipo: 'gusto', orden: 4 },
];
const conteos = new Map([['chill', 10], ['gym', 5], ['rock-es', 3], ['vacio', 0], ['sin-clasificar', 9]]);

test('todos: sin sistema ni vacíos, por orden', () => {
  assert.deepEqual(filtrarModos(ejes, 'todos', conteos).map((e) => e.id), ['gym', 'chill', 'rock-es']);
});
test('filtros por tipo', () => {
  assert.deepEqual(filtrarModos(ejes, 'gusto', conteos).map((e) => e.id), ['chill']);
  assert.deepEqual(filtrarModos(ejes, 'funcional', conteos).map((e) => e.id), ['gym']);
  assert.deepEqual(filtrarModos(ejes, 'listas', conteos).map((e) => e.id), ['rock-es']);
});

test('ordenarModos: alfabético sin distinguir tildes y por canciones de más a menos', () => {
  const lista = [
    { id: 'b', nombre: 'Bossa' },
    { id: 'a', nombre: 'Álbumes de ayer' },
    { id: 'c', nombre: 'Chill' },
  ];
  const cuentas = new Map([['a', 2], ['b', 9], ['c', 9]]);
  assert.deepEqual(ordenarModos(lista, 'alfabetico', cuentas).map((e) => e.id), ['a', 'b', 'c']);
  assert.deepEqual(ordenarModos(lista, 'canciones', cuentas).map((e) => e.id), ['b', 'c', 'a']);
  assert.equal(lista[0].id, 'b'); // no muta
});

test('sinVacios quita los de 0 canciones salvo los que se conservan', () => {
  const lista = [{ id: 'chill' }, { id: 'vacio' }, { id: 'nueva' }, { id: 'sin-dato' }];
  const cuentas = new Map([['chill', 3], ['vacio', 0], ['nueva', 0]]);
  assert.deepEqual(sinVacios(lista, cuentas).map((e) => e.id), ['chill']);
  assert.deepEqual(sinVacios(lista, cuentas, ['nueva']).map((e) => e.id), ['chill', 'nueva']);
});

import { modosParaUnir, preguntaUnir } from './modos.js';

test('modosParaUnir: otros modos y listas (no de sistema) ordenados A-Z con su recuento', () => {
  const ejes = [
    { id: 'z', nombre: 'Zen', tipo: 'gusto' },
    { id: 'a', nombre: 'Ánimo', tipo: 'funcional' },
    { id: 'yo', nombre: 'Yo', tipo: 'gusto' },
    { id: 'l', nombre: 'Lista', tipo: 'playlist' },
    { id: 'f', nombre: 'Favoritas', tipo: 'sistema' },
    { id: 'g', nombre: 'Sistema gusto', tipo: 'gusto', sistema: true },
  ];
  const r = modosParaUnir(ejes, new Map([['z', 3], ['a', 5]]), 'yo');
  assert.deepEqual(r.map((x) => [x.eje.id, x.n]), [['a', 5], ['l', 0], ['z', 3]]);
});

test('preguntaUnir menciona cantidad y nombres', () => {
  assert.equal(preguntaUnir(12, 'New Wave', 'Rock en español'), '¿Pasar las 12 canciones de “New Wave” a “Rock en español” y borrar “New Wave”?');
  assert.match(preguntaUnir(1, 'A', 'B'), /la canción/);
});

test('modoVisible y conVisibilidad: ocultar y mostrar de verdad', () => {
  const lista = [{ id: 'rock', nombre: 'Rock', tipo: 'gusto', activo: true }, { id: 'chill', nombre: 'Chill', tipo: 'gusto' }];
  assert.equal(modoVisible(lista[0]), true);
  assert.equal(modoVisible(lista[1]), true); // sin `activo`: visible
  const oculta = conVisibilidad(lista, 'rock', false);
  assert.equal(modoVisible(oculta[0]), false);
  assert.equal(filtrarModos(oculta, 'todos', new Map([['rock', 5], ['chill', 5]])).map((e) => e.id).join(), 'chill');
  const visible = conVisibilidad(oculta, 'rock', true);
  assert.equal(visible[0].activo, true);
  assert.equal(lista[0].activo, true); // no muta
});

test('familiaDe: usa `familia` si existe y, sin migrar, deduce por el tipo antiguo', async () => {
  const { familiaDe } = await import('./modos.js');
  assert.equal(familiaDe({ familia: 'estado', tipo: 'gusto' }), 'estado');
  assert.equal(familiaDe({ familia: 'fijo' }), 'fijo');
  assert.equal(familiaDe({ tipo: 'playlist' }), 'fijo');
  assert.equal(familiaDe({ tipo: 'gusto', autoRellenar: false }), 'fijo');
  assert.equal(familiaDe({ tipo: 'funcional' }), 'estado');
  assert.equal(familiaDe({ tipo: 'gusto' }), 'genero');
});

test('seccionesDeModos agrupa en Estados, Géneros y Listas, sin vacías ni sistema', async () => {
  const { seccionesDeModos } = await import('./modos.js');
  const ejes = [
    { id: 'tranquilo', nombre: 'Tranquilo', familia: 'estado', orden: 10 },
    { id: 'rock', nombre: 'Rock', familia: 'genero', orden: 30 },
    { id: 'pop', nombre: 'Pop', familia: 'genero', orden: 31 },
    { id: 'nilda', nombre: 'Nilda', familia: 'fijo', autoRellenar: false },
    { id: 'vacio', nombre: 'Vacío', familia: 'estado' },
    { id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', sistema: true },
  ];
  const conteos = new Map([['tranquilo', 4], ['rock', 9], ['pop', 3], ['nilda', 2], ['sin-clasificar', 7]]);
  const s = seccionesDeModos(ejes, conteos);
  assert.deepEqual(s.map((x) => x.titulo), ['Estados', 'Géneros', 'Listas']);
  assert.deepEqual(s[1].modos.map((m) => m.id), ['rock', 'pop']);
});

test('seRellenaSola: lo guardado manda; sin él, las listas no y el resto sí', async () => {
  const { seRellenaSola, conAutoRellenar } = await import('./modos.js');
  assert.equal(seRellenaSola({ tipo: 'gusto' }), true);
  assert.equal(seRellenaSola({ tipo: 'funcional' }), true);
  assert.equal(seRellenaSola({ tipo: 'playlist' }), false);
  assert.equal(seRellenaSola({ tipo: 'playlist', autoRellenar: true }), true);
  assert.equal(seRellenaSola({ tipo: 'gusto', familia: 'genero', autoRellenar: false }), false);
  const r = conAutoRellenar([{ id: 'a', tipo: 'gusto' }, { id: 'b' }], 'a', false);
  assert.deepEqual(r, [{ id: 'a', tipo: 'gusto', autoRellenar: false }, { id: 'b' }]);
});

import { camposDeMoodNuevo, seccionesDeModos, familiaDe, seRellenaSola } from './modos.js';

test('un mood creado a mano sale en su sección aunque esté vacío (si no, «crear» parece no hacer nada)', () => {
  const base = { orden: 1, activo: true, sistema: false };
  const fijo = { id: 'mi-lista', nombre: 'Mi lista', ...base, ...camposDeMoodNuevo('fijo') };
  const gen = { id: 'jazz', nombre: 'Jazz', ...base, ...camposDeMoodNuevo('genero') };
  const est = { id: 'cocinar', nombre: 'Cocinar', ...base, ...camposDeMoodNuevo('estado') };
  const viejo = { id: 'vacio', nombre: 'Vacío', ...base, tipo: 'gusto' };
  const secciones = seccionesDeModos([fijo, gen, est, viejo], new Map());
  assert.deepEqual(secciones.map((s) => [s.id, s.modos.map((m) => m.id)]), [['estado', ['cocinar']], ['genero', ['jazz']], ['fijo', ['mi-lista']]]);
});

test('camposDeMoodNuevo: fijo no se rellena solo; estado y género sí; cualquier otro valor cae en fijo', () => {
  assert.deepEqual(camposDeMoodNuevo('fijo'), { familia: 'fijo', autoRellenar: false, creadoPorUsuario: true, tipo: 'playlist' });
  assert.equal(camposDeMoodNuevo('estado').tipo, 'funcional');
  assert.equal(camposDeMoodNuevo('genero').autoRellenar, true);
  assert.equal(camposDeMoodNuevo('raro').familia, 'fijo');
  assert.equal(familiaDe(camposDeMoodNuevo('estado')), 'estado');
  assert.equal(seRellenaSola(camposDeMoodNuevo('fijo')), false);
});

test('hayModosSinMostrar: ignora los de sistema', () => {
  assert.equal(hayModosSinMostrar([]), false);
  assert.equal(hayModosSinMostrar([{ id: 's', tipo: 'sistema' }, { id: 'p', sistema: true }]), false);
  assert.equal(hayModosSinMostrar([{ id: 'chill', tipo: 'gusto', activo: false }]), true);
  assert.equal(hayModosSinMostrar(ejes), true);
});
