// src/movil/compartir.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capaParaTextoCompartido, abrirTextoCompartido } from './compartir.js';

test('un texto compartido abre la hoja de añadir música con ese texto', () => {
  assert.deepEqual(capaParaTextoCompartido('  Mira https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M  '), {
    tipo: 'hoja',
    config: 'anadir',
    texto: 'Mira https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
  });
});

test('vacío no abre nada; un texto enorme se recorta', () => {
  assert.equal(capaParaTextoCompartido('   '), null);
  assert.equal(capaParaTextoCompartido(undefined), null);
  assert.equal(capaParaTextoCompartido('x'.repeat(5000)).texto.length, 2000);
});

test('con una hoja ya abierta se sustituye; sin hoja se abre', () => {
  const llamadas = [];
  const nav = (capas) => ({
    capas,
    abrirCapa: (c) => llamadas.push(['abrir', c.config]),
    cambiarCapa: (c) => llamadas.push(['cambiar', c.config]),
  });
  assert.equal(abrirTextoCompartido(nav([{ tipo: 'hoja', config: 'sueno' }]), 'https://x.y/z'), true);
  assert.equal(abrirTextoCompartido(nav([{ tipo: 'reproductor' }]), 'https://x.y/z'), true);
  assert.equal(abrirTextoCompartido(nav([]), '  '), false);
  assert.deepEqual(llamadas, [['cambiar', 'anadir'], ['abrir', 'anadir']]);
});
