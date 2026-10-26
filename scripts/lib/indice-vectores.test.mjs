import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  asegurarVectores, cargarIndice, vectorDe, centroideDe, masCercanos, similitudCoseno,
} from './indice-vectores.mjs';

function dirTemporal() {
  return mkdtempSync(join(tmpdir(), 'vectores-test-'));
}

function embeberFalso(texto) {
  const v = new Float32Array(4);
  for (let i = 0; i < texto.length; i++) v[i % 4] += texto.charCodeAt(i);
  const norma = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  for (let i = 0; i < 4; i++) v[i] /= norma;
  return Promise.resolve(v);
}

test('similitudCoseno: vector consigo mismo da 1', () => {
  const v = new Float32Array([1, 0, 0, 0]);
  assert.equal(similitudCoseno(v, v), 1);
});

test('asegurarVectores crea el indice y permite leerlo de vuelta', async () => {
  const dataDir = dirTemporal();
  const tracks = [{ id: 'a1', texto: 'phonk agresivo' }, { id: 'a2', texto: 'balada acustica' }];
  await asegurarVectores(dataDir, tracks, (t) => t.texto, embeberFalso);

  const indice = cargarIndice(dataDir);
  assert.equal(Object.keys(indice.tracks).length, 2);

  const v1 = vectorDe(dataDir, 'a1', indice);
  assert.equal(v1.length, 4);
  rmSync(dataDir, { recursive: true, force: true });
});

test('asegurarVectores no vuelve a embeber un track sin cambios', async () => {
  const dataDir = dirTemporal();
  const tracks = [{ id: 'a1', texto: 'phonk agresivo' }];
  let llamadas = 0;
  const embeberContado = async (t) => { llamadas++; return embeberFalso(t); };

  await asegurarVectores(dataDir, tracks, (t) => t.texto, embeberContado);
  assert.equal(llamadas, 1);

  await asegurarVectores(dataDir, tracks, (t) => t.texto, embeberContado);
  assert.equal(llamadas, 1, 're-corrida sin cambios no debe re-embeber');
  rmSync(dataDir, { recursive: true, force: true });
});

test('asegurarVectores re-embebe cuando el texto de un track cambia', async () => {
  const dataDir = dirTemporal();
  let llamadas = 0;
  const embeberContado = async (t) => { llamadas++; return embeberFalso(t); };

  await asegurarVectores(dataDir, [{ id: 'a1', texto: 'v1' }], (t) => t.texto, embeberContado);
  await asegurarVectores(dataDir, [{ id: 'a1', texto: 'v2 distinto' }], (t) => t.texto, embeberContado);
  assert.equal(llamadas, 2);
  rmSync(dataDir, { recursive: true, force: true });
});

test('centroideDe promedia los vectores de varios tracks', async () => {
  const dataDir = dirTemporal();
  const vectorA1 = new Float32Array([1, 2, 3, 4]);
  const vectorA2 = new Float32Array([5, 6, 7, 8]);
  const vectoresFijos = { a1: vectorA1, a2: vectorA2 };
  const embeberFijo = (t) => Promise.resolve(vectoresFijos[t]);
  const tracks = [{ id: 'a1', texto: 'a1' }, { id: 'a2', texto: 'a2' }];
  await asegurarVectores(dataDir, tracks, (t) => t.texto, embeberFijo);

  const centroide = centroideDe(dataDir, ['a1', 'a2']);
  assert.equal(centroide.length, 4);
  assert.deepEqual(Array.from(centroide), [3, 4, 5, 6], 'debe ser el promedio elemento a elemento');
  rmSync(dataDir, { recursive: true, force: true });
});

test('vectorDe devuelve null para un trackId nunca embebido', async () => {
  const dataDir = dirTemporal();
  const tracks = [{ id: 'a1', texto: 'phonk agresivo' }];
  await asegurarVectores(dataDir, tracks, (t) => t.texto, embeberFalso);

  const v = vectorDe(dataDir, 'inexistente');
  assert.equal(v, null);
  rmSync(dataDir, { recursive: true, force: true });
});

test('centroideDe con lista vacia devuelve null', async () => {
  const dataDir = dirTemporal();
  const tracks = [{ id: 'a1', texto: 'phonk agresivo' }];
  await asegurarVectores(dataDir, tracks, (t) => t.texto, embeberFalso);

  const centroide = centroideDe(dataDir, []);
  assert.equal(centroide, null);
  rmSync(dataDir, { recursive: true, force: true });
});

test('centroideDe con trackIds que no existen en el indice devuelve null', async () => {
  const dataDir = dirTemporal();
  const tracks = [{ id: 'a1', texto: 'phonk agresivo' }];
  await asegurarVectores(dataDir, tracks, (t) => t.texto, embeberFalso);

  const centroide = centroideDe(dataDir, ['inexistente1', 'inexistente2']);
  assert.equal(centroide, null);
  rmSync(dataDir, { recursive: true, force: true });
});

test('masCercanos ordena por similitud descendente y respeta el filtro', async () => {
  const dataDir = dirTemporal();
  const tracks = [
    { id: 'a1', texto: 'phonk agresivo' },
    { id: 'a2', texto: 'phonk agresivo bassboosted' },
    { id: 'a3', texto: 'balada acustica triste' },
  ];
  await asegurarVectores(dataDir, tracks, (t) => t.texto, embeberFalso);
  const vRef = vectorDe(dataDir, 'a1');

  const resultado = masCercanos(dataDir, vRef, 2, (trackId) => trackId !== 'a1');
  assert.equal(resultado.length, 2);
  assert.equal(resultado[0].trackId, 'a2', 'a2 comparte mas texto con a1 que a3');
  rmSync(dataDir, { recursive: true, force: true });
});

test('asegurarVectores con solo una parte de las canciones conserva los vectores de las demás', async () => {
  const dataDir = dirTemporal();
  const tracks = [{ id: 'a1', texto: 'phonk agresivo' }, { id: 'a2', texto: 'balada acustica' }, { id: 'a3', texto: 'tango viejo' }];
  await asegurarVectores(dataDir, tracks, (t) => t.texto, embeberFalso);
  const antes = vectorDe(dataDir, 'a3');

  let embebidos = 0;
  const contado = (texto) => { embebidos++; return embeberFalso(texto); };
  await asegurarVectores(dataDir, [{ id: 'a1', texto: 'phonk muy agresivo' }], (t) => t.texto, contado);

  const indice = cargarIndice(dataDir);
  assert.equal(embebidos, 1);
  assert.deepEqual(Object.keys(indice.tracks).sort(), ['a1', 'a2', 'a3']);
  assert.deepEqual(vectorDe(dataDir, 'a3', indice), antes);
  assert.deepEqual(vectorDe(dataDir, 'a1', indice), await embeberFalso('phonk muy agresivo'));
  rmSync(dataDir, { recursive: true, force: true });
});
