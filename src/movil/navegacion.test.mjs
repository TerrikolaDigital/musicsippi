import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clavePantalla, deltaHistorial, entradasSobrantes, estadoInicial, navegar, pantallaActual, profundidad } from './navegacion.js';

test('arranca en Inicio sin pantallas ni capas', () => {
  const e = estadoInicial();
  assert.deepEqual(pantallaActual(e), { tipo: 'raiz', pestana: 'inicio' });
  assert.equal(profundidad(e), 0);
});

test('abrir apila en la pestaña activa y atrás desapila', () => {
  let e = navegar(estadoInicial(), { tipo: 'pestana', pestana: 'modos' });
  e = navegar(e, { tipo: 'abrir', pantalla: { tipo: 'modo', ejeId: 'chill' } });
  assert.deepEqual(pantallaActual(e), { tipo: 'modo', ejeId: 'chill' });
  e = navegar(e, { tipo: 'atras' });
  assert.deepEqual(pantallaActual(e), { tipo: 'raiz', pestana: 'modos' });
});

test('atrás cierra primero las capas, luego las pantallas, en orden', () => {
  let e = navegar(estadoInicial(), { tipo: 'pestana', pestana: 'modos' });
  e = navegar(e, { tipo: 'abrir', pantalla: { tipo: 'modo', ejeId: 'chill' } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'reproductor', vista: 'portada' } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'hoja', trackId: 't1' } });
  assert.equal(profundidad(e), 3);
  e = navegar(e, { tipo: 'atras' });
  assert.deepEqual(e.capas, [{ tipo: 'reproductor', vista: 'portada' }]);
  e = navegar(e, { tipo: 'atras' });
  assert.deepEqual(e.capas, []);
  e = navegar(e, { tipo: 'atras' });
  assert.deepEqual(pantallaActual(e), { tipo: 'raiz', pestana: 'modos' });
});

test('atrás en la raíz de otra pestaña vuelve a Inicio; en Inicio no cambia', () => {
  let e = navegar(estadoInicial(), { tipo: 'pestana', pestana: 'buscar' });
  e = navegar(e, { tipo: 'atras' });
  assert.equal(e.pestana, 'inicio');
  const e2 = navegar(e, { tipo: 'atras' });
  assert.equal(e2, e);
});

test('cambiar de pestaña cierra las capas pero cada pestaña recuerda su pantalla', () => {
  let e = navegar(estadoInicial(), { tipo: 'pestana', pestana: 'modos' });
  e = navegar(e, { tipo: 'abrir', pantalla: { tipo: 'modo', ejeId: 'rock' } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'hoja', trackId: 't1' } });
  e = navegar(e, { tipo: 'pestana', pestana: 'inicio' });
  assert.deepEqual(e.capas, []);
  e = navegar(e, { tipo: 'pestana', pestana: 'modos' });
  assert.deepEqual(pantallaActual(e), { tipo: 'modo', ejeId: 'rock' });
});

test('el historial queda coherente: se retrocede lo que se deja de ver y se repone al volver', () => {
  // Inicio -> Moods (+1 marca) -> detalle (+1) -> hoja (+1): 3 entradas.
  let e = navegar(estadoInicial(), { tipo: 'pestana', pestana: 'modos' });
  assert.equal(deltaHistorial(estadoInicial(), { tipo: 'pestana', pestana: 'modos' }), 1);
  e = navegar(e, { tipo: 'abrir', pantalla: { tipo: 'modo', ejeId: 'rock' } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'hoja', trackId: 't1' } });
  // A Buscar (vacía): se dejan de ver detalle y hoja (2 entradas); queda la marca.
  assert.equal(deltaHistorial(e, { tipo: 'pestana', pestana: 'buscar' }), -2);
  // A Inicio: además se retira la marca.
  assert.equal(deltaHistorial(e, { tipo: 'pestana', pestana: 'inicio' }), -3);
  // Tocar la pestaña activa: vuelve a su raíz descartando 2.
  assert.equal(deltaHistorial(e, { tipo: 'pestana', pestana: 'modos' }), -2);
  // Volver a Moods desde Buscar repone la entrada del detalle recordado.
  const enBuscar = navegar(e, { tipo: 'pestana', pestana: 'buscar' });
  assert.equal(deltaHistorial(enBuscar, { tipo: 'pestana', pestana: 'modos' }), 1);
  // Sin nada abierto, de una pestaña a otra no cambia el historial.
  const limpio = navegar(navegar(estadoInicial(), { tipo: 'pestana', pestana: 'modos' }), { tipo: 'pestana', pestana: 'buscar' });
  assert.equal(deltaHistorial(limpio, { tipo: 'pestana', pestana: 'modos' }), 0);
  assert.equal(deltaHistorial(limpio, { tipo: 'abrir' }), 0);
});

test('con el historial simulado, «atrás» nunca consume entradas muertas al ir y volver entre pestañas', () => {
  let e = estadoInicial();
  let entradas = 0;
  const ir = (accion) => {
    entradas += deltaHistorial(e, accion);
    e = navegar(e, accion);
  };
  ir({ tipo: 'pestana', pestana: 'modos' });
  entradas += 1; // abrir el detalle empuja una entrada
  e = navegar(e, { tipo: 'abrir', pantalla: { tipo: 'modo', ejeId: 'rock' } });
  ir({ tipo: 'pestana', pestana: 'buscar' });
  assert.equal(entradas, 1);
  ir({ tipo: 'pestana', pestana: 'modos' });
  assert.deepEqual(pantallaActual(e), { tipo: 'modo', ejeId: 'rock' });
  assert.equal(entradas, 2);
  // Un «atrás» cierra el detalle, otro vuelve a Inicio, y el historial queda en 0.
  for (let i = 0; i < 2; i++) {
    entradas -= 1;
    e = navegar(e, { tipo: 'atras' });
  }
  assert.equal(e.pestana, 'inicio');
  assert.equal(entradas, 0);
});

