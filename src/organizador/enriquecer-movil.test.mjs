import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  datosDeBusquedaDeezer,
  generosDeAlbumDeezer,
  enriquecerDeezerPendientes,
  enriquecerMusicbrainzPendientes,
  ESPERA_MB_MS,
  enriquecerRitmoPendientes,
  enriquecerMusicbrainzDetallePendientes,
  coincideArtistaDeezer,
  datosDeRitmoDeezer,
} from './enriquecer-movil.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';

const fixture = (n) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');
const ok = (texto) => ({ status: 200, texto, url: '' });
const track = (id, artista, titulo, fuentes = ['movil']) => ({ id, artista, titulo, fuentes, ejes: [{ ejeId: 'sin-clasificar' }] });
const sinEsperar = async () => {};

function httpFalso(rutas) {
  const llamadas = [];
  return {
    llamadas,
    async get(url, opciones = {}) {
      llamadas.push({ url, opciones });
      for (const [prefijo, respuesta] of rutas) if (url.startsWith(prefijo)) return typeof respuesta === 'function' ? respuesta(url) : respuesta;
      return { status: 404, texto: '{}', url };
    },
  };
}

test('Deezer: portada, foto y géneros traducidos por id del género', () => {
  assert.deepEqual(datosDeBusquedaDeezer(JSON.parse(fixture('deezer-busqueda.json'))), {
    albumId: 1214222,
    album: 'Me Verás Volver (Hits & Más)',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/c8740ff412c45180d98441c84159f232/500x500-000000-80-0-0.jpg',
    fotoArtista: 'https://cdn-images.dzcdn.net/images/artist/7c8fb9b4135ea113a18d7380686bc764/500x500-000000-80-0-0.jpg',
  });
  assert.deepEqual(generosDeAlbumDeezer(JSON.parse(fixture('deezer-album.json'))), ['rock']);
  assert.deepEqual(generosDeAlbumDeezer({ genres: { data: [{ id: 169, name: 'Soul & Funk' }, { id: 95, name: 'Niños' }] } }), ['soul', 'funk']);
  assert.equal(datosDeBusquedaDeezer({ data: [] }), null);
});

test('Deezer solo consulta lo añadido en el móvil y no repite lo ya consultado', async () => {
  const almacen = crearAlmacenMemoria({ biblioteca: [track('a', 'Soda Stereo', 'Persiana americana'), track('pc', 'X', 'Y', ['tunemymusic'])] });
  const http = httpFalso([
    ['https://api.deezer.com/search', ok(fixture('deezer-busqueda.json'))],
    ['https://api.deezer.com/album/1214222', ok(fixture('deezer-album.json'))],
  ]);
  const r = await enriquecerDeezerPendientes({ almacen, http, esperar: sinEsperar });
  assert.deepEqual(r, { procesadas: 1, conGeneros: 1 });
  assert.deepEqual(await almacen.obtenerPorClave('generos', 'a'), { trackId: 'a', deezerBuscado: true, generosDeezer: ['rock'] });
  assert.match((await almacen.obtenerPorClave('metadataLocal', 'a')).coverUrl, /c8740ff412c45180d98441c84159f232/);
  assert.equal(http.llamadas.length, 2);
  await enriquecerDeezerPendientes({ almacen, http, esperar: sinEsperar });
  assert.equal(http.llamadas.length, 2);
});

test('si falla la red, la canción queda pendiente para la siguiente pasada', async () => {
  const almacen = crearAlmacenMemoria({ biblioteca: [track('a', 'Soda Stereo', 'Persiana americana')] });
  const sinRed = { get: async () => { throw new Error('sin red'); } };
  await enriquecerDeezerPendientes({ almacen, http: sinRed, esperar: sinEsperar });
  assert.equal(await almacen.obtenerPorClave('generos', 'a'), undefined);
});

