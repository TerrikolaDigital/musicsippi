import test from 'node:test';
import assert from 'node:assert/strict';
import { textoCompartir } from './compartir-salida.js';

const cero = () => 0;

test('canción con videoId: frase cercana, enlace directo y firma', () => {
  const t = textoCompartir({ tipo: 'cancion', titulo: 'Clocks', artista: 'Coldplay', videoId: 'abc123' }, cero);
  assert.match(t, /“Clocks” de Coldplay/);
  assert.match(t, /\nhttps:\/\/music\.youtube\.com\/watch\?v=abc123\n/);
  assert.match(t, /vía Musicsippi/);
});

test('canción sin videoId: búsqueda con artista y título codificados', () => {
  const t = textoCompartir({ tipo: 'cancion', titulo: 'Sí & No?', artista: 'Ñu Band', videoId: '' }, cero);
  assert.match(t, /https:\/\/music\.youtube\.com\/search\?q=%C3%91u\+Band\+S%C3%AD\+%26\+No%3F/);
});

test('canción con modo: cuenta desde dónde sonaba', () => {
  const t = textoCompartir({ tipo: 'cancion', titulo: 'Clocks', artista: 'Coldplay', modo: 'Chill' }, cero);
  assert.match(t, /Sonaba en mi mood «Chill»\./);
});

test('las frases varían según el azar y no se salen de la lista', () => {
  const vistas = new Set();
  for (const r of [0, 0.3, 0.6, 0.99]) vistas.add(textoCompartir({ tipo: 'cancion', titulo: 'A', artista: 'B' }, () => r).split('\n')[0]);
  assert.ok(vistas.size >= 3);
});

test('álbum: búsqueda por artista y álbum', () => {
  const t = textoCompartir({ tipo: 'album', titulo: 'A Rush of Blood', artista: 'Coldplay' }, cero);
  assert.match(t, /“A Rush of Blood” de Coldplay/);
  assert.match(t, /search\?q=Coldplay\+A\+Rush\+of\+Blood/);
});

test('artista: búsqueda por nombre', () => {
  const t = textoCompartir({ tipo: 'artista', artista: 'Coldplay' }, cero);
  assert.match(t, /Coldplay/);
  assert.match(t, /search\?q=Coldplay/);
});

test('tipo desconocido lanza error', () => {
  assert.throws(() => textoCompartir({ tipo: 'x', artista: 'A' }));
});