test('tocar la pestaña activa vuelve a su raíz', () => {
  let e = navegar(estadoInicial(), { tipo: 'pestana', pestana: 'modos' });
  e = navegar(e, { tipo: 'abrir', pantalla: { tipo: 'modo', ejeId: 'rock' } });
  e = navegar(e, { tipo: 'pestana', pestana: 'modos' });
  assert.deepEqual(pantallaActual(e), { tipo: 'raiz', pestana: 'modos' });
});

test('abrir el reproductor dos veces no apila dos capas', () => {
  let e = navegar(estadoInicial(), { tipo: 'capa', capa: { tipo: 'reproductor', vista: 'portada' } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'reproductor', vista: 'letra' } });
  assert.deepEqual(e.capas, [{ tipo: 'reproductor', vista: 'letra' }]);
});

test('cambiar la vista del reproductor lo deja en su sitio, debajo de la hoja', () => {
  let e = navegar(estadoInicial(), { tipo: 'capa', capa: { tipo: 'reproductor', vista: 'portada' } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'hoja', trackId: 't1' } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'reproductor', vista: 'letra' } });
  assert.deepEqual(e.capas, [{ tipo: 'reproductor', vista: 'letra' }, { tipo: 'hoja', trackId: 't1' }]);
});

test('sustituir cambia la capa más alta sin añadir profundidad', () => {
  let e = navegar(estadoInicial(), { tipo: 'capa', capa: { tipo: 'hoja', trackId: 't1' } });
  e = navegar(e, { tipo: 'sustituir', capa: { tipo: 'reproductor', vista: 'letra' } });
  assert.deepEqual(e.capas, [{ tipo: 'reproductor', vista: 'letra' }]);
  assert.equal(profundidad(e), 1);
});

test('abrir una pantalla con reproductor y hoja encima cierra ambas y deja una entrada sobrante', () => {
  let e = navegar(estadoInicial(), { tipo: 'capa', capa: { tipo: 'reproductor', vista: 'portada' } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'hoja', trackId: 't1' } });
  assert.equal(entradasSobrantes(e), 1);
  e = navegar(e, { tipo: 'abrir', pantalla: { tipo: 'artista', nombre: 'X' } });
  assert.deepEqual(e.capas, []);
  assert.deepEqual(pantallaActual(e), { tipo: 'artista', nombre: 'X' });
  assert.equal(entradasSobrantes(e), 0);
});

test('sin capas o con una sola no sobra ninguna entrada', () => {
  assert.equal(entradasSobrantes(estadoInicial()), 0);
  const e = navegar(estadoInicial(), { tipo: 'capa', capa: { tipo: 'hoja', trackId: 't1' } });
  assert.equal(entradasSobrantes(e), 0);
});

test('clavePantalla cambia al entrar en una pantalla y no con las capas', () => {
  const base = estadoInicial();
  const modo = navegar(base, { tipo: 'abrir', pantalla: { tipo: 'modo', ejeId: 'chill' } });
  const otro = navegar(navegar(modo, { tipo: 'atras' }), { tipo: 'abrir', pantalla: { tipo: 'modo', ejeId: 'gym' } });
  assert.notEqual(clavePantalla(base), clavePantalla(modo));
  assert.notEqual(clavePantalla(modo), clavePantalla(otro));
  assert.equal(clavePantalla(modo), clavePantalla(navegar(modo, { tipo: 'capa', capa: { tipo: 'reproductor' } })));
  assert.notEqual(clavePantalla(base), clavePantalla(navegar(base, { tipo: 'pestana', pestana: 'modos' })));
});

test('«atrás» en la bienvenida retrocede una pantalla y la cierra desde la primera', () => {
  let e = navegar(estadoInicial(), { tipo: 'capa', capa: { tipo: 'bienvenida', paso: 1 } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'bienvenida', paso: 3 } });
  assert.equal(e.capas.length, 1);
  e = navegar(e, { tipo: 'atras' });
  assert.deepEqual(e.capas, [{ tipo: 'bienvenida', paso: 2 }]);
  e = navegar(navegar(e, { tipo: 'atras' }), { tipo: 'atras' });
  assert.deepEqual(e.capas, []);
});

test('quitar-capa cierra la bienvenida sin tocar otras capas', () => {
  let e = navegar(estadoInicial(), { tipo: 'capa', capa: { tipo: 'bienvenida', paso: 5 } });
  e = navegar(e, { tipo: 'capa', capa: { tipo: 'hoja', config: 'anadir' } });
  e = navegar(e, { tipo: 'quitar-capa', capaTipo: 'bienvenida' });
  assert.deepEqual(e.capas, [{ tipo: 'hoja', config: 'anadir' }]);
});

test('volver a una pestaña la abre donde se quedó; tocarla estando en ella, en su raíz', () => {
  let e = navegar(estadoInicial(), { tipo: 'pestana', pestana: 'biblioteca' });
  e = navegar(e, { tipo: 'abrir', pantalla: { tipo: 'estadisticas' } });
  e = navegar(e, { tipo: 'pestana', pestana: 'inicio' });
  e = navegar(e, { tipo: 'pestana', pestana: 'biblioteca' });
  assert.equal(pantallaActual(e).tipo, 'estadisticas');
  assert.equal(profundidad(navegar(e, { tipo: 'pestana', pestana: 'biblioteca' })), 0);
});
