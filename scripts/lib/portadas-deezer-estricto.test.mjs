import test from 'node:test';
import assert from 'node:assert/strict';
import { esCoincidencia, limpiarTitulo, artistasDe } from './portadas-deezer-estricto.mjs';

const item = (artista, titulo) => ({ artist: { name: artista }, title: titulo });

test('limpiarTitulo y artistasDe quitan ruido y separan colaboraciones', () => {
  assert.equal(limpiarTitulo('lovely (with Khalid)'), 'lovely');
  assert.equal(limpiarTitulo('luther - chill piano instrumental'), 'luther');
  assert.deepEqual(artistasDe('Sia & Kylie Minogue'), ['sia', 'kylie minogue']);
});

test('coincidencia estricta: acepta el mismo artista y tema; rechaza otro artista u otro tema', () => {
  assert.equal(esCoincidencia({ artista: 'Billie Eilish', titulo: 'lovely (with Khalid)' }, item('Billie Eilish', 'lovely')), true);
  assert.equal(esCoincidencia({ artista: 'Chilled Pig', titulo: 'luther - chill piano instrumental' }, item('Chilled Pig', 'luther (Piano Instrumental)')), true);
  assert.equal(esCoincidencia({ artista: 'Lowfie', titulo: 'blinding lights - instrumental lofi' }, item('Lawrie Martin', 'Blinding Lights')), false);
  assert.equal(esCoincidencia({ artista: 'Edward Ong', titulo: 'blue - guitar instrumental' }, item('Edward Ong', 'Blue Bird')), false);
  assert.equal(esCoincidencia({ artista: 'Lowfie', titulo: 'omg - instrumental lofi' }, item('Frank Mank Loc', 'OG')), false);
});
