// src/movil/busqueda.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarEnBiblioteca, leerRecientes, guardarReciente, quitarReciente, borrarRecientes } from './busqueda.js';

const tracks = [
  { id: '1', titulo: 'Música Ligera', artista: 'Soda Stereo' },
  { id: '2', titulo: 'Otra Piel', artista: 'Gustavo Cerati' },
  { id: '3', titulo: 'Ceremonia', artista: 'Soda Stereo' },
];
test('ignora acentos y mayúsculas y busca en título y artista', () => {
  assert.deepEqual(buscarEnBiblioteca(tracks, 'musica').map((t) => t.id), ['1']);
  assert.deepEqual(buscarEnBiblioteca(tracks, 'SODA').map((t) => t.id).sort(), ['1', '3']);
});
test('primero lo que empieza por el texto', () => {
  assert.equal(buscarEnBiblioteca(tracks, 'ce')[0].id, '3');
});
test('texto vacío no devuelve nada', () => {
  assert.deepEqual(buscarEnBiblioteca(tracks, '  '), []);
});
test('respeta el máximo de resultados', () => {
  const muchos = Array.from({ length: 50 }, (_, i) => ({ id: String(i), titulo: `Tema ${i}`, artista: 'X' }));
  assert.equal(buscarEnBiblioteca(muchos, 'tema').length, 30);
  assert.equal(buscarEnBiblioteca(muchos, 'tema', 5).length, 5);
});

// Almacén de mentira con la misma interfaz que localStorage.
const almacen = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('recientes: lo último va primero, sin repetidos y con máximo 8', () => {
  const a = almacen();
  for (const t of ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']) guardarReciente(a, t);
  assert.equal(leerRecientes(a).length, 8);
  assert.equal(leerRecientes(a)[0], 'nueve');
  guardarReciente(a, 'CINCO ');
  assert.deepEqual(leerRecientes(a).slice(0, 2), ['CINCO', 'nueve']);
  assert.equal(leerRecientes(a).filter((t) => t.toLowerCase() === 'cinco').length, 1);
});
test('recientes: no guarda textos de menos de 2 letras y quita y borra', () => {
  const a = almacen();
  guardarReciente(a, ' x ');
  assert.deepEqual(leerRecientes(a), []);
  guardarReciente(a, 'soda');
  guardarReciente(a, 'cerati');
  quitarReciente(a, 'soda');
  assert.deepEqual(leerRecientes(a), ['cerati']);
  borrarRecientes(a);
  assert.deepEqual(leerRecientes(a), []);
});
test('recientes: un almacén roto o con basura no rompe nada', () => {
  const a = almacen();
  a.setItem('musicsippi.busquedasRecientes', '{no es json');
  assert.deepEqual(leerRecientes(a), []);
  const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => {} };
  assert.deepEqual(leerRecientes(roto), []);
  assert.doesNotThrow(() => guardarReciente(roto, 'soda'));
});

import { semillaRecomendados, previewDe, buscarModos } from './busqueda.js';

test('semillaRecomendados: artistas con más canciones primero, tope y sin vacíos', () => {
  const t = (artista) => ({ artista });
  const tracks = [t('A'), t('B'), t('B'), t('C'), t('C'), t('C'), t(''), t(null)];
  assert.deepEqual(semillaRecomendados(tracks), ['C', 'B', 'A']);
  assert.deepEqual(semillaRecomendados(tracks, 2), ['C', 'B']);
  assert.deepEqual(semillaRecomendados([]), []);
});

test('previewDe: track de vista previa con id prefijado y el videoId', () => {
  const p = previewDe({ videoId: 'abc', artistaSugerido: 'Ar', tituloSugerido: 'Ti' });
  assert.equal(p.id, 'preview-abc');
  assert.equal(p.youtubeVideoId, 'abc');
  assert.equal(p.youtubeQuery, 'Ar Ti');
  assert.deepEqual(p.fuentes, ['youtube']);
});

