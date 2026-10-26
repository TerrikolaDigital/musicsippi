import test from 'node:test';
import assert from 'node:assert/strict';
import { GENEROS_EXPLORAR, generoPorId, rutasDe, elegirListas, armarGenero, cargarGenero, ordenarArtistas, MAX_ALBUMES } from './explorar.js';

const art = (id, name) => ({ id, name, picture_medium: `https://f/${id}.jpg` });
const cancion = (id, titulo, a, alb) => ({ id, title: titulo, artist: a, album: alb ?? { id: id * 10, title: `Álbum ${titulo}`, cover_medium: `https://c/${id}.jpg` } });

test('los géneros pedidos están y empiezan por Todos', () => {
  const nombres = GENEROS_EXPLORAR.map((g) => g.nombre);
  assert.equal(nombres[0], 'Todos');
  for (const n of ['Pop', 'Rock', 'Rock en español', 'Latino', 'Reggaetón', 'Electrónica', 'House', 'Dance', 'Hip hop / Rap', 'R&B / Soul', 'Indie / Alternativo', 'Jazz', 'Clásica', 'Soundtracks', 'Instrumental']) {
    assert.ok(nombres.includes(n), n);
  }
  assert.equal(new Set(GENEROS_EXPLORAR.map((g) => g.id)).size, GENEROS_EXPLORAR.length);
  assert.equal(generoPorId('no-existe').id, 'todos');
});

test('mapeo género -> fuente: Deezer propio usa chart, los demás playlists editoriales', () => {
  assert.deepEqual(rutasDe(generoPorId('pop')).charts, ['/chart/132/tracks?limit=50', '/chart/132/albums?limit=50']);
  assert.equal(rutasDe(generoPorId('todos')).charts[0], '/chart/0/tracks?limit=50');
  assert.deepEqual(rutasDe(generoPorId('rnb')).charts.length, 4);
  for (const id of ['rock-es', 'house', 'soundtracks', 'instrumental']) {
    const r = rutasDe(generoPorId(id));
    assert.equal(r.charts.length, 0, id);
    assert.ok(r.busquedas.every((b) => b.startsWith('/search/playlist?q=')), id);
  }
  assert.ok(rutasDe(generoPorId('rock-es')).busquedas[0].includes(encodeURIComponent('rock en español')));
  assert.ok(rutasDe(generoPorId('reggaeton')).busquedas.length > 0, 'reggaetón complementa el chart con playlists');
});

test('elegirListas prefiere las de editores de Deezer y descarta las casi vacías', () => {
  const json = {
    data: [
      { id: 1, nb_tracks: 80, user: { name: 'maniacox' } },
      { id: 2, nb_tracks: 10, user: { name: 'Deezer Editor' } },
      { id: 3, nb_tracks: 50, user: { name: 'Ana - Deezer LATAM Editor' } },
      { id: 4, nb_tracks: 60, user: { name: 'Deezer Rock Editor' } },
    ],
  };
  assert.deepEqual(elegirListas(json).map((p) => p.id), [3, 4]);
  assert.deepEqual(elegirListas({ data: [{ id: 9, nb_tracks: 40, user: { name: 'x' } }] }).map((p) => p.id), [9]);
  assert.deepEqual(elegirListas(null), []);
});

test('armarGenero saca artistas y álbumes de canciones y álbumes, sin repetir', () => {
  const a = art(1, 'Caifanes');
  const b = art(2, 'Zoé');
  const r = armarGenero({
    albumes: [{ id: 7, title: 'El Silencio', cover_medium: 'https://c/7.jpg', artist: a }],
    canciones: [cancion(1, 'La Célula', a, { id: 7, title: 'El Silencio', cover_medium: 'https://c/7.jpg' }), cancion(2, 'Soñé', b), cancion(1, 'La Célula', a), { id: 3, title: 'Sin artista' }],
  });
  assert.deepEqual(r.canciones.map((c) => c.id), ['deezer-1', 'deezer-2']);
  assert.deepEqual(r.artistas.map((x) => x.nombre), ['Caifanes', 'Zoé']);
  assert.equal(r.artistas[0].foto, 'https://f/1.jpg');
  assert.deepEqual(r.albumes.map((x) => x.id), ['deezer-album-7', 'deezer-album-20']);
  assert.equal(r.albumes[0].artista, 'Caifanes');
});

