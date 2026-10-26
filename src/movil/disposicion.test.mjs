import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alturaInferior } from './disposicion.js';

test('sin canción solo se reserva la barra; con canción, barra + mini', () => {
  assert.equal(alturaInferior({ hayTrack: false }), 92);
  assert.equal(alturaInferior({ hayTrack: true }), 160);
});
