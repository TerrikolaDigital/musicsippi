import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importarFilasLocal, agregarTrackLocal, agregarAlbumLocal } from './alta-local.js';
import { crearAlmacenMemoria } from './lib/almacen-memoria.js';
import { idTrackNavegador } from './lib/id-track-navegador.js';
import { parsearCsvTuneMyMusic } from '../../scripts/lib/csv-tunemymusic.mjs';
import { aplicarFilasTuneMyMusic } from '../../scripts/lib/importar-tunemymusic.mjs';
import { idTrack } from '../../scripts/lib/id-track.mjs';
import { limpiarTitulo } from '../../scripts/lib/clasificar.mjs';

const sistema = (id, nombre, tipo) => ({
  id, nombre, tipo, orden: id === 'favoritos' ? 0 : 999, activo: true, sistema: true, padre: null,
  anclas: { artistas: [], titulos: [] }, tagsLastfm: [],
});
const EJES = [sistema('sin-clasificar', 'Sin clasificar', 'sistema'), sistema('favoritos', 'Favoritas', 'gusto')];
const fila = (titulo, artista, extra = {}) => ({ titulo, artista, album: '', playlist: 'x', tipo: 'Track', ...extra });
const cambios = (almacen) => almacen.obtenerValorConfig('cambiosPendientes', []);

test('importa una playlist nueva: canciones, lista y registro para el PC', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const r = await importarFilasLocal(
    [fila('Persiana americana', 'Soda Stereo', { album: 'Signos' }), fila('Starboy', 'The Weeknd, Daft Punk')],
    { nombrePlaylist: 'Clásicos', origen: 'spotify' },
    almacen
  );
  assert.equal(r.tracksNuevos, 2);
  assert.deepEqual(r.listasNuevas, ['Clásicos']);
  const lista = r.ejes.find((e) => e.nombre === 'Clásicos');
  assert.equal(lista.tipo, 'playlist');
  assert.equal(lista.descripcion, 'Importada desde Spotify.');
  assert.equal(r.ejeLista, lista.id);
  const tracks = await almacen.obtenerTodos('biblioteca');
  assert.equal(tracks.length, 2);
  for (const t of tracks) {
    assert.ok(t.fuentes.includes('movil'));
    assert.ok(t.ejes.some((a) => a.ejeId === lista.id));
  }
  const soda = tracks.find((t) => t.artista === 'Soda Stereo');
  assert.equal(soda.id, await idTrackNavegador('Soda Stereo', limpiarTitulo('Persiana americana')));
  assert.equal((await almacen.obtenerPorClave('metadataLocal', soda.id)).album, 'Signos');
  const [cambio] = await cambios(almacen);
  assert.equal(cambio.endpoint, 'importar-tunemymusic');
  assert.match(cambio.cuerpo.contenido, /^Track name,Artist name,Album,Playlist name,Type\n/);
});

test('reimportar la misma playlist no duplica canciones ni crea otra lista', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const filas = [fila('Uno', 'A'), fila('Dos', 'B')];
  await importarFilasLocal(filas, { nombrePlaylist: 'Clásicos', origen: 'deezer' }, almacen);
  const r = await importarFilasLocal([...filas, fila('Tres', 'C')], { nombrePlaylist: 'Clásicos', origen: 'deezer' }, almacen);
  assert.equal(r.tracksNuevos, 1);
  assert.deepEqual(r.listasNuevas, []);
  assert.equal((await almacen.obtenerTodos('biblioteca')).length, 3);
  assert.equal(r.ejes.filter((e) => e.tipo === 'playlist').length, 1);
});

test('una canción que ya estaba solo gana la pertenencia a la lista', async () => {
  const id = await idTrackNavegador('A', 'Uno');
  const previa = {
    id, artista: 'A', titulo: 'Uno', fuentes: ['tunemymusic'], youtubeQuery: 'A Uno', youtubeVideoId: null,
    ejes: [{ ejeId: 'favoritos', origen: 'manual', senal: 'usuario', score: 1 }],
  };
  const almacen = crearAlmacenMemoria({ ejes: EJES, biblioteca: [previa] });
  const r = await importarFilasLocal([fila('Uno', 'A')], { nombrePlaylist: 'Nueva', origen: 'spotify' }, almacen);
  assert.equal(r.tracksNuevos, 0);
  const t = await almacen.obtenerPorClave('biblioteca', id);
  assert.deepEqual(t.ejes.map((a) => a.ejeId).sort(), ['favoritos', r.ejeLista].sort());
});

