import test from 'node:test';
import assert from 'node:assert/strict';
import { crearMetaDeFuera } from './portadasDeFuera.js';

const tracks = [
  { id: 'a', titulo: 'Bailando', artista: 'Enrique Iglesias' },
  { id: 'b', titulo: 'Sin url', artista: 'X' },
];
const metas = {
  a: { coverUrl: 'https://img/bailando.jpg' },
  b: { coverUrl: 'sin-http' },
  'radio-1': { coverRespaldo: 'https://yt/mini.jpg' },
};
const metadataDe = (id) => metas[id] ?? {};

test('canción de fuera: usa la carátula de la misma canción de la biblioteca (sin importar mayúsculas)', () => {
  const m = crearMetaDeFuera({ tracks, metadataDe });
  assert.equal(m({ id: 'radio-9', titulo: ' bailando ', artista: 'ENRIQUE iglesias' }).coverUrl, 'https://img/bailando.jpg');
});

test('la carátula propia de la entrada gana sobre la de la biblioteca', () => {
  const m = crearMetaDeFuera({ tracks, metadataDe });
  assert.equal(m({ id: 'radio-9', titulo: 'Bailando', artista: 'Enrique Iglesias', coverUrl: 'https://propia' }).coverUrl, 'https://propia');
});

test('sin carátula en la biblioteca: coverUrl null y se pasa el respaldo (miniatura del vídeo)', () => {
  const m = crearMetaDeFuera({ tracks, metadataDe });
  const r = m({ id: 'radio-1', titulo: 'Otra', artista: 'Nadie' });
  assert.equal(r.coverUrl, null);
  assert.equal(r.coverRespaldo, 'https://yt/mini.jpg');
});

test('urls que no son http se ignoran', () => {
  const m = crearMetaDeFuera({ tracks, metadataDe });
  assert.equal(m({ id: 'z', titulo: 'Sin url', artista: 'X' }).coverUrl, null);
});
