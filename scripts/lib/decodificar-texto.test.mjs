import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodificarTextoDeArchivo } from './decodificar-texto.mjs';

test('un archivo UTF-8 normal se decodifica tal cual, acentos incluidos', () => {
  const buffer = new TextEncoder().encode('De Música Ligera').buffer;
  assert.equal(decodificarTextoDeArchivo(buffer), 'De Música Ligera');
});

test('un archivo UTF-8 con BOM no deja el BOM pegado al primer caracter', () => {
  const conBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Titulo')]);
  assert.equal(decodificarTextoDeArchivo(conBom.buffer), 'Titulo');
});

test('un archivo Windows-1252 (acentos en un solo byte) se recupera en vez de perderse', () => {
  // Caso real que motivo esto: un CSV de TuneMyMusic exportado en
  // Windows-1252 -- "ú" es el byte 0xFA, que es una secuencia UTF-8
  // invalida por si sola. Decodificado como UTF-8 a la fuerza (que es lo que
  // hacia `archivo.text()` antes, sin fallback), el resultado era "M?sica":
  // el caracter de reemplazo U+FFFD en el lugar del acento.
  const bytes = new Uint8Array([
    ...new TextEncoder().encode('De M'),
    0xfa, // 'ú' en Windows-1252/Latin-1, invalido como UTF-8 suelto
    ...new TextEncoder().encode('sica Ligera'),
  ]);
  assert.equal(decodificarTextoDeArchivo(bytes.buffer), 'De Música Ligera');
});

test('un archivo vacio no rompe nada', () => {
  assert.equal(decodificarTextoDeArchivo(new ArrayBuffer(0)), '');
});
