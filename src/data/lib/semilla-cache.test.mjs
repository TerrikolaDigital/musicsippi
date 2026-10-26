import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entradasSemillaQueFaltan } from './semilla-cache.js';

test('siembra solo lo que falta, sin la clave version ni lo ya resuelto', () => {
  const semilla = { version: 3, t1: 'aaa', t2: { videoId: 'bbb' }, t3: 'ccc' };
  assert.deepEqual(entradasSemillaQueFaltan(semilla, new Set(['t3'])), [
    { trackId: 't1', videoId: 'aaa' },
    { trackId: 't2', videoId: 'bbb' },
  ]);
});