test('MusicBrainz: géneros del artista (filtrados), User-Agent y 1 petición cada 1600 ms', async () => {
  const almacen = crearAlmacenMemoria({
    biblioteca: [track('a', 'Soda Stereo', 'Persiana americana'), track('b', 'Soda Stereo, Gustavo Cerati', 'Persiana americana')],
  });
  const esperas = [];
  const http = httpFalso([
    ['https://musicbrainz.org/ws/2/recording/', ok(fixture('mb-recording.json'))],
    ['https://musicbrainz.org/ws/2/artist/', ok(fixture('mb-artista.json'))],
  ]);
  const r = await enriquecerMusicbrainzPendientes({ almacen, http, esperar: async (ms) => esperas.push(ms) });
  assert.deepEqual(r, { procesadas: 2, conGeneros: 2 });
  const reg = await almacen.obtenerPorClave('generos', 'a');
  assert.deepEqual(reg.generosMB, ['alternative rock', 'latin rock', 'new wave']);
  assert.equal(reg.artistaMbid, '3f8a5e5b-c24b-4068-9f1c-afad8829e06b');
  assert.equal(http.llamadas.filter((l) => l.url.includes('/artist/')).length, 1, 'el artista se consulta una vez');
  assert.ok(http.llamadas.every((l) => l.opciones.headers['User-Agent'] === 'Musicsippi/1.0 ( terrikoladigital@gmail.com )'));
  assert.ok(http.llamadas.filter((l) => l.url.includes('/recording/')).every((l) => l.url.includes(encodeURIComponent('artist:"Soda Stereo"'))));
  assert.ok(esperas.length >= 3 && esperas.every((ms) => ms === ESPERA_MB_MS));
});

test('MusicBrainz caído: tras 3 fallos seguidos deja el resto para la próxima pasada', async () => {
  const almacen = crearAlmacenMemoria({ biblioteca: [1, 2, 3, 4, 5].map((n) => track(`t${n}`, 'A', `T${n}`)) });
  const http = httpFalso([['https://musicbrainz.org', { status: 503, texto: '', url: '' }]]);
  await enriquecerMusicbrainzPendientes({ almacen, http, esperar: sinEsperar });
  assert.equal((await almacen.obtenerTodos('generos')).length, 0);
  const consultadas = new Set(http.llamadas.map((l) => /T\d/.exec(decodeURIComponent(l.url))?.[0]));
  assert.equal(consultadas.size, 3);
});

const rutasMB = () => [
  ['https://musicbrainz.org/ws/2/recording/', ok(fixture('mb-recording.json'))],
  ['https://musicbrainz.org/ws/2/artist/', ok(fixture('mb-artista.json'))],
];

test('MusicBrainz no repite: una segunda pasada con el mismo almacén no hace peticiones', async () => {
  const almacen = crearAlmacenMemoria({ biblioteca: [track('a', 'Soda Stereo', 'Persiana americana')] });
  const http = httpFalso(rutasMB());
  await enriquecerMusicbrainzPendientes({ almacen, http, esperar: sinEsperar });
  const antes = http.llamadas.length;
  assert.ok(antes > 0);
  const r = await enriquecerMusicbrainzPendientes({ almacen, http, esperar: sinEsperar });
  assert.deepEqual(r, { procesadas: 0, conGeneros: 0 });
  assert.equal(http.llamadas.length, antes);
});

test('MusicBrainz salta la canción con mbBuscado precargado', async () => {
  const almacen = crearAlmacenMemoria({
    biblioteca: [track('a', 'Soda Stereo', 'Persiana americana'), track('b', 'Soda Stereo', 'Otra')],
    generos: [{ trackId: 'a', mbBuscado: true, generosMB: ['rock'] }],
  });
  const http = httpFalso(rutasMB());
  const r = await enriquecerMusicbrainzPendientes({ almacen, http, esperar: sinEsperar });
  assert.equal(r.procesadas, 1);
  assert.ok(http.llamadas.filter((l) => l.url.includes('/recording/')).every((l) => !l.url.includes('Persiana')));
  assert.deepEqual((await almacen.obtenerPorClave('generos', 'a')).generosMB, ['rock']);
});

