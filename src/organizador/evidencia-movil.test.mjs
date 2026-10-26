import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mezclarEvidenciaPC, evidenciaDeBiblioteca, guardarEvidenciaPC } from './evidencia-movil.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';

const fuentes = { vocabulario: { sinonimos: {}, patronesTitulo: [], nombresHumanos: { rock: 'Rock', pop: 'Pop' } } };

test('la evidencia del PC se añade sin borrar lo consultado en el móvil', () => {
  const previos = [{ trackId: 'a', deezerBuscado: true, generosDeezer: ['pop'] }];
  const r = mezclarEvidenciaPC(previos, { a: { generos: ['rock'], senal: 'genero-musicbrainz' }, b: { generos: [], senal: null } });
  assert.deepEqual(r, [
    { trackId: 'a', deezerBuscado: true, generosDeezer: ['pop'], evidenciaPC: { generos: ['rock'], senal: 'genero-musicbrainz' } },
    { trackId: 'b', evidenciaPC: { generos: [], senal: null } },
  ]);
});

test('combina PC y móvil; la señal es la de más precedencia', () => {
  const tracks = [
    { id: 'a', titulo: 'Uno', ejes: [] },
    { id: 'b', titulo: 'Dos', ejes: [] },
    { id: 'c', titulo: 'Tres', ejes: [] },
  ];
  const registros = [
    { trackId: 'a', evidenciaPC: { generos: ['rock'], senal: 'nombre-lista' }, generosDeezer: ['pop'] },
    { trackId: 'b', generosMB: ['rock'] },
  ];
  const ev = evidenciaDeBiblioteca(tracks, registros, [], fuentes);
  assert.deepEqual(ev.get('a'), { generos: ['rock', 'pop'], senal: 'genero-deezer' });
  assert.deepEqual(ev.get('b'), { generos: ['rock'], senal: 'genero-musicbrainz' });
  assert.deepEqual(ev.get('c'), { generos: [], senal: null });
});

test('Deezer del móvil se ignora si el PC ya trae género de MusicBrainz', () => {
  const tracks = [{ id: 'a', titulo: 'Uno', ejes: [] }];
  const registros = [{ trackId: 'a', evidenciaPC: { generos: ['rock'], senal: 'genero-musicbrainz' }, generosDeezer: ['pop'] }];
  const ev = evidenciaDeBiblioteca(tracks, registros, [], fuentes);
  assert.deepEqual(ev.get('a'), { generos: ['rock'], senal: 'genero-musicbrainz' });
});

test('guardarEvidenciaPC (camino de sincronizar) no toca lo consultado en el móvil', async () => {
  const previo = { trackId: 'a', generosMB: ['jazz'], mbBuscado: true, artistaMbid: 'x', generosDeezer: ['pop'], deezerBuscado: true };
  const almacen = crearAlmacenMemoria({ generos: [previo] });
  await guardarEvidenciaPC(almacen, { a: { generos: ['rock'], senal: 'genero-musicbrainz' }, b: { generos: [], senal: null } });
  const todos = await almacen.obtenerTodos('generos');
  assert.deepEqual(todos.find((r) => r.trackId === 'a'), { ...previo, evidenciaPC: { generos: ['rock'], senal: 'genero-musicbrainz' } });
  assert.deepEqual(todos.find((r) => r.trackId === 'b'), { trackId: 'b', evidenciaPC: { generos: [], senal: null } });
});
