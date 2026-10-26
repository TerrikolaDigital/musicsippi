import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traducirError } from './traducir-error.mjs';

test('DOMException de archivo invalidado se traduce', () => {
  const err = new DOMException('A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError');
  const resultado = traducirError(err);
  assert.match(resultado, /No se pudo leer el archivo/);
  assert.doesNotMatch(resultado, /could not be found/i);
});

test('SyntaxError de JSON.parse se traduce, sin mencionar "archivo"', () => {
  // Genérico a propósito: un SyntaxError también sale de interpretar una
  // respuesta del servidor que no llegó a ser JSON (ej. al abrir un álbum),
  // sin ningún archivo de por medio — ver el comentario en traducir-error.mjs.
  let err;
  try {
    JSON.parse('esto no es json');
  } catch (e) {
    err = e;
  }
  const resultado = traducirError(err);
  assert.match(resultado, /formato inválido/);
  assert.doesNotMatch(resultado, /archivo/i);
});

test('error de red del navegador ("Failed to fetch") se traduce', () => {
  const err = new TypeError('Failed to fetch');
  const resultado = traducirError(err);
  assert.match(resultado, /conectar con Musicsippi/);
});

test('error de red del servidor/Node ("fetch failed") tambien se traduce', () => {
  // Node/undici usa el orden inverso al de Chromium ("fetch failed" en vez
  // de "Failed to fetch") -- los endpoints que reenvian e.message de un
  // fetch server-side fallido (Deezer/MusicBrainz) usan esta forma.
  const err = new TypeError('fetch failed');
  const resultado = traducirError(err);
  assert.match(resultado, /conectar con Musicsippi/);
});

test('un mensaje propio (ya en español) pasa sin tocar', () => {
  const err = new Error('el archivo no es un CSV de TuneMyMusic válido');
  assert.equal(traducirError(err), 'el archivo no es un CSV de TuneMyMusic válido');
});
