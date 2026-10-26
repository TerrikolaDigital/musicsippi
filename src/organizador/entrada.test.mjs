import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEntrada } from './entrada.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';
import { contarSinModo } from '../movil/inicio.js';

const fuentes = { vocabulario: { sinonimos: {}, patronesTitulo: [], nombresHumanos: { rock: 'Rock' } }, umbrales: { masaMinima: 25, masaMinimaPorcentaje: 0.03 } };

test('solo entran las Sin clasificar, con su evidencia y sus vectores previos', async () => {
  const almacen = crearAlmacenMemoria({
    biblioteca: [
      { id: 'a', artista: 'A', titulo: 'Uno', fuentes: ['movil'], ejes: [{ ejeId: 'sin-clasificar' }] },
      { id: 'b', artista: 'B', titulo: 'Dos', fuentes: ['tunemymusic'], ejes: [{ ejeId: 'rock' }] },
    ],
    generos: [{ trackId: 'a', generosMB: ['rock'] }],
    vectores: [{ trackId: 'a', hash: 'h', vector: Float32Array.from([1]) }, { trackId: 'b', hash: 'h', vector: Float32Array.from([2]) }],
  });
  const e = await prepararEntrada(almacen, fuentes);
  assert.deepEqual(e.tracks.map((t) => t.id), ['a']);
  assert.deepEqual(e.evidencia, [['a', { generos: ['rock'], senal: 'genero-musicbrainz' }]]);
  assert.equal(e.totalTracks, 2);
  assert.deepEqual(e.vectoresPrevios.map((v) => v.trackId), ['a']);
});

test('entran las mismas canciones que la app cuenta como «sin modo», aunque no tengan la marca «Sin clasificar»', async () => {
  const almacen = crearAlmacenMemoria({
    biblioteca: [
      { id: 'a', artista: 'A', titulo: 'Marcada', fuentes: ['movil'], ejes: [{ ejeId: 'sin-clasificar' }] },
      { id: 'b', artista: 'B', titulo: 'Sin ejes', fuentes: ['movil'], ejes: [] },
      { id: 'c', artista: 'C', titulo: 'Solo favorita', fuentes: ['movil'], ejes: [{ ejeId: 'favoritos' }] },
      { id: 'd', artista: 'D', titulo: 'Con modo', fuentes: ['movil'], ejes: [{ ejeId: 'rock' }] },
    ],
  });
  const e = await prepararEntrada(almacen, fuentes);
  assert.deepEqual(e.tracks.map((t) => t.id).sort(), ['a', 'b', 'c']);
  assert.equal(e.tracks.length, contarSinModo(await almacen.obtenerTodos('biblioteca')));
});
