import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debeMostrarAvisoImportar } from './aviso-importar.mjs';

function track(fuentes) {
  return { fuentes };
}

test('sin tracks (biblioteca recien instalada, antes de sembrar), no muestra el aviso', () => {
  assert.equal(debeMostrarAvisoImportar([]), false);
});

test('solo tracks de siembra, muestra el aviso', () => {
  const tracks = [track(['demo']), track(['demo'])];
  assert.equal(debeMostrarAvisoImportar(tracks), true);
});

test('mezcla de siembra y reales, no muestra el aviso (ya importo algo)', () => {
  const tracks = [track(['demo']), track(['tunemymusic'])];
  assert.equal(debeMostrarAvisoImportar(tracks), false);
});

test('solo tracks reales, no muestra el aviso', () => {
  const tracks = [track(['tunemymusic']), track(['local'])];
  assert.equal(debeMostrarAvisoImportar(tracks), false);
});

test('un track con varias fuentes, una de ellas demo, cuenta como demo', () => {
  // Caso real posible: un track de siembra que ademas se fusiono con un
  // import real por idTrack (aplicarFilasTuneMyMusic/aplicarArchivosLocales
  // le suman la fuente nueva al array existente, no lo reemplazan) --
  // ese track pasa a tener fuentes:['demo', 'tunemymusic'], y ya no cuenta
  // como "solo demo" para el otro lado de la condicion.
  const tracks = [track(['demo', 'tunemymusic'])];
  assert.equal(debeMostrarAvisoImportar(tracks), false);
});
