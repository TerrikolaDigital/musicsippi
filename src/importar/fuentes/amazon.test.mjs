import test from 'node:test';
import assert from 'node:assert/strict';
import { leerPlaylist } from './amazon.js';

test('Amazon Music explica que sus listas no se pueden leer sin iniciar sesión', async () => {
  await assert.rejects(leerPlaylist('https://music.amazon.es/playlists/x'), (e) => e.codigo === 'amazon-login');
});