test('las canciones de YouTube guardan su videoId', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  await importarFilasLocal([fila('Dai Dai', 'Shakira, Burna Boy', { videoId: 'fcnDmrtj6Sk' })], { nombrePlaylist: 'Top', origen: 'youtube' }, almacen);
  const id = await idTrackNavegador('Shakira, Burna Boy', 'Dai Dai');
  assert.deepEqual(await almacen.obtenerPorClave('cacheYoutube', id), { trackId: id, videoId: 'fcnDmrtj6Sk' });
});

test('el CSV para el PC da los mismos ids aunque haya comas, comillas y saltos de línea', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  await importarFilasLocal(
    [fila('Hello, "World"', 'Artista, Con Coma'), fila('Dos\nlíneas', 'Ñandú & Cía')],
    { nombrePlaylist: 'Lista, rara "x"', origen: 'deezer' },
    almacen
  );
  const [cambio] = await cambios(almacen);
  const { filas, error } = parsearCsvTuneMyMusic(cambio.cuerpo.contenido);
  assert.equal(error, null);
  assert.ok(filas.every((f) => f.playlist === 'Lista, rara "x"'));
  // Camino real del PC: parsear + aplicar con el idTrack de node:crypto.
  const ejesPC = EJES.map((e) => ({ ...e }));
  const bibPC = { tracks: [] };
  const stats = aplicarFilasTuneMyMusic(filas, { biblioteca: bibPC, ejes: ejesPC, metaSpotify: { tracks: {} } });
  const movil = await almacen.obtenerTodos('biblioteca');
  assert.deepEqual(bibPC.tracks.map((t) => t.id).sort(), movil.map((t) => t.id).sort());
  const listaPC = stats.listasNuevas[0];
  const listaMovil = (await almacen.obtenerTodos('ejes')).find((e) => e.tipo === 'playlist');
  assert.equal(listaPC.id, listaMovil.id);
});

test('agregarTrackLocal da de alta, guarda el vídeo y anota agregar-track', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const r = await agregarTrackLocal({ titulo: ' Starboy ', artista: 'The Weeknd', videoId: 'abc' }, almacen);
  assert.equal(r.yaExistia, false);
  assert.deepEqual(r.track.fuentes, ['manual', 'movil']);
  assert.equal((await almacen.obtenerPorClave('cacheYoutube', r.track.id)).videoId, 'abc');
  const [cambio] = await cambios(almacen);
  assert.equal(cambio.endpoint, 'agregar-track');
  assert.deepEqual(cambio.cuerpo, { titulo: 'Starboy', artista: 'The Weeknd', videoId: 'abc' });
  const otra = await agregarTrackLocal({ titulo: 'Starboy', artista: 'The Weeknd', videoId: 'zzz' }, almacen);
  assert.equal(otra.yaExistia, true);
});

test('agregarAlbumLocal añade lo que falta, marca la colección y anota agregar-album', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const payload = {
    tracks: [{ artista: 'A', titulo: 'Uno', duracionMs: 1000 }, { artista: 'A', titulo: 'Dos' }],
    albumTitulo: 'Disco',
    anio: 2001,
    ejeId: 'favoritos',
  };
  const r = await agregarAlbumLocal(payload, almacen);
  assert.equal(r.agregados, 2);
  assert.equal(r.conPertenencia, 2);
  assert.equal(r.tracks.length, 2);
  const id = await idTrackNavegador('A', 'Uno');
  assert.deepEqual(await almacen.obtenerPorClave('metadataLocal', id), { trackId: id, album: 'Disco', anio: 2001, duracionMs: 1000 });
  const anotados = await cambios(almacen);
  assert.deepEqual(anotados.map((c) => c.endpoint), ['importar-tunemymusic', 'agregar-album']);
  const { filas: filasCsv } = parsearCsvTuneMyMusic(anotados[0].cuerpo.contenido);
  assert.deepEqual(filasCsv.map((f) => [f.titulo, f.artista, f.album, f.playlist, f.tipo]), [
    ['Uno', 'A', 'Disco', '', 'Favorite'],
    ['Dos', 'A', 'Disco', '', 'Favorite'],
  ]);
  await assert.rejects(agregarAlbumLocal({ ...payload, ejeId: 'no-existe' }, almacen), /eje_inexistente/);
});

