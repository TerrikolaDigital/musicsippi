import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMOS, animoPorId, coincidencias, modosParaAnimo, resolverAnimo, animoDisponible, etiquetaAnimo } from './animo.js';
import { rngDeSemilla } from './comun.js';
import { entradaArtista } from '../noMeGusta.js';

const ejes = [
  { id: 'chill', nombre: 'Chill', tipo: 'gusto', activo: true },
  { id: 'lounge', nombre: 'Lounge', tipo: 'gusto', activo: true },
  { id: 'edm', nombre: 'EDM Workout', tipo: 'gusto', activo: true },
  { id: 'focus', nombre: 'Focus Instrumental', tipo: 'funcional', activo: true },
  { id: 'sad', nombre: 'Melancholia', tipo: 'gusto', activo: true },
  { id: 'favoritos', nombre: 'Favoritas', sistema: true },
  { id: 'vacio', nombre: 'Chill vacío', tipo: 'gusto', activo: true },
];
const conteos = new Map([['chill', 5], ['lounge', 4], ['edm', 3], ['focus', 2], ['sad', 2], ['vacio', 0]]);
const mk = (id, artista, ...modos) => ({ id, titulo: id, artista, ejes: modos.map((ejeId) => ({ ejeId })) });
const tracks = [
  mk('a', 'A1', 'chill'), mk('b', 'A2', 'chill', 'lounge'), mk('c', 'A3', 'lounge'), mk('d', 'A4', 'edm'),
  mk('e', 'A5', 'focus'), mk('f', 'A6', 'sad'), mk('g', 'A7', 'chill'),
];

test('mapeo por palabras clave del nombre (sin tildes ni mayúsculas)', () => {
  const ids = (id) => modosParaAnimo(animoPorId(id), ejes, conteos).map((e) => e.id);
  assert.deepEqual(ids('tranquilo'), ['chill', 'lounge', 'focus'], 'Tranquilo absorbe Concentrado y Lofi');
  assert.deepEqual(ids('energia'), ['edm']);
  assert.deepEqual(ids('melancolico'), ['sad']);
  assert.equal(animoPorId('concentrado'), null);
  assert.equal(coincidencias(animoPorId('melancolico'), 'MELANCOLÍA'), 1);
});

test('los modos vacíos y de sistema no cuentan', () => {
  assert.ok(!modosParaAnimo(animoPorId('tranquilo'), ejes, conteos).some((e) => e.id === 'vacio'));
  assert.ok(ANIMOS.every((a) => !modosParaAnimo(a, ejes, conteos).some((e) => e.sistema)));
});

test('resolver con modos: solo canciones de esos modos, sin repetir', () => {
  const r = resolverAnimo(animoPorId('tranquilo'), { tracks, ejes, conteos, rng: rngDeSemilla('x') });
  assert.equal(r.origen, 'modos');
  assert.deepEqual(r.lista.map((t) => t.id).sort(), ['a', 'b', 'c', 'e', 'g']);
  assert.equal(etiquetaAnimo(animoPorId('tranquilo')), 'Ánimo: Zen');
});

test('sin modo que encaje: mezcla por similitud desde géneros', () => {
  const ejesGen = [
    { id: 'dream-pop', nombre: 'Dream Pop', tipo: 'gusto', activo: false },
    { id: 'rock', nombre: 'Rock', tipo: 'gusto', activo: false },
  ];
  const ts = [mk('p1', 'X1', 'dream-pop'), mk('p2', 'X2', 'dream-pop'), mk('p3', 'X3', 'dream-pop'), mk('q1', 'Y1', 'rock'), mk('q2', 'Y2', 'rock')];
  const vectores = [
    { trackId: 'p1', vector: [1, 0] }, { trackId: 'p2', vector: [1, 0.1] }, { trackId: 'p3', vector: [1, 0.2] },
    { trackId: 'q1', vector: [0.9, 0.3] }, { trackId: 'q2', vector: [0, 1] },
  ];
  const feliz = animoPorId('feliz');
  assert.ok(animoDisponible(feliz, { tracks: ts, ejes: ejesGen, conteos: new Map() }));
  const r = resolverAnimo(feliz, { tracks: ts, ejes: ejesGen, conteos: new Map(), vectores, rng: rngDeSemilla('y') });
  assert.equal(r.origen, 'similitud');
  assert.ok(r.lista.length >= 4);
  assert.ok(r.lista.some((t) => t.id === 'q1'));
});

test('sin nada que encaje: null y no disponible', () => {
  const a = animoPorId('fiesta');
  assert.equal(resolverAnimo(a, { tracks: [mk('z', 'Z', 'jazzx')], ejes: [], conteos: new Map() }), null);
  assert.ok(!animoDisponible(a, { tracks: [], ejes: [], conteos: new Map() }));
});

test('«No me gusta»: el ánimo no incluye artistas marcados', () => {
  const r = resolverAnimo(animoPorId('tranquilo'), { tracks, ejes, conteos, rng: rngDeSemilla('x'), marcas: [entradaArtista('A2')] });
  assert.deepEqual(r.lista.map((t) => t.id).sort(), ['a', 'c', 'e', 'g']);
});

test('un mood con chipId manda sobre las palabras clave del nombre', async () => {
  const { ANIMOS, modosParaAnimo, animoDisponible } = await import('./animo.js');
  const fiesta = ANIMOS.find((a) => a.id === 'fiesta');
  const ejes = [
    { id: 'de-fiesta', nombre: 'De fiesta', chipId: 'fiesta' },
    { id: 'chill-latino', nombre: 'Latino party' }, // casaría por palabras clave, pero hay uno declarado
  ];
  const conteos = new Map([['de-fiesta', 5], ['chill-latino', 40]]);
  assert.deepEqual(modosParaAnimo(fiesta, ejes, conteos).map((e) => e.id), ['de-fiesta']);
  // Si el declarado está vacío, se cae a las palabras clave.
  assert.deepEqual(modosParaAnimo(fiesta, ejes, new Map([['chill-latino', 40]])).map((e) => e.id), ['chill-latino']);
  assert.equal(animoDisponible(fiesta, { tracks: [], ejes, conteos }), true);
});

test('hay seis ánimos (rejilla 3 × 2) y el último es Dream', async () => {
  const { ANIMOS } = await import('./animo.js');
  assert.equal(ANIMOS.length, 6);
  assert.equal(ANIMOS[5].id, 'inspirado');
});
