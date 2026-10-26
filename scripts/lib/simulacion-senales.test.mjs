import { test } from 'node:test';
import assert from 'node:assert/strict';
import { muestrear, coberturaDeMuestra, formatearCobertura, formatearEstados } from './simulacion-senales.mjs';

test('muestrear: determinista, repartida y sin repetir', () => {
  const tracks = Array.from({ length: 100 }, (_, i) => ({ id: String(100 - i) }));
  const m = muestrear(tracks, 10);
  assert.equal(m.length, 10);
  assert.equal(new Set(m.map((t) => t.id)).size, 10);
  assert.deepEqual(muestrear(tracks, 10), m);
  assert.equal(muestrear(tracks, 500).length, 100);
});

test('cobertura e informe cuentan bpm, géneros de canción/álbum y etiquetas', () => {
  const muestra = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const metas = new Map([['a', { deezerTrackId: 1, bpm: 120 }], ['b', { deezerTrackId: 2 }]]);
  const registros = new Map([
    ['a', { recordingMbid: 'r', mbCancion: { generos: ['pop'], tags: ['happy'] }, mbAlbum: { generos: [], tags: [] } }],
    ['b', { recordingMbid: 'r2', mbCancion: { generos: [], tags: [] }, mbAlbum: { generos: ['rock'], tags: ['x'] } }],
  ]);
  const c = coberturaDeMuestra({ muestra, metas, registros, conGeneroArtista: new Set(['a']), estadosPorEtiquetas: (t) => (t.includes('happy') ? ['feliz'] : []) });
  assert.equal(c.conBpm, 1);
  assert.equal(c.deezerEncontrada, 2);
  assert.equal(c.recording, 2);
  assert.equal(c.generosCancion, 1);
  assert.equal(c.generosAlbum, 1);
  assert.equal(c.algunGenero, 2);
  assert.equal(c.conEtiquetasAnimo, 1);
  assert.equal(c.sinGenero, 3);
  assert.equal(c.ganaGenero, 1);
  const texto = formatearCobertura(c).join('\n');
  assert.match(texto, /Con bpm > 0:\s+1 \(25\.0 % de la muestra, 50\.0 % de las encontradas\)/);
  const estados = formatearEstados({ porEstado: { feliz: { nombre: 'Feliz', n: 3, ya: 10, porSenal: { ritmo: 3, etiquetas: 3 } } }, factor: 2, totalCandidatas: 100, muestra: 50 });
  assert.match(estados.join('\n'), /Feliz\s+10\s+3\s+≈ 6\s+ritmo:3 etiquetas:3/);
});