test('agregarTrackLocal sin vídeo se anota por importar-tunemymusic, no por agregar-album', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  await agregarTrackLocal({ titulo: 'Starboy', artista: 'The Weeknd' }, almacen);
  const anotados = await cambios(almacen);
  assert.deepEqual(anotados.map((c) => c.endpoint), ['importar-tunemymusic']);
  const { filas } = parsearCsvTuneMyMusic(anotados[0].cuerpo.contenido);
  assert.deepEqual(filas.map((f) => [f.titulo, f.artista, f.playlist]), [['Starboy', 'The Weeknd', '']]);
});

test('un álbum a una lista viaja por el CSV con su nombre y sin agregar-album con el eje', async () => {
  const lista = { ...sistema('mi-lista', 'Mi lista', 'playlist'), sistema: false };
  const almacen = crearAlmacenMemoria({ ejes: [...EJES, lista] });
  await agregarAlbumLocal({ tracks: [{ artista: 'A', titulo: 'Uno' }], ejeId: 'mi-lista', albumTitulo: 'Disco' }, almacen);
  const anotados = await cambios(almacen);
  assert.deepEqual(anotados.map((c) => c.endpoint), ['importar-tunemymusic']);
  const { filas } = parsearCsvTuneMyMusic(anotados[0].cuerpo.contenido);
  assert.deepEqual(filas.map((f) => [f.playlist, f.album]), [['Mi lista', 'Disco']]);
});

test('un álbum a un modo anota el CSV primero y agregar-album después con el eje', async () => {
  const modo = { ...sistema('rock', 'Rock', 'gusto'), sistema: false };
  const almacen = crearAlmacenMemoria({ ejes: [...EJES, modo] });
  await agregarAlbumLocal({ tracks: [{ artista: 'A', titulo: 'Uno' }], ejeId: 'rock' }, almacen);
  const anotados = await cambios(almacen);
  assert.deepEqual(anotados.map((c) => c.endpoint), ['importar-tunemymusic', 'agregar-album']);
  assert.equal(anotados[1].cuerpo.ejeId, 'rock');
});

test('el álbum anota filas limpiadas y el PC calcula los mismos ids', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const tracks = [
    { artista: 'Soda  Stereo', titulo: 'Persiana\tamericana', duracionMs: 1000 },
    { artista: 'Ñandú\n& Cía', titulo: 'Dos\n  líneas' },
  ];
  await agregarAlbumLocal({ tracks, albumTitulo: 'Disco' }, almacen);
  const anotados = await cambios(almacen);
  const idsMovil = (await almacen.obtenerTodos('biblioteca')).map((t) => t.id).sort();
  // agregar-album (por duración): el PC hace idTrack(artista, limpiarTitulo(titulo)) sobre lo crudo.
  const albumAnotado = anotados.find((c) => c.endpoint === 'agregar-album').cuerpo.tracks;
  assert.deepEqual(albumAnotado.map((f) => idTrack(f.artista, limpiarTitulo(f.titulo))).sort(), idsMovil);
  const { filas } = parsearCsvTuneMyMusic(anotados.find((c) => c.endpoint === 'importar-tunemymusic').cuerpo.contenido);
  assert.deepEqual(filas.map((f) => idTrack(f.artista, limpiarTitulo(f.titulo))).sort(), idsMovil);
});

