import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generosParaVector, textoDeTrack } from './clasificar-embeddings-puro.mjs';

const ejesPorId = new Map([
  ['soul-hip-hop', { id: 'soul-hip-hop', nombre: 'Soul y hip hop', familia: 'genero' }],
  ['tranquilo', { id: 'tranquilo', nombre: 'Tranquilo', familia: 'estado' }],
  ['favoritos', { id: 'favoritos', nombre: 'Favoritos', familia: 'fijo' }],
]);
const track = {
  id: 'x', artista: 'Soul&Roll', titulo: 'I Say a Little Pray for You',
  ejes: [{ ejeId: 'favoritos' }, { ejeId: 'tranquilo' }, { ejeId: 'soul-hip-hop' }],
};

test('generosParaVector suma los moods de género de la canción, no los de estado ni los fijos', () => {
  assert.deepEqual(generosParaVector(track, [], ejesPorId), ['Soul y hip hop']);
});

test('generosParaVector conserva la evidencia primero y no repite', () => {
  assert.deepEqual(generosParaVector(track, ['soul', 'funk'], ejesPorId), ['soul', 'funk', 'Soul y hip hop']);
  const dos = { ...track, ejes: [...track.ejes, { ejeId: 'soul-hip-hop' }] };
  assert.deepEqual(generosParaVector(dos, [], ejesPorId), ['Soul y hip hop']);
});

test('generosParaVector sin ejes conocidos devuelve solo la evidencia', () => {
  assert.deepEqual(generosParaVector(track, ['rock']), ['rock']);
  assert.deepEqual(generosParaVector({ ...track, ejes: undefined }, [], ejesPorId), []);
});

test('una canción sin fuentes externas entra al texto del vector con su género', () => {
  assert.equal(
    textoDeTrack(track, { generos: generosParaVector(track, [], ejesPorId) }),
    'Soul&Roll — I Say a Little Pray for You. Géneros: Soul y hip hop.',
  );
});
