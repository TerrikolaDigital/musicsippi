import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularRespaldo, textoFranjaSenal, AVISO_SENAL } from './respaldo-senal.js';

const t = (id, ...ejes) => ({ id, youtubeVideoId: `v${id}`, ejes: ejes.map((ejeId) => ({ ejeId })) });
const base = { videoIdDe: (x) => x.youtubeVideoId, azar: () => 0 };
const ids = (r) => r.map((x) => x.id).sort();

test('mismo mood primero, luego el resto', () => {
  const tracks = [t('a', 'rock'), t('b', 'jazz'), t('c', 'rock')];
  const r = calcularRespaldo({ ...base, tracks, cola: [], ejeId: 'rock', guardados: new Set(['va', 'vb', 'vc']) });
  assert.deepEqual(ids(r.slice(0, 2)), ['a', 'c']);
  assert.equal(r[2].id, 'b');
});

test('sin_mood_usa_moods_de_la_cola', () => {
  const tracks = [t('a', 'jazz'), t('b', 'rock'), t('q', 'rock')];
  const r = calcularRespaldo({ ...base, tracks, cola: [t('q', 'rock', 'sin-clasificar')], ejeId: 'lista-1', guardados: new Set(['va', 'vb']) });
  assert.deepEqual(r.map((x) => x.id), ['b', 'a']);
});

test('sin guardadas no hay respaldo', () => {
  assert.deepEqual(calcularRespaldo({ ...base, tracks: [t('a', 'rock')], cola: [], ejeId: 'rock', guardados: new Set() }), []);
});

test('lo escuchado hace poco va al final de su nivel', () => {
  const tracks = [t('a', 'rock'), t('b', 'rock')];
  const r = calcularRespaldo({ ...base, tracks, cola: [], ejeId: 'rock', guardados: new Set(['va', 'vb']), recientes: ['a'] });
  assert.deepEqual(r.map((x) => x.id), ['b', 'a']);
});

test('sin repetir videoId y con tope', () => {
  const tracks = [t('a', 'rock'), { ...t('a2', 'rock'), youtubeVideoId: 'va' }, t('b'), t('c')];
  const r = calcularRespaldo({ ...base, tracks, cola: [], ejeId: null, guardados: new Set(['va', 'vb', 'vc']), max: 2 });
  assert.equal(r.length, 2);
  assert.equal(new Set(r.map((x) => x.youtubeVideoId)).size, 2);
});

test('texto de la franja', () => {
  assert.equal(textoFranjaSenal({ esperando: false }), AVISO_SENAL);
  assert.match(textoFranjaSenal({ esperando: true }), /al volver la señal/);
});