const modoConvertido = (id, nombre) => ({
  id, nombre, tipo: 'gusto', origen: 'descubierto', orden: 5, activo: true, sistema: false, padre: null,
  anclas: { artistas: [], titulos: [] }, tagsLastfm: [],
});

test('reimportar «Chill» tras convertirse en modo no crea chill-2 y suma al modo', async () => {
  const almacen = crearAlmacenMemoria({ ejes: [...EJES, modoConvertido('chill', 'Chill')] });
  const r = await importarFilasLocal([fila('Uno', 'A')], { nombrePlaylist: 'Chill', origen: 'spotify' }, almacen);
  assert.deepEqual(r.listasNuevas, []);
  assert.equal(r.ejeLista, 'chill');
  assert.equal(r.ejes.some((e) => e.id === 'chill-2'), false);
  const [t] = await almacen.obtenerTodos('biblioteca');
  assert.ok(t.ejes.some((a) => a.ejeId === 'chill' && a.origen === 'manual'));
});

test('releer una seguida renombrada en el origen añade al mismo ejeId', async () => {
  const almacen = crearAlmacenMemoria({ ejes: [...EJES, modoConvertido('chill', 'Chill')] });
  const r = await importarFilasLocal([fila('Uno', 'A')], { nombrePlaylist: 'Relax total', origen: 'spotify', ejeId: 'chill' }, almacen);
  assert.deepEqual(r.listasNuevas, []);
  assert.equal(r.ejeLista, 'chill');
  assert.equal(r.ejes.length, 3);
  const [t] = await almacen.obtenerTodos('biblioteca');
  assert.ok(t.ejes.some((a) => a.ejeId === 'chill'));
  // el PC recibe el nombre que la lista tiene en el móvil, no el renombrado
  const [cambio] = await cambios(almacen);
  assert.match(cambio.cuerpo.contenido, /Chill/);
  assert.doesNotMatch(cambio.cuerpo.contenido, /Relax total/);
});

test('el cambio se anota antes de guardar: un fallo al guardar no lo pierde', async () => {
  const base = crearAlmacenMemoria({ ejes: EJES });
  const roto = { ...base, guardarVarios: async (n, v) => { if (n === 'biblioteca') throw new Error('cierre'); return base.guardarVarios(n, v); },
    guardarRegistro: async (n, v) => { if (n === 'biblioteca') throw new Error('cierre'); return base.guardarRegistro(n, v); } };
  await assert.rejects(importarFilasLocal([fila('Uno', 'A')], { nombrePlaylist: 'L', origen: 'spotify' }, roto));
  await assert.rejects(agregarTrackLocal({ titulo: 'Dos', artista: 'B', videoId: 'v' }, roto));
  await assert.rejects(agregarAlbumLocal({ tracks: [{ titulo: 'Tres', artista: 'C' }], albumTitulo: 'Al' }, roto));
  assert.deepEqual((await cambios(base)).map((c) => c.endpoint), ['importar-tunemymusic', 'agregar-track', 'importar-tunemymusic']);
});

test('releer una playlist sin novedades no anota otro cambio; con una pertenencia nueva sí', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const filas = [fila('Uno', 'A'), fila('Dos', 'B')];
  await importarFilasLocal(filas, { nombrePlaylist: 'L', origen: 'deezer' }, almacen);
  await importarFilasLocal(filas, { nombrePlaylist: 'L', origen: 'deezer' }, almacen);
  assert.equal((await cambios(almacen)).length, 1);
  await importarFilasLocal(filas, { nombrePlaylist: 'Otra', origen: 'deezer' }, almacen);
  assert.equal((await cambios(almacen)).length, 2);
});

test('agregarAlbumLocal ignora filas sin artista o título (no crea canciones vacías)', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const r = await agregarAlbumLocal({ tracks: [{ titulo: 'Bueno', artista: 'A' }, { titulo: '  ', artista: 'B' }, { titulo: 'X', artista: '' }], albumTitulo: 'Al' }, almacen);
  assert.equal(r.agregados, 1);
  assert.equal((await almacen.obtenerTodos('biblioteca')).length, 1);
});