test('armarGenero acota álbumes a filas completas de 3', () => {
  const canciones = Array.from({ length: 40 }, (_, i) => cancion(i + 1, `T${i}`, art(i + 1, `A${i}`)));
  const r = armarGenero({ albumes: [], canciones });
  assert.equal(r.albumes.length, MAX_ALBUMES);
  assert.equal(MAX_ALBUMES % 3, 0);
});

test('cargarGenero: chart de Deezer, y playlists para los géneros sin chart', async () => {
  const pedidas = [];
  const pedir = async (ruta) => {
    pedidas.push(ruta);
    if (ruta.startsWith('/search/playlist')) return { data: [{ id: 55, nb_tracks: 70, user: { name: 'Deezer LATAM Editor' } }, { id: 56, nb_tracks: 70, user: { name: 'Deezer Rock Editor' } }] };
    if (ruta.startsWith('/playlist/55/')) return { data: [cancion(1, 'Persiana Americana', art(1, 'Soda Stereo'))] };
    if (ruta.startsWith('/playlist/56/')) return { data: [cancion(2, 'Mariposa Tecknicolor', art(2, 'Fito Páez'))] };
    throw new Error('no esperada ' + ruta);
  };
  const r = await cargarGenero(generoPorId('rock-es'), pedir);
  assert.deepEqual(pedidas.sort(), ['/playlist/55/tracks?limit=60', '/playlist/56/tracks?limit=60', `/search/playlist?q=${encodeURIComponent('rock en español')}&limit=10`].sort());
  assert.deepEqual(r.artistas.map((a) => a.nombre), ['Soda Stereo', 'Fito Páez']);
  assert.equal(r.canciones.length, 2);

  const pedirChart = async (ruta) => {
    if (ruta.includes('/tracks')) return { data: [cancion(9, 'Tema', art(9, 'Pop Star'))] };
    return { data: [{ id: 3, title: 'Disco', cover_medium: 'https://c/3.jpg', artist: art(9, 'Pop Star') }] };
  };
  const p = await cargarGenero(generoPorId('pop'), pedirChart);
  assert.equal(p.albumes[0].titulo, 'Disco');
  assert.equal(p.canciones[0].artista, 'Pop Star');
});

test('cargarGenero tolera que falle una fuente y lanza si fallan todas', async () => {
  const coja = async (ruta) => {
    if (ruta.includes('/albums')) throw new Error('cuota');
    return { data: [cancion(1, 'Tema', art(1, 'X'))] };
  };
  const r = await cargarGenero(generoPorId('rnb'), coja);
  assert.equal(r.canciones.length, 1);
  await assert.rejects(() => cargarGenero(generoPorId('jazz'), async () => { throw new Error('sin red'); }), /sin contenido|no devolvi/i);
});

test('ordenarArtistas pone antes los parecidos a los del usuario y los marca', () => {
  const lista = [{ nombre: 'A' }, { nombre: 'Zoé' }, { nombre: 'B' }, { nombre: 'Maná' }];
  const r = ordenarArtistas(lista, new Set(['zoe', 'mana']));
  assert.deepEqual(r.map((a) => a.nombre), ['Zoé', 'Maná', 'A', 'B']);
  assert.deepEqual(r.map((a) => a.paraTi), [true, true, false, false]);
  assert.deepEqual(ordenarArtistas(lista, new Set()).map((a) => a.nombre), ['A', 'Zoé', 'B', 'Maná']);
});
