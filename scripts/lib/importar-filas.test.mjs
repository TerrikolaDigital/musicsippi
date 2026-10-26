import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarFilasTuneMyMusic } from './importar-tunemymusic.mjs';
import { convertirListaEnModo } from './aplicar-modos.mjs';

const eje = (id, nombre, extra = {}) => ({
  id, nombre, tipo: 'playlist', orden: 1, activo: true, sistema: false, padre: null,
  anclas: { artistas: [], titulos: [] }, tagsLastfm: [], ...extra,
});
const fila = (titulo, artista, playlist) => ({ titulo, artista, album: '', playlist, tipo: 'Track' });
const aplicar = (filas, ejes) =>
  aplicarFilasTuneMyMusic(filas, { biblioteca: { tracks: [] }, ejes, metaSpotify: { tracks: {} } });

test('reimportar una lista que ya se convirtió en modo no crea «-2»: usa el modo', () => {
  const chill = eje('chill', 'Chill');
  convertirListaEnModo(chill, []);
  const stats = aplicar([fila('Uno', 'A', 'Chill')], [chill]);
  assert.deepEqual(stats.listasNuevas, []);
  assert.equal(stats.ejesFinal.filter((e) => e.id.startsWith('chill')).length, 1);
  assert.equal(stats.pertenenciasMarcadas, 1);
});

test('el modo convertido se encuentra aunque el nombre cambie de mayúsculas, tildes o signos', () => {
  const chill = eje('chill-out', 'Chill Out', { tipo: 'gusto', origen: 'descubierto' });
  const stats = aplicar([fila('Uno', 'A', 'chill out!')], [chill]);
  assert.deepEqual(stats.listasNuevas, []);
});

test('un eje descubierto de otro nombre no se toca', () => {
  const stats = aplicar([fila('Uno', 'A', 'Chill')], [eje('rock', 'Rock', { tipo: 'gusto', origen: 'descubierto' })]);
  assert.equal(stats.listasNuevas.length, 1);
});

test('reimportar «Soundtrack» encuentra el modo convertido «Soundtracks» (plural/singular)', () => {
  const st = eje('soundtracks', 'Soundtracks', { tipo: 'gusto', origen: 'descubierto' });
  const stats = aplicar([fila('Uno', 'A', 'Soundtrack')], [st]);
  assert.deepEqual(stats.listasNuevas, []);
  assert.equal(stats.pertenenciasMarcadas, 1);
});
