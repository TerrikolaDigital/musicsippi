import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerUrl, detectarOrigen, esEnlaceCorto } from './enlace.js';

test('extrae la URL de un texto compartido con frase y emoji', () => {
  assert.equal(
    extraerUrl('Escucha esto 🎵 https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=a1b2c3 ¡te va a gustar!'),
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=a1b2c3'
  );
});

test('quita la puntuación pegada al final de la URL', () => {
  assert.equal(extraerUrl('(https://www.deezer.com/es/playlist/1313621735).'), 'https://www.deezer.com/es/playlist/1313621735');
  assert.equal(extraerUrl('mira: https://music.youtube.com/playlist?list=PLx1;'), 'https://music.youtube.com/playlist?list=PLx1');
});

test('acepta el URI de Spotify y devuelve null si no hay enlace', () => {
  assert.equal(extraerUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'), 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(extraerUrl('sin enlace aquí'), null);
  assert.equal(extraerUrl(undefined), null);
});

test('Spotify: con idioma en la ruta, parámetros o como URI', () => {
  const esperado = { origen: 'spotify', id: '37i9dQZF1DXcBWIGoYBM5M' };
  assert.deepEqual(detectarOrigen('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x'), esperado);
  assert.deepEqual(detectarOrigen('https://open.spotify.com/intl-es/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x&pt=y'), esperado);
  assert.deepEqual(detectarOrigen('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'), esperado);
});

test('YouTube y YouTube Music: el id sale de list=', () => {
  const esperado = { origen: 'youtube', id: 'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i' };
  for (const url of [
    'https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i&si=abc',
    'https://www.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
    'https://m.youtube.com/watch?v=fcnDmrtj6Sk&list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
    'https://youtu.be/fcnDmrtj6Sk?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
  ]) {
    assert.deepEqual(detectarOrigen(url), esperado, url);
  }
});

test('un mix automático de YouTube (RD…) no es una playlist importable', () => {
  assert.equal(detectarOrigen('https://www.youtube.com/watch?v=abc&list=RDabc'), null);
});

test('Deezer: con o sin idioma en la ruta', () => {
  assert.deepEqual(detectarOrigen('https://www.deezer.com/es/playlist/1313621735?utm_source=x'), { origen: 'deezer', id: '1313621735' });
  assert.deepEqual(detectarOrigen('https://deezer.com/playlist/1313621735'), { origen: 'deezer', id: '1313621735' });
});

test('Apple Music acepta playlists y álbumes; Amazon Music se reconoce para dar su aviso específico', () => {
  assert.deepEqual(detectarOrigen('https://music.apple.com/es/playlist/para-caminar/pl.u-123456789'), { origen: 'apple', id: 'https://music.apple.com/es/playlist/para-caminar/pl.u-123456789' });
  assert.deepEqual(detectarOrigen('https://music.apple.com/es/album/disco/123456789'), { origen: 'apple', id: 'https://music.apple.com/es/album/disco/123456789' });
  assert.deepEqual(detectarOrigen('https://music.amazon.es/playlists/B0ABCDEF'), { origen: 'amazon', id: 'https://music.amazon.es/playlists/B0ABCDEF' });
});

test('lo que no es una playlist devuelve null', () => {
  assert.equal(detectarOrigen('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy'), null);
  assert.equal(detectarOrigen('https://www.deezer.com/es/album/1214222'), null);
  assert.equal(detectarOrigen('https://example.com/playlist/1'), null);
  assert.equal(detectarOrigen('no es una url'), null);
  assert.equal(detectarOrigen(null), null);
});

test('reconoce los enlaces cortos que hay que resolver antes', () => {
  assert.equal(esEnlaceCorto('https://spotify.link/AbCdEf123'), true);
  assert.equal(esEnlaceCorto('https://spotify.app.link/AbCdEf123'), true);
  assert.equal(esEnlaceCorto('https://deezer.page.link/xYz123'), true);
  assert.equal(esEnlaceCorto('https://link.deezer.com/s/30abc'), true);
  assert.equal(esEnlaceCorto('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'), false);
  assert.equal(esEnlaceCorto('nada'), false);
});