test('MusicBrainz guarda la caché de artistas al instante: si la app se cierra a mitad no se repite', async () => {
  const base = crearAlmacenMemoria({
    biblioteca: [track('a', 'Soda Stereo', 'Persiana americana'), track('b', 'Soda Stereo', 'Persiana americana')],
  });
  const cortado = {
    ...base,
    async guardarRegistro(n, v) {
      if (n === 'generos' && v.trackId === 'b') throw new Error('app cerrada');
      return base.guardarRegistro(n, v);
    },
  };
  const http = httpFalso(rutasMB());
  await assert.rejects(enriquecerMusicbrainzPendientes({ almacen: cortado, http, esperar: sinEsperar }), /app cerrada/);
  assert.deepEqual((await base.obtenerValorConfig('artistasMB', {}))['3f8a5e5b-c24b-4068-9f1c-afad8829e06b'], ['alternative rock', 'latin rock', 'new wave']);
  const artistasAntes = http.llamadas.filter((l) => l.url.includes('/artist/')).length;
  await enriquecerMusicbrainzPendientes({ almacen: base, http, esperar: sinEsperar });
  assert.equal(http.llamadas.filter((l) => l.url.includes('/artist/')).length, artistasAntes);
});

// --- Ritmo (bpm) de Deezer -------------------------------------------------------------------
const busquedaDeezer = (artista) => JSON.stringify({ data: [{ id: 777, title: 'x', artist: { name: artista } }] });

test('ritmo: bpm y gain de /track/{id}; bpm 0 = Deezer no lo sabe', () => {
  assert.deepEqual(datosDeRitmoDeezer({ bpm: 123.4, gain: -7.2 }), { bpm: 123.4, gain: -7.2 });
  assert.deepEqual(datosDeRitmoDeezer({ bpm: 0, gain: -6.1 }), { bpm: null, gain: -6.1 });
  assert.equal(datosDeRitmoDeezer({ error: { code: 800 } }), null);
  assert.equal(coincideArtistaDeezer(JSON.parse(busquedaDeezer('Soda Stereo')), { artista: 'Soda Stereo, Gustavo Cerati' }), true);
  assert.equal(coincideArtistaDeezer(JSON.parse(busquedaDeezer('Otro grupo')), { artista: 'Soda Stereo' }), false);
});

test('ritmo: guarda bpm en metadataLocal para todas las canciones, no repite y respeta el máximo', async () => {
  const almacen = crearAlmacenMemoria({
    biblioteca: [track('a', 'Soda Stereo', 'Uno', ['tunemymusic']), track('b', 'Soda Stereo', 'Dos', ['tunemymusic']), track('c', 'Soda Stereo', 'Tres')],
    metadataLocal: [{ trackId: 'a', album: 'Álbum' }],
  });
  const http = httpFalso([
    ['https://api.deezer.com/search', ok(busquedaDeezer('Soda Stereo'))],
    ['https://api.deezer.com/track/777', ok(JSON.stringify({ id: 777, bpm: 98, gain: -9 }))],
  ]);
  const r = await enriquecerRitmoPendientes({ almacen, http, esperar: sinEsperar, max: 2 });
  assert.deepEqual(r, { procesadas: 2, conBpm: 2 });
  assert.deepEqual(await almacen.obtenerPorClave('metadataLocal', 'a'), { trackId: 'a', album: 'Álbum', ritmoBuscado: true, bpm: 98, gain: -9, deezerTrackId: 777 });
  const r2 = await enriquecerRitmoPendientes({ almacen, http, esperar: sinEsperar });
  assert.equal(r2.procesadas, 1);
  assert.equal((await enriquecerRitmoPendientes({ almacen, http, esperar: sinEsperar })).procesadas, 0);
});

