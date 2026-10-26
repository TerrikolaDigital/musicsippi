import test from 'node:test';
import assert from 'node:assert/strict';
import { azar01, mezclar, barajarConMemoria, barajarSeparandoArtistas, ultimaVezDeHistorial } from './barajar.js';

const DIA = 86400000;
const ahora = 1_800_000_000_000;

test('azar01 está en [0, 1) y no es constante', () => {
  const xs = Array.from({ length: 1000 }, azar01);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.ok(new Set(xs).size > 990);
});

test('mezclar conserva los elementos', () => {
  assert.deepEqual(mezclar([1, 2, 3, 4, 5]).sort(), [1, 2, 3, 4, 5]);
});

test('barajarConMemoria: la primera se reparte de forma uniforme entre las no recientes', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `n${i}`); // nunca sonaron o hace mucho (mismo peso)
  const ultima = new Map(ids.map((id, i) => (i % 2 ? [id, ahora - 90 * DIA] : [id, ahora - 200 * DIA])));
  const cuenta = new Map();
  const N = 30000;
  for (let k = 0; k < N; k += 1) {
    const p = barajarConMemoria(ids, ultima, ahora)[0];
    cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
  }
  for (const id of ids) {
    const f = (cuenta.get(id) ?? 0) / N;
    assert.ok(Math.abs(f - 0.1) < 0.02, `${id}: ${f}`);
  }
});

test('barajarConMemoria: las recientes quedan siempre al final', () => {
  const viejas = Array.from({ length: 8 }, (_, i) => `v${i}`);
  const recientes = ['r0', 'r1', 'r2'];
  const ultima = new Map(recientes.map((id) => [id, ahora - DIA]));
  for (let k = 0; k < 500; k += 1) {
    const r = barajarConMemoria([...recientes, ...viejas], ultima, ahora);
    assert.equal(r.length, 11);
    assert.ok(r.slice(8).every((id) => id.startsWith('r')), r.join());
  }
});

test('barajarConMemoria: las que llevan más tiempo sin sonar salen antes (sin dejar de ser azar)', () => {
  const ids = ['nunca', 'poco'];
  const ultima = new Map([['poco', ahora - 4 * DIA]]);
  let nunca = 0;
  const N = 20000;
  for (let k = 0; k < N; k += 1) if (barajarConMemoria(ids, ultima, ahora)[0] === 'nunca') nunca += 1;
  const f = nunca / N;
  assert.ok(f > 0.55 && f < 0.85, `nunca primera: ${f}`);
});

test('barajarConMemoria: determinista con un rnd dado y sin tocar la entrada', () => {
  const ids = ['a', 'b', 'c'];
  const copia = [...ids];
  const a = barajarConMemoria(ids, new Map(), ahora, () => 0.5);
  assert.deepEqual(ids, copia);
  assert.equal(a.length, 3);
});

test('barajarSeparandoArtistas: conserva todo, separa artistas y deja las recientes al final', () => {
  const tracks = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, artista: 'A' })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, artista: `B${i}` })),
    { id: 'rec', artista: 'C' },
  ];
  const ultima = new Map([['rec', ahora - DIA]]);
  for (let k = 0; k < 200; k += 1) {
    const r = barajarSeparandoArtistas(tracks, ultima, ahora);
    assert.deepEqual(r.map((t) => t.id).sort(), tracks.map((t) => t.id).sort());
    for (let i = 1; i < r.length; i += 1) {
      if (r[i].artista === 'A' && r[i - 1].artista === 'A') assert.ok(r.slice(i).every((t) => t.artista === 'A' || t.id === 'rec'));
    }
    assert.ok(r.findIndex((t) => t.id === 'rec') >= 9);
  }
});

test('ultimaVezDeHistorial se queda con la más reciente', () => {
  const m = ultimaVezDeHistorial([{ trackId: 'x', ts: 5 }, { trackId: 'x', ts: 9 }, { trackId: 'y', ts: 1 }, {}]);
  assert.equal(m.get('x'), 9);
  assert.equal(m.get('y'), 1);
  assert.equal(m.size, 2);
});
