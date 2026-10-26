import test from 'node:test';
import assert from 'node:assert/strict';
import { elegirContinuacion } from './continuacion.js';
import { entradaArtista, entradaCancion } from './noMeGusta.js';

const t = (id, artista, modos = []) => ({ id, artista, titulo: id, ejes: modos.map((ejeId) => ({ ejeId })) });
const ahora = 1_000_000_000_000;
const sinAzar = () => 0;

const tracks = [
  ...Array.from({ length: 12 }, (_, i) => t(`a${i}`, `ArtA${i % 6}`, ['rock'])),
  ...Array.from({ length: 12 }, (_, i) => t(`b${i}`, `ArtB${i % 6}`, ['chill'])),
  t('x1', 'Cerca', ['jazz']),
  t('x2', 'Lejos', ['jazz']),
];

test('automática: primero el mismo modo que lo último escuchado', () => {
  const historial = [{ trackId: 'a0', ts: ahora - 2 * 3600000 }];
  const r = elegirContinuacion({ tracks, cola: [tracks[0]], historial, ahora, n: 10, rng: sinAzar });
  assert.equal(r.length, 10);
  assert.ok(r.every((x) => x.id.startsWith('a')), 'todas de rock');
  assert.ok(!r.some((x) => x.id === 'a0'), 'sin las ya en cola');
});

test('automática: no repite lo de la última hora ni lo que está en cola', () => {
  const historial = [
    { trackId: 'a0', ts: ahora - 60000 },
    { trackId: 'a1', ts: ahora - 120000 },
  ];
  const r = elegirContinuacion({ tracks, cola: [tracks[2]], historial, ahora, n: 10, rng: sinAzar });
  const ids = r.map((x) => x.id);
  assert.ok(!ids.includes('a0') && !ids.includes('a1') && !ids.includes('a2'));
  assert.equal(new Set(ids).size, ids.length);
});

test('automática: completa con vecinas por similitud cuando el modo se agota', () => {
  const solo = [t('a0', 'A', ['rock']), t('a1', 'B', ['rock']), t('c', 'C', ['pop']), t('d', 'D', ['pop'])];
  const vectores = [
    { trackId: 'a0', vector: [1, 0] },
    { trackId: 'a1', vector: [1, 0.1] },
    { trackId: 'c', vector: [0.9, 0.3] },
    { trackId: 'd', vector: [0, 1] },
  ];
  const historial = [{ trackId: 'a0', ts: ahora - 5 * 3600000 }];
  const r = elegirContinuacion({ tracks: solo, cola: [solo[0]], historial, vectores, ahora, n: 3, rng: sinAzar });
  assert.deepEqual(r.map((x) => x.id), ['a1', 'c', 'd']);
});

test('automática: tope de 2 por artista mientras haya alternativas', () => {
  const lote = Array.from({ length: 8 }, (_, i) => t(`m${i}`, i < 6 ? 'Mismo' : `Otro${i}`, ['rock']));
  const historial = [{ trackId: 'm0', ts: ahora - 9 * 3600000 }];
  const r = elegirContinuacion({ tracks: lote, cola: [lote[0]], historial, ahora, n: 4, rng: sinAzar });
  assert.ok(r.filter((x) => x.artista === 'Mismo').length <= 2);
  assert.equal(r.length, 4);
});

test('automática: sin candidatas devuelve vacío', () => {
  assert.deepEqual(elegirContinuacion({ tracks: [tracks[0]], cola: [tracks[0]], ahora }), []);
});

test('radio: ~30 % de fuera del modo, el resto del modo, sin repetir', () => {
  const vectores = tracks.map((x, i) => ({ trackId: x.id, vector: x.id.startsWith('x') ? [1, 0] : [i % 2, 1] }));
  const r = elegirContinuacion({
    tracks, cola: [], historial: [], vectores, ahora, n: 10, modoId: 'rock', fraccionFuera: 0.3, excluirRecientes: false,
  });
  assert.equal(r.length, 10);
  assert.equal(new Set(r.map((x) => x.id)).size, 10);
  assert.equal(r.filter((x) => !x.id.startsWith('a')).length, 3);
});

test('radio: si el modo no da para más, completa con parecidas de fuera', () => {
  const chico = [t('a0', 'A', ['rock']), t('b0', 'B', ['pop']), t('b1', 'C', ['pop']), t('b2', 'D', ['pop'])];
  const r = elegirContinuacion({ tracks: chico, cola: [chico[0]], ahora, n: 3, modoId: 'rock', fraccionFuera: 0.3 });
  assert.equal(r.length, 3);
  assert.ok(r.every((x) => x.id.startsWith('b')));
});

test('«No me gusta»: la automática y la radio no eligen canciones ni artistas marcados', () => {
  const marcas = [entradaArtista('ArtA0'), entradaCancion(tracks[1])];
  const auto = elegirContinuacion({ tracks, cola: [], historial: [], ahora, n: 20, rng: sinAzar, marcas });
  assert.ok(auto.length > 0);
  assert.ok(!auto.some((x) => x.artista === 'ArtA0' || x.id === 'a1'));
  const radio = elegirContinuacion({ tracks, ahora, n: 20, modoId: 'rock', fraccionFuera: 0.3, excluirRecientes: false, rng: sinAzar, marcas });
  assert.ok(radio.length > 0);
  assert.ok(!radio.some((x) => x.artista === 'ArtA0' || x.id === 'a1'));
});
