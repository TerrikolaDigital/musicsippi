// src/movil/portadaGenerada.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portadaGenerada, aRgbDeHex, textoPortada, tinteLegible } from './portadaGenerada.js';

test('portadaGenerada: mismo texto, mismo resultado', () => {
  assert.deepEqual(portadaGenerada('Nevermind'), portadaGenerada('Nevermind'));
});

test('portadaGenerada: ignora mayúsculas, acentos y espacios sobrantes al elegir color', () => {
  assert.equal(portadaGenerada('  Canción  ').color, portadaGenerada('cancion').color);
});

test('portadaGenerada: textos distintos reparten colores distintos', () => {
  const colores = new Set(['Abbey Road', 'Thriller', 'Nevermind', 'Rumours', 'Currents', 'Blonde', 'Kid A', 'Lemonade'].map((t) => portadaGenerada(t).color));
  assert.ok(colores.size >= 4);
});

test('portadaGenerada: iniciales de las dos primeras palabras', () => {
  assert.equal(portadaGenerada('the dark side of the moon').iniciales, 'TD');
  assert.equal(portadaGenerada('Nevermind').iniciales, 'N');
  assert.equal(portadaGenerada('Ángeles & Demonios').iniciales, 'ÁD');
});

test('portadaGenerada: vacío o no texto da una nota', () => {
  assert.equal(portadaGenerada('').iniciales, '♪');
  assert.equal(portadaGenerada(null).iniciales, '♪');
  assert.match(portadaGenerada(undefined).color, /^#[0-9a-f]{6}$/);
});

test('portadaGenerada: color y color2 son hex; aRgbDeHex los convierte', () => {
  const p = portadaGenerada('Rumours');
  assert.match(p.color, /^#[0-9a-f]{6}$/);
  assert.match(p.color2, /^#[0-9a-f]{6}$/);
  assert.deepEqual(aRgbDeHex('#ff8000'), { r: 255, g: 128, b: 0 });
});

test('textoPortada: álbum, si no título, si no artista', () => {
  assert.equal(textoPortada({ titulo: 'T', artista: 'A' }, { album: 'Al' }), 'Al');
  assert.equal(textoPortada({ titulo: 'T', artista: 'A' }, {}), 'T');
  assert.equal(textoPortada({ artista: 'A' }, null), 'A');
  assert.equal(textoPortada(null, null), '');
});

test('tinteLegible: amarillo vivo se oscurece, un tono ya oscuro no cambia', () => {
  const y = tinteLegible({ r: 255, g: 230, b: 0 });
  assert.ok(y.r < 255 && y.g < 230);
  assert.deepEqual(tinteLegible({ r: 20, g: 20, b: 60 }), { r: 20, g: 20, b: 60 });
});
