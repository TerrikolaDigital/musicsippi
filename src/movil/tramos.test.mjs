// src/movil/tramos.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tramoVisible, TRAMO } from './tramos.js';

test('empieza con un tramo y no supera el total', () => {
  assert.equal(TRAMO, 60);
  assert.equal(tramoVisible(800, 0, false), 60);
  assert.equal(tramoVisible(20, 0, false), 20);
});
test('crece de a un tramo al acercarse al final', () => {
  assert.equal(tramoVisible(800, 60, true), 120);
  assert.equal(tramoVisible(800, 60, false), 60);
  assert.equal(tramoVisible(100, 60, true), 100);
});
