import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDeTrack, textoDeEje, ejesClasificables, clasificarPorEmbeddings, mejorCandidato, embeberTermino, UMBRAL_SCORE, MARGEN_MINIMO } from './clasificar-embeddings.mjs';
import { similitudCoseno } from './indice-vectores.mjs';

test('textoDeTrack arma un documento con todas las fuentes disponibles', () => {
  const track = { artista: 'Kordhell', titulo: 'Murder In My Mind' };
  const extras = { generos: ['drift phonk', 'phonk'], canal: 'Phonk Bassboosted', tags: ['workout'], descripcion: 'dark aggressive phonk' };
  const texto = textoDeTrack(track, extras);
  assert.match(texto, /Kordhell/);
  assert.match(texto, /Murder In My Mind/);
  assert.match(texto, /drift phonk/);
  assert.match(texto, /Phonk Bassboosted/);
});

test('textoDeTrack funciona sin ningun extra (solo artista y titulo)', () => {
  const texto = textoDeTrack({ artista: 'X', titulo: 'Y' }, {});
  assert.match(texto, /X/);
  assert.match(texto, /Y/);
});

test('textoDeEje arma un documento con nombre, generos y anclas', () => {
  const eje = { nombre: 'Phonk', tagsLastfm: ['phonk', 'drift phonk'], anclas: { artistas: ['Kordhell', 'Dxrk ダーク'] } };
  const texto = textoDeEje(eje);
  assert.match(texto, /Phonk/);
  assert.match(texto, /Kordhell/);
});

test('ejesClasificables filtra sistema, inactivos y tipos no validos', () => {
  const ejes = [
    { id: 'a', activo: true, sistema: false, tipo: 'gusto' },
    { id: 'b', activo: false, sistema: false, tipo: 'gusto' },
    { id: 'c', activo: true, sistema: true, tipo: 'gusto' },
    { id: 'd', activo: true, sistema: false, tipo: 'playlist' },
  ];
  const resultado = ejesClasificables(ejes);
  assert.deepEqual(resultado.map((e) => e.id), ['a']);
});

test('clasificarPorEmbeddings exige superar UMBRAL_SCORE', () => {
  const vectorTrack = new Float32Array([1, 0]);
  const embEjes = [{ ejeId: 'bajo', emb: new Float32Array([0, 1]) }];
  assert.equal(clasificarPorEmbeddings(vectorTrack, embEjes), null);
});

test('clasificarPorEmbeddings exige MARGEN_MINIMO entre el mejor y el segundo', () => {
  const vectorTrack = new Float32Array([1, 0]);
  const embEjes = [
    { ejeId: 'a', emb: new Float32Array([1, 0]) },
    { ejeId: 'b', emb: new Float32Array([0.99, 0.01]) },
  ];
  assert.equal(clasificarPorEmbeddings(vectorTrack, embEjes), null);
});

test('clasificarPorEmbeddings devuelve el mejor eje cuando hay margen claro', () => {
  const vectorTrack = new Float32Array([1, 0]);
  const embEjes = [
    { ejeId: 'a', emb: new Float32Array([1, 0]) },
    { ejeId: 'b', emb: new Float32Array([0, 1]) },
  ];
  const resultado = clasificarPorEmbeddings(vectorTrack, embEjes);
  assert.equal(resultado.ejeId, 'a');
  assert.ok(resultado.confianza >= UMBRAL_SCORE);
});

// mejorCandidato() es la variante sin umbral/margen que usa la sugerencia de
// ClasificacionAsistida (Tarea 17): a diferencia de clasificarPorEmbeddings,
// tiene que devolver SIEMPRE el mejor candidato (la persona decide si lo
// aprueba), incluso con score bajo o sin margen claro frente al segundo.
test('mejorCandidato devuelve el mejor candidato aunque no llegue a UMBRAL_SCORE', () => {
  const vectorTrack = new Float32Array([1, 0]);
  const embEjes = [{ ejeId: 'bajo', emb: new Float32Array([0, 1]) }];
  const resultado = mejorCandidato(vectorTrack, embEjes);
  assert.equal(resultado.ejeId, 'bajo');
  assert.ok(resultado.confianza < UMBRAL_SCORE);
});

test('mejorCandidato no exige MARGEN_MINIMO entre el mejor y el segundo', () => {
  const vectorTrack = new Float32Array([1, 0]);
  const embEjes = [
    { ejeId: 'a', emb: new Float32Array([1, 0]) },
    { ejeId: 'b', emb: new Float32Array([0.99, 0.01]) },
  ];
  const resultado = mejorCandidato(vectorTrack, embEjes);
  assert.equal(resultado.ejeId, 'a');
});

test('mejorCandidato devuelve null si no hay ejes para comparar', () => {
  const vectorTrack = new Float32Array([1, 0]);
  assert.equal(mejorCandidato(vectorTrack, []), null);
});

// Caso real que motivó este arreglo (ver
// docs/superpowers/specs/2026-09-09-umbral-clustering-terminos-design.md):
// medido en vivo, embeber "grunge" y "vallenato" sueltos daba 0.732 de
// similitud coseno pese a no tener ninguna relación real — por encima de
// UMBRAL_AGRUPACION_TERMINOS (0.44, en descubrir-modos.mjs), causando que
// agruparTerminos() los fusionara en un solo modo candidato. embeberTermino
// tiene que bajar ese par por debajo del umbral.
test('embeberTermino: terminos de genero sin relacion real dan similitud baja (grunge/vallenato)', async () => {
  const a = await embeberTermino('grunge');
  const b = await embeberTermino('vallenato');
  const score = similitudCoseno(a, b);
  assert.ok(score < 0.44, `esperaba similitud < 0.44, dio ${score}`);
});

// El arreglo no puede romper el caso que ya funcionaba: dos términos
// genuinamente relacionados tienen que seguir agrupándose.
test('embeberTermino: terminos de genero relacionados siguen dando similitud alta (rock/hard rock)', async () => {
  const a = await embeberTermino('rock');
  const b = await embeberTermino('hard rock');
  const score = similitudCoseno(a, b);
  assert.ok(score >= 0.44, `esperaba similitud >= 0.44, dio ${score}`);
});
