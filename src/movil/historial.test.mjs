import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorDia, rankingCanciones, rankingModos, trackDeEntrada, colaDesde, claveDeHistorial } from './historial.js';

const hoy = new Date(2026, 9, 14, 15, 0);
const ts = (d, h) => new Date(2026, 9, d, h).getTime();

test('agrupa en Hoy, Ayer y fecha', () => {
  const g = agruparPorDia([{ ts: ts(14, 10) }, { ts: ts(13, 22) }, { ts: ts(10, 9) }, { ts: ts(14, 12) }], hoy);
  assert.deepEqual(g.map((x) => x.etiqueta), ['Hoy', 'Ayer', '10 de octubre']);
  assert.equal(g[0].entradas[0].ts, ts(14, 12));
});
test('vacío', () => {
  assert.deepEqual(agruparPorDia([], hoy), []);
});

test('una vista previa antigua recupera vídeo, portada y búsqueda desde su id', () => {
  const t = trackDeEntrada({ trackId: 'preview-abc123', titulo: 'These Walls', artista: 'Dua Lipa' });
  assert.equal(t.id, 'preview-abc123');
  assert.equal(t.youtubeVideoId, 'abc123');
  assert.equal(t.coverUrl, 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  assert.equal(t.youtubeQuery, 'Dua Lipa These Walls');
});
test('lo guardado en la entrada manda sobre lo deducido', () => {
  const t = trackDeEntrada({ trackId: 'preview-abc123', videoId: 'otro', coverUrl: 'https://x/c.jpg', titulo: 'T', artista: 'A' });
  assert.equal(t.youtubeVideoId, 'otro');
  assert.equal(t.coverUrl, 'https://x/c.jpg');
});
test('una canción sin vídeo conocido se puede buscar', () => {
  const t = trackDeEntrada({ trackId: 'abc', titulo: 'T', artista: 'A' });
  assert.equal(t.youtubeVideoId, undefined);
  assert.equal(t.coverUrl, undefined);
  assert.equal(t.youtubeQuery, 'A T');
});
test('sin título no hay canción', () => {
  assert.equal(trackDeEntrada({ trackId: 'abc' }), null);
});
test('la cola empieza en la tocada, sigue con las anteriores y no repite canciones', () => {
  const e = (id) => ({ track: { id } });
  const entradas = [e('a'), e('b'), e('a'), e('c'), e('b'), e('d')];
  assert.deepEqual(colaDesde(entradas, entradas[2]).map((t) => t.id), ['a', 'c', 'b', 'd']);
});
test('la cola usa el mismo objeto de la canción tocada: cargarCola la busca con indexOf', () => {
  const entradas = [{ track: { id: 'a' } }, { track: { id: 'b' } }];
  assert.equal(colaDesde(entradas, entradas[1])[0], entradas[1].track);
});

test('ranking de canciones: cuenta por trackId, desempata por orden y prefiere la copia de la biblioteca', () => {
  const entradas = [
    { trackId: 'a', track: { id: 'hist-a' }, enBiblioteca: false },
    { trackId: 'b', track: { id: 'b' }, enBiblioteca: true },
    { trackId: 'a', track: { id: 'a' }, enBiblioteca: true },
    { trackId: 'a', track: { id: 'hist-a2' }, enBiblioteca: false },
    { trackId: 'c', track: { id: 'c' }, enBiblioteca: true },
  ];
  const r = rankingCanciones(entradas);
  assert.deepEqual(r.map((x) => [x.track.id, x.n]), [['a', 3], ['b', 1], ['c', 1]]);
  assert.equal(r[0].enBiblioteca, true);
  assert.equal(rankingCanciones(entradas, 2).length, 2);
});

test('ranking de modos: ignora modos borrados y entradas sin modo', () => {
  const entradas = [
    { ejeId: 'rock', ejeNombre: 'Rock' },
    { ejeId: 'chill', ejeNombre: 'Chill' },
    { ejeId: 'rock', ejeNombre: 'Rock' },
    { ejeId: 'viejo', ejeNombre: 'Viejo' },
    {},
  ];
  const r = rankingModos(entradas, [{ id: 'rock' }, { id: 'chill' }]);
  assert.deepEqual(r, [{ ejeId: 'rock', nombre: 'Rock', n: 2 }, { ejeId: 'chill', nombre: 'Chill', n: 1 }]);
});

test('ranking de canciones: la misma canción con ids distintos suma en una sola fila', () => {
  const dance = { titulo: 'Dance Alone', artista: 'Sia' };
  const entradas = [
    { trackId: 'preview-v1', track: { id: 'preview-v1', ...dance }, enBiblioteca: false },
    { trackId: 'lib1', track: { id: 'lib1', ...dance, artista: 'Sia, Kylie Minogue' }, enBiblioteca: true },
    { trackId: 'preview-v2', track: { id: 'preview-v2', ...dance, titulo: 'Dance Alone (with Kylie Minogue)' }, enBiblioteca: false },
    { trackId: 'otra', track: { id: 'otra', titulo: 'Otra', artista: 'Sia' }, enBiblioteca: true },
  ];
  const r = rankingCanciones(entradas);
  assert.deepEqual(r.map((x) => [x.track.id, x.n]), [['lib1', 3], ['otra', 1]]);
  assert.equal(r[0].enBiblioteca, true);
});

const claveDe = (titulo) => claveDeHistorial({ trackId: titulo, titulo, artista: 'Ana' });

test('claveDeHistorial: remixes, directos y partes son grabaciones distintas', () => {
  assert.notEqual(claveDe('Love Again'), claveDe('Love Again (Horse Meat Disco Remix) [Mixed]'));
  assert.notEqual(claveDe('2U (feat. Justin Bieber)'), claveDe('2U (feat. Justin Bieber) (R3HAB Remix)'));
  assert.notEqual(claveDe('2U (feat. Justin Bieber) (Seeb Remix)'), claveDe('2U (feat. Justin Bieber) (R3HAB Remix)'));
  assert.notEqual(claveDe('New Direction [Intro]'), claveDe('New Direction [Outro]'));
  assert.notEqual(claveDe('Thinking out Loud'), claveDe('Thinking out Loud (Live)'));
  assert.notEqual(claveDe('Thinking out Loud'), claveDe('Thinking out Loud (Instrumental Version)'));
});

test('claveDeHistorial: el mismo tema con otra etiqueta sigue unido', () => {
  assert.equal(claveDe('2U'), claveDe('2U (feat. Justin Bieber)'));
  assert.equal(claveDe('Chicago'), claveDe('Chicago [The Politician Soundtrack Theme Song — OFFICIAL AUDIO]'));
  assert.equal(claveDe('thank u, next'), claveDe('thank u next'));
  assert.equal(claveDe('Uno'), claveDe('Uno (feat. Mix Master Mike)'));
  assert.equal(claveDe('Uno (Remix)'), claveDe('UNO [remix]'));
});

test('claveDeHistorial: sin título agrupa por id', () => {
  assert.equal(claveDeHistorial({ trackId: 'x' }), 'x');
  assert.equal(claveDeHistorial({ trackId: 'x', titulo: 'Uno', artista: 'Ana' }), claveDeHistorial({ trackId: 'y', titulo: 'UNO', artista: 'Ana' }));
});
