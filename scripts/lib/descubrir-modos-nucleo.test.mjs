import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descubrirModosNucleo } from './descubrir-modos-nucleo.mjs';
import { crearEmbeberTermino } from './clasificar-embeddings-puro.mjs';

// "Modelo" de 4 dimensiones: rock → eje 0, pop → eje 1, lo demás casi nulo.
const embeber = async (texto) => {
  const t = texto.toLowerCase();
  if (t.includes('rock')) return Float32Array.from([1, 0, 0, 0]);
  if (t.includes('pop')) return Float32Array.from([0, 1, 0, 0]);
  return Float32Array.from([0, 0, 0.1, 0.1]);
};
const fuentes = { vocabulario: { sinonimos: {}, nombresHumanos: { rock: 'Rock', pop: 'Pop' } }, umbrales: { masaMinima: 2, masaMinimaPorcentaje: 1 } };

test('descubre sin fs: agrupa por evidencia y propaga por vector lo que no tiene', async () => {
  const tracks = [
    { id: 't1', artista: 'A', titulo: 'Uno' },
    { id: 't2', artista: 'B', titulo: 'Dos' },
    { id: 't3', artista: 'C', titulo: 'Tres' },
    { id: 't4', artista: 'D', titulo: 'Rockola' },
  ];
  const generos = new Map([['t1', ['rock']], ['t2', ['rock']], ['t3', ['pop']]]);
  const vectores = new Map();
  const deps = {
    embeber,
    embeberTermino: crearEmbeberTermino(embeber),
    async prepararVectores(ts, textoDe) {
      for (const t of ts) vectores.set(t.id, await embeber(textoDe(t)));
    },
    vectorDe: (id) => vectores.get(id) ?? null,
  };
  const r = await descubrirModosNucleo(tracks, generos, fuentes, deps, 4);
  assert.equal(r.modosCandidatos.length, 1);
  assert.equal(r.modosCandidatos[0].nombre, 'Rock');
  assert.deepEqual(new Set(r.modosCandidatos[0].trackIds), new Set(['t1', 't2', 't4']));
  assert.deepEqual(r.residuoSinModo.map((t) => t.id), ['t3']);
  assert.equal(vectores.size, 4);
});

test('deps.ejes: el texto del vector suma el mood de género, pero no cuenta como evidencia', async () => {
  const tracks = [
    { id: 't1', artista: 'A', titulo: 'Uno' },
    { id: 't2', artista: 'B', titulo: 'Dos', ejes: [{ ejeId: 'g-rock' }] },
  ];
  const textos = new Map();
  const deps = {
    ejes: [{ id: 'g-rock', nombre: 'Rock', familia: 'genero' }],
    embeber,
    embeberTermino: crearEmbeberTermino(embeber),
    async prepararVectores(ts, textoDe) {
      for (const t of ts) textos.set(t.id, textoDe(t));
    },
    vectorDe: () => null,
  };
  const r = await descubrirModosNucleo(tracks, new Map(), fuentes, deps, 2);
  assert.equal(textos.get('t2'), 'B — Dos. Géneros: Rock.');
  assert.equal(textos.get('t1'), 'A — Uno.');
  assert.equal(r.modosCandidatos.length, 0);
});
