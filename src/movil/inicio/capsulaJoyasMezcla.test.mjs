import test from 'node:test';
import assert from 'node:assert/strict';
import { capsulaDelTiempo } from './capsula.js';
import { joyasEscondidas } from './joyas.js';
import { sugerirPareja, generarMezclaModos } from './mezclaModos.js';
import { entradaArtista } from '../noMeGusta.js';

const DIA = 86400000;
const ahora = new Date(2026, 9, 19, 12).getTime();
const mk = (id, artista, ...modos) => ({ id, titulo: id, artista, ejes: modos.map((ejeId) => ({ ejeId })) });
const tracks = Array.from({ length: 20 }, (_, i) => mk(`t${i}`, `Art${i}`));

test('cápsula: hace un año si hay escuchas esa semana; ordena por escuchas', () => {
  const hace = ahora - 365 * DIA;
  const h = [
    ...[0, 1, 2].map((d) => ({ trackId: 't1', ts: hace + d * 1000 })),
    { trackId: 't2', ts: hace + DIA },
    { trackId: 't3', ts: hace - DIA },
    { trackId: 't4', ts: hace + 2 * DIA },
    { trackId: 't9', ts: ahora - DIA },
  ];
  const c = capsulaDelTiempo({ historial: h, tracks, ahora });
  assert.equal(c.clave, 'anio');
  assert.equal(c.tracks[0].id, 't1');
  assert.equal(c.tracks.length, 4);
});

test('cápsula: sin año, usa el mes pasado; sin nada, null', () => {
  const hace = ahora - 30 * DIA;
  const h = ['t1', 't2', 't3', 't4'].map((id, i) => ({ trackId: id, ts: hace + i * 1000 }));
  assert.equal(capsulaDelTiempo({ historial: h, tracks, ahora }).clave, 'mes');
  assert.equal(capsulaDelTiempo({ historial: [{ trackId: 't1', ts: ahora }], tracks, ahora }), null);
  assert.equal(capsulaDelTiempo({ historial: [], tracks: [], ahora }), null);
});

test('joyas: solo con 0-1 escuchas, estables en el día, tope por artista', () => {
  const h = Array.from({ length: 30 }, (_, i) => ({ trackId: `t${i % 10}`, ts: ahora - i * 1000 })); // t0..t9 x3
  h.push({ trackId: 't10', ts: ahora });
  const a = joyasEscondidas({ tracks, historial: h, ahora });
  const b = joyasEscondidas({ tracks, historial: h, ahora: ahora + 3600000 });
  assert.deepEqual(a.map((t) => t.id), b.map((t) => t.id));
  assert.ok(a.length > 0);
  assert.ok(a.every((t) => Number(t.id.slice(1)) >= 10));
  assert.deepEqual(joyasEscondidas({ tracks, historial: h.slice(0, 5), ahora }), []);
});

const ejes = ['chill', 'lounge', 'metal'].map((id) => ({ id, nombre: id, tipo: 'gusto', activo: true }));
const ts = [];
for (let i = 0; i < 10; i += 1) ts.push(mk(`c${i}`, `C${i}`, 'chill'));
for (let i = 0; i < 10; i += 1) ts.push(mk(`l${i}`, `L${i}`, 'lounge'));
for (let i = 0; i < 10; i += 1) ts.push(mk(`m${i}`, `M${i}`, 'metal'));
ts.push(mk('pc', 'P', 'chill', 'lounge'));
const conteos = new Map([['chill', 11], ['lounge', 11], ['metal', 10]]);
// vectores: chill ~ [1,0,0], lounge ~ [0.8,0.6,0], metal ~ [0,0,1]
const v = (id) => {
  const n = Number(id.slice(1));
  if (id[0] === 'c') return [1, 0.05 * n, 0];
  if (id[0] === 'l') return [0.8, 0.6, 0.02 * n];
  if (id[0] === 'm') return [0, 0.1, 1];
  return [0.9, 0.3, 0];
};
const vectores = ts.map((t) => ({ trackId: t.id, vector: v(t.id) }));

test('pareja sugerida: los dos más escuchados que suenan parecido', () => {
  const h = [...Array(9).fill({ ejeId: 'chill' }), ...Array(8).fill({ ejeId: 'lounge' }), ...Array(7).fill({ ejeId: 'metal' })];
  const par = sugerirPareja({ ejes, tracks: ts, historial: h, vectores, conteos });
  assert.deepEqual(par.map((e) => e.id), ['chill', 'lounge']);
  assert.deepEqual(sugerirPareja({ ejes, tracks: ts, historial: h, conteos }).map((e) => e.id), ['chill', 'lounge']);
  assert.equal(sugerirPareja({ ejes: [ejes[0]], tracks: ts, conteos }), null);
});

test('mezcla: empieza en A, pasa por puentes y acaba en B', () => {
  const lista = generarMezclaModos({ ejeA: 'chill', ejeB: 'lounge', tracks: ts, vectores, ahora, n: 9 });
  assert.equal(new Set(lista.map((t) => t.id)).size, lista.length);
  assert.ok(lista.length >= 7);
  assert.ok(lista[0].id.startsWith('c'));
  assert.ok(lista[lista.length - 1].id.startsWith('l'));
});

test('mezcla sin vectores: la canción común hace de puente', () => {
  const lista = generarMezclaModos({ ejeA: 'chill', ejeB: 'lounge', tracks: ts, ahora, n: 9 });
  const iPuente = lista.findIndex((t) => t.id === 'pc');
  assert.ok(iPuente > 0 && iPuente < lista.length - 1);
});

test('«No me gusta»: joyas y mezcla de modos excluyen los artistas marcados', () => {
  const h = Array.from({ length: 30 }, (_, i) => ({ trackId: `t${i % 10}`, ts: ahora - i * 1000 }));
  const marcas = [entradaArtista('Art11'), entradaArtista('Art12')];
  const joyas = joyasEscondidas({ tracks, historial: h, ahora, marcas });
  assert.ok(joyas.length > 0);
  assert.ok(!joyas.some((x) => x.artista === 'Art11' || x.artista === 'Art12'));
  const mezcla = generarMezclaModos({ ejeA: 'chill', ejeB: 'metal', tracks: ts, historial: [], ahora, marcas: [entradaArtista('C1'), entradaArtista('M2')] });
  assert.ok(mezcla.length > 0);
  assert.ok(!mezcla.some((x) => x.artista === 'C1' || x.artista === 'M2'));
});
