// src/movil/avisos.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoInfinito, avisoFavoritas, avisoModo, avisoRadio, pluralCanciones, textoProgreso, textoResumen, esSegundoPlano } from './avisos.js';

test('pluralCanciones', () => {
  assert.equal(pluralCanciones(1), '1 canción');
  assert.equal(pluralCanciones(0), '0 canciones');
  assert.equal(pluralCanciones(42), '42 canciones');
});

test('Infinito: con canciones avisa de la mezcla; vacío avisa el motivo', () => {
  assert.equal(avisoInfinito(120), 'Infinito: mezclando toda tu biblioteca');
  assert.match(avisoInfinito(0), /biblioteca está vacía/);
});

test('Favoritas: aleatorio con el número; sin favoritas explica cómo tenerlas', () => {
  assert.equal(avisoFavoritas(7), 'Favoritas en aleatorio · 7 canciones');
  assert.equal(avisoFavoritas(1), 'Favoritas en aleatorio · 1 canción');
  assert.match(avisoFavoritas(0), /Aún no tienes favoritas/);
});

test('Modo: nombre, orden y recuento; vacío avisa el motivo', () => {
  assert.equal(avisoModo('Chill', 10, true), 'Chill en aleatorio · 10 canciones');
  assert.equal(avisoModo('Chill', 10, false), 'Chill · 10 canciones');
  assert.match(avisoModo('Chill', 0, true), /«Chill» no tiene canciones/);
});

test('Radio', () => {
  assert.equal(avisoRadio('Song'), 'Radio de «Song»');
  assert.equal(avisoRadio('Song', true), 'Creando radio de «Song»…');
});

test('textoProgreso: fases con contador, descarga y espera de WiFi', () => {
  assert.equal(textoProgreso({ fase: 'inactivo' }), null);
  assert.equal(textoProgreso({ fase: 'listo', modosNuevos: [], colocadas: 0 }), null);
  assert.deepEqual(textoProgreso({ fase: 'generos', hechas: 23, total: 58 }), {
    texto: 'Organizando tu música… 23/58',
    detalle: 'Buscando géneros',
    porcentaje: 40,
  });
  assert.deepEqual(textoProgreso({ fase: 'modos', hechas: 0, total: 0 }), { texto: 'Organizando tu música…', detalle: 'Creando moods', porcentaje: null });
  assert.deepEqual(textoProgreso({ fase: 'preparando', descarga: 37 }), {
    texto: 'Preparando el organizador',
    detalle: 'Descargando el modelo: 37 %',
    porcentaje: 37,
  });
  assert.match(textoProgreso({ fase: 'preparando' }).detalle, /160 MB/);
  assert.match(textoProgreso({ fase: 'esperando-wifi' }).texto, /WiFi/);
  assert.equal(textoProgreso({ fase: 'error', mensaje: 'Algo' }).texto, 'Algo');
});

test('textoResumen concuerda en número', () => {
  assert.equal(textoResumen({ modosNuevos: [{}, {}, {}], colocadas: 66 }), 'Hemos colocado 66 canciones en tus moods');
  assert.equal(textoResumen({ modosNuevos: [{}], colocadas: 1 }), 'Hemos colocado 1 canción en tus moods');
  assert.equal(textoResumen({ modosNuevos: [], colocadas: 0 }), null);
});

test('esSegundoPlano: la pasada automática no pinta barra; la del usuario sí', () => {
  assert.equal(esSegundoPlano({ fase: 'vectores', hechas: 80, total: 300 }, false), true);
  assert.equal(esSegundoPlano({ fase: 'generos', hechas: 1, total: 3 }, true), false);
  assert.equal(esSegundoPlano({ fase: 'inactivo' }, false), false);
});
