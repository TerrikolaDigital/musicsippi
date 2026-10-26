import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearEmbedSpotify, leerPlaylist, LIMITE_EMBED } from './spotify.js';

const fixture = (n) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');

test('lee nombre, portada y canciones del embed', () => {
  const r = parsearEmbedSpotify(fixture('spotify-embed.html'));
  assert.equal(r.nombre, 'All Out 2010s');
  assert.match(r.portada, /^https:\/\/i\.scdn\.co\/image\//);
  assert.equal(r.filas.length, 3);
  assert.deepEqual(r.filas[0], {
    titulo: 'Beauty And A Beat',
    artista: 'Justin Bieber, Nicki Minaj',
    album: '',
    playlist: 'All Out 2010s',
    tipo: 'Track',
  });
  assert.equal(r.aviso, null);
});

test('la página 404 de Spotify (con HTTP 200) es una playlist privada o inexistente', () => {
  assert.throws(() => parsearEmbedSpotify(fixture('spotify-404.html')), (e) => e.codigo === 'privada');
});

test('sin __NEXT_DATA__ o sin trackList es que Spotify cambió el formato', () => {
  assert.throws(() => parsearEmbedSpotify('<html></html>'), (e) => e.codigo === 'formato-cambiado');
  const sinLista = fixture('spotify-embed.html').replace('"trackList"', '"otraCosa"');
  assert.throws(() => parsearEmbedSpotify(sinLista), (e) => e.codigo === 'formato-cambiado');
});

test('una playlist sin canciones es vacía', () => {
  const vacia = fixture('spotify-embed.html').replace(/"trackList":\[.*\]\}\},"settings"/, '"trackList":[]}},"settings"');
  assert.throws(() => parsearEmbedSpotify(vacia), (e) => e.codigo === 'vacia');
});

test('con 100 canciones avisa de que Spotify no deja leer más', () => {
  const html = fixture('spotify-embed.html');
  const datos = JSON.parse(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
  const pista = datos.props.pageProps.state.data.entity.trackList[2];
  datos.props.pageProps.state.data.entity.trackList = Array.from({ length: LIMITE_EMBED }, (_, i) => ({ ...pista, title: `Canción ${i}` }));
  const r = parsearEmbedSpotify(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(datos)}</script>`);
  assert.equal(r.filas.length, 100);
  assert.match(r.aviso, /100 primeras/);
});

test('el espacio duro entre artistas se normaliza', () => {
  const html = fixture('spotify-embed.html').replace('Justin Bieber, Nicki Minaj', 'Justin Bieber,\\u00a0Nicki Minaj');
  assert.equal(parsearEmbedSpotify(html).filas[0].artista, 'Justin Bieber, Nicki Minaj');
});

test('leerPlaylist pide el embed con un User-Agent de navegador', async () => {
  const pedidas = [];
  const http = {
    async get(url, opciones) {
      pedidas.push({ url, opciones });
      return { status: 200, texto: fixture('spotify-embed.html'), url };
    },
  };
  const r = await leerPlaylist('37i9dQZF1DX5Ejj0EkURtP', http);
  assert.equal(r.filas.length, 3);
  assert.equal(pedidas[0].url, 'https://open.spotify.com/embed/playlist/37i9dQZF1DX5Ejj0EkURtP');
  assert.match(pedidas[0].opciones.headers['User-Agent'], /^Mozilla\/5\.0/);
});
