import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularSugeridas, firmaSemillas, haceFaltaOtras, mezclarSugeridas, paginaDe, semillasDe, sinLasPropias, viaDeAsignacion,
} from './sugeridas.js';

const t = (artista, titulo) => ({ artista, titulo });
const c = (artista, titulo) => ({ id: `d-${artista}-${titulo}`, artista, titulo, cover: null });

test('semillas: los artistas que más se repiten, sin colaboraciones ni duplicados', () => {
  const tracks = [t('Zedd', 'a'), t('Zedd, Foxes', 'b'), t('Ana', 'c'), t('ana', 'd'), t('Ana & Beto', 'e'), t('Solo', 'f')];
  assert.deepEqual(semillasDe(tracks, 2), ['Ana', 'Zedd']);
  assert.deepEqual(semillasDe([], 5), []);
  assert.equal(semillasDe(Array.from({ length: 9 }, (_, i) => t(`A${i}`, 'x'))).length, 5);
});

test('la firma no depende del orden', () => {
  assert.equal(firmaSemillas(['Zedd', 'Ana']), firmaSemillas(['ana', 'ZEDD']));
});

test('mezcla alternando las dos mitades y sin repetir', () => {
  const a = [[c('A', '1'), c('A', '2')], [c('B', '1')]];
  const b = [[c('C', '1'), c('A', '1')]];
  const m = mezclarSugeridas(a, b, 10).map((x) => `${x.artista}${x.titulo}`);
  assert.deepEqual(m, ['A1', 'C1', 'B1', 'A2']);
});

test('quita lo que ya está en la biblioteca', () => {
  const pool = [c('Zedd', 'Clarity'), c('Zedd', 'Stay')];
  assert.deepEqual(sinLasPropias(pool, [t('Zedd, Foxes', 'clarity')]).map((x) => x.titulo), ['Stay']);
});

test('paginación con vuelta al principio', () => {
  const l = Array.from({ length: 25 }, (_, i) => i);
  assert.deepEqual(paginaDe(l, 0), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(paginaDe(l, 2), [20, 21, 22, 23, 24, 0, 1, 2, 3, 4]);
  assert.deepEqual(paginaDe(l, 3), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.deepEqual(paginaDe([1, 2, 3], 4), [1, 2, 3]);
  assert.equal(haceFaltaOtras(19), false);
  assert.equal(haceFaltaOtras(20), true);
});

test('vía de asignación: favoritos y playlists son colecciones', () => {
  assert.equal(viaDeAsignacion({ id: 'favoritos', tipo: 'gusto' }), 'coleccion');
  assert.equal(viaDeAsignacion({ id: 'p1', tipo: 'playlist' }), 'coleccion');
  assert.equal(viaDeAsignacion({ id: 'zen', tipo: 'funcional' }), 'eje');
  assert.equal(viaDeAsignacion({ id: 'rock', tipo: 'gusto' }), 'eje');
});

function dzFalso({ roto = false } = {}) {
  const art = (n, fans = 1) => ({ id: n, nombre: n, fans });
  const relacionados = { Zedd: [art('Kygo', 5), art('Avicii', 9), art('Zedd')], Ana: [art('Kygo', 5)] };
  return {
    buscarArtista: async (n) => {
      if (roto) throw new Error('red');
      return art(n);
    },
    top: async (id) => Array.from({ length: 6 }, (_, i) => c(id, `hit${i}`)),
    relacionados: async (id) => relacionados[id] ?? [],
  };
}

test('calcularSugeridas: mitad de las semillas, mitad de relacionados, sin semillas entre los relacionados', async () => {
  const pool = await calcularSugeridas({ semillas: ['Zedd', 'Ana'], dz: dzFalso(), max: 20 });
  const artistas = new Set(pool.map((x) => x.artista));
  assert.ok(artistas.has('Zedd') && artistas.has('Ana') && artistas.has('Kygo'));
  assert.ok(pool.length <= 20);
  assert.equal(new Set(pool.map((x) => `${x.artista}|${x.titulo}`)).size, pool.length);
  // alterna: el primero viene de una semilla y el segundo de un relacionado
  assert.equal(['Zedd', 'Ana'].includes(pool[0].artista), true);
  assert.equal(['Kygo', 'Avicii'].includes(pool[1].artista), true);
});

test('calcularSugeridas lanza si Deezer falla del todo', async () => {
  await assert.rejects(calcularSugeridas({ semillas: ['Zedd'], dz: dzFalso({ roto: true }) }));
});