test('buscarModos: filtra por nombre sin acentos, ignora vacíos y de sistema', () => {
  const ejes = [
    { id: 'a', nombre: 'Tranquilo', tipo: 'gusto' },
    { id: 'b', nombre: 'Gimnasio', tipo: 'funcional' },
    { id: 'c', nombre: 'Vacío', tipo: 'gusto' },
    { id: 'd', nombre: 'Favoritos', tipo: 'sistema' },
  ];
  const conteos = new Map([['a', 3], ['b', 5], ['d', 9]]);
  assert.deepEqual(buscarModos(ejes, conteos, 'TRANQ').map((e) => e.id), ['a']);
  assert.deepEqual(buscarModos(ejes, conteos, '').map((e) => e.id).sort(), ['a', 'b']);
  assert.deepEqual(buscarModos(ejes, conteos, 'zzz'), []);
});

import { palabras, puntuar, agruparExternos, mensajeBusqueda } from './busqueda.js';

test('varias palabras en cualquier orden, parciales y sin tildes', () => {
  const t = [
    { id: 'a', titulo: 'Después de la Playa', artista: 'Bad Bunny' },
    { id: 'b', titulo: 'Amor Eterno', artista: 'Rocío Dúrcal' },
  ];
  assert.deepEqual(buscarEnBiblioteca(t, 'bunny bad').map((x) => x.id), ['a']);
  assert.deepEqual(buscarEnBiblioteca(t, 'desp pla').map((x) => x.id), ['a']);
  assert.deepEqual(buscarEnBiblioteca(t, 'rocio durc').map((x) => x.id), ['b']);
  assert.deepEqual(buscarEnBiblioteca(t, 'unny').map((x) => x.id), ['a']); // parcial dentro de palabra
  assert.deepEqual(buscarEnBiblioteca(t, 'zzz'), []);
});
test('el álbum también cuenta si se pasa albumDe', () => {
  const t = [{ id: 'a', titulo: 'Prófugos', artista: 'Soda Stereo' }];
  assert.deepEqual(buscarEnBiblioteca(t, 'comfort', 30, () => 'Canción Animal'), []);
  assert.deepEqual(buscarEnBiblioteca(t, 'animal', 30, () => 'Canción Animal').map((x) => x.id), ['a']);
});
test('palabras y puntuar', () => {
  assert.deepEqual(palabras('  Bad-Bunny, Ñandú! '), ['bad', 'bunny', 'nandu']);
  assert.equal(puntuar('Smash Mouth', ['smash']), 0);
  assert.equal(puntuar('All Star Smash', ['smash']), 1);
  assert.equal(puntuar('Smashing', ['mash']), 2);
  assert.equal(puntuar('Smash', ['xyz']), -1);
});
test('agruparExternos: artistas y álbumes salen de las canciones', () => {
  const r = [
    { videoId: '1', tituloSugerido: 'A', artistaSugerido: 'Gustavo Cerati', album: 'Bocanada', thumbnail: 'u1' },
    { videoId: '2', tituloSugerido: 'B', artistaSugerido: 'Gustavo Cerati, Otro', album: 'Bocanada', thumbnail: 'u2' },
    { videoId: '3', tituloSugerido: 'C', artistaSugerido: 'Soda Stereo', album: null, thumbnail: 'u3' },
  ];
  const g = agruparExternos(r, 'cerati');
  assert.equal(g.canciones.length, 3);
  assert.deepEqual(g.artistas.map((a) => [a.nombre, a.cantidad]), [['Gustavo Cerati', 2]]);
  assert.deepEqual(g.albumes.map((a) => [a.titulo, a.cantidad]), [['Bocanada', 2]]);
  assert.deepEqual(agruparExternos(undefined, 'x'), { canciones: [], artistas: [], albumes: [] });
});
test('mensajeBusqueda', () => {
  assert.match(mensajeBusqueda('TypeError: Failed to fetch'), /conexión/);
  assert.match(mensajeBusqueda('HTTP 429'), /demasiadas/);
  assert.match(mensajeBusqueda('boom'), /no respondió/);
});