test('ritmo: artista distinto = consultada sin bpm; red caída = sigue pendiente', async () => {
  const almacen = crearAlmacenMemoria({ biblioteca: [track('a', 'Soda Stereo', 'Uno')] });
  const otro = httpFalso([['https://api.deezer.com/search', ok(busquedaDeezer('Otro grupo'))]]);
  await enriquecerRitmoPendientes({ almacen, http: otro, esperar: sinEsperar });
  assert.deepEqual(await almacen.obtenerPorClave('metadataLocal', 'a'), { trackId: 'a', ritmoBuscado: true });
  const caida = crearAlmacenMemoria({ biblioteca: [track('b', 'X', 'Y')] });
  const sinRed = httpFalso([['https://api.deezer.com', { status: 503, texto: '', url: '' }]]);
  await enriquecerRitmoPendientes({ almacen: caida, http: sinRed, esperar: sinEsperar });
  assert.equal(await caida.obtenerPorClave('metadataLocal', 'b'), undefined);
});

// --- MusicBrainz por canción y álbum ---------------------------------------------------------
test('MusicBrainz detalle: géneros y etiquetas de la canción y del álbum, con caché del álbum', async () => {
  const almacen = crearAlmacenMemoria({
    biblioteca: [track('a', 'Soda Stereo', 'Persiana americana', ['tunemymusic']), track('b', 'Soda Stereo', 'Otra', ['tunemymusic'])],
    generos: [{ trackId: 'b', recordingMbid: 'rec-b' }],
  });
  const ficha = JSON.stringify({
    genres: [{ name: 'rock', count: 1 }],
    tags: [{ name: 'Happy', count: 1 }],
    releases: [{ date: '1990', title: 'Álbum', 'release-group': { id: 'rg-1', title: 'Álbum', 'primary-type': 'Album', 'secondary-types': [] } }],
  });
  const http = httpFalso([
    ['https://musicbrainz.org/ws/2/recording/?', ok(fixture('mb-recording.json'))],
    ['https://musicbrainz.org/ws/2/recording/', ok(ficha)],
    ['https://musicbrainz.org/ws/2/release-group/rg-1', ok(JSON.stringify({ genres: [{ name: 'latin rock', count: 4 }], tags: [{ name: 'sad', count: 2 }] }))],
  ]);
  const esperas = [];
  const r = await enriquecerMusicbrainzDetallePendientes({ almacen, http, esperar: async (ms) => esperas.push(ms) });
  assert.deepEqual(r, { procesadas: 2, conGeneros: 2, conEtiquetas: 2 });
  const reg = await almacen.obtenerPorClave('generos', 'b');
  assert.equal(reg.mbDetalle, true);
  assert.deepEqual(reg.mbCancion, { generos: ['rock'], tags: ['happy'] });
  assert.deepEqual(reg.mbAlbum, { generos: ['latin rock'], tags: ['sad'] });
  assert.equal(reg.releaseGroupMbid, 'rg-1');
  assert.equal(http.llamadas.filter((l) => l.url.includes('/release-group/')).length, 1, 'el álbum se pide una sola vez');
  assert.ok(http.llamadas.every((l) => l.opciones.headers['User-Agent'] === 'Musicsippi/1.0 ( terrikoladigital@gmail.com )'));
  assert.ok(esperas.every((ms) => ms === 1000), 'máximo 1 petición por segundo');
  const r2 = await enriquecerMusicbrainzDetallePendientes({ almacen, http, esperar: sinEsperar });
  assert.equal(r2.procesadas, 0);
});

test('MusicBrainz detalle: sin ficha queda anotada y MusicBrainz caído deja pendiente', async () => {
  const almacen = crearAlmacenMemoria({ biblioteca: [track('a', 'Nadie', 'Nada')] });
  const vacio = httpFalso([['https://musicbrainz.org/ws/2/recording/?', ok('{"recordings":[]}')]]);
  await enriquecerMusicbrainzDetallePendientes({ almacen, http: vacio, esperar: sinEsperar });
  assert.equal((await almacen.obtenerPorClave('generos', 'a')).mbDetalle, true);
  const caido = crearAlmacenMemoria({ biblioteca: [1, 2, 3, 4].map((n) => track(`t${n}`, 'A', `T${n}`)) });
  const http = httpFalso([['https://musicbrainz.org', { status: 503, texto: '', url: '' }]]);
  await enriquecerMusicbrainzDetallePendientes({ almacen: caido, http, esperar: sinEsperar });
  assert.equal((await caido.obtenerTodos('generos')).length, 0);
});
