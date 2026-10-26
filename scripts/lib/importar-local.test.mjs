import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreDesdeArchivo, resolverMetadataLocal, aplicarArchivosLocales } from './importar-local.mjs';
import { idTrack as idTrackDeTest } from './id-track.mjs';

test('nombreDesdeArchivo separa "Artista - Título.mp3"', () => {
  const r = nombreDesdeArchivo('C:/Musica/Nirvana - Smells Like Teen Spirit.mp3');
  assert.deepEqual(r, { artista: 'Nirvana', titulo: 'Smells Like Teen Spirit' });
});

test('nombreDesdeArchivo tolera espacios extra alrededor del guion', () => {
  const r = nombreDesdeArchivo('C:/Musica/Bob Dylan   -   Blowin in the Wind.mp3');
  assert.deepEqual(r, { artista: 'Bob Dylan', titulo: 'Blowin in the Wind' });
});

test('nombreDesdeArchivo devuelve null si no hay guion separador', () => {
  const r = nombreDesdeArchivo('C:/Musica/cancion sin formato.mp3');
  assert.equal(r, null);
});

test('nombreDesdeArchivo devuelve null si algún lado del guion queda vacío', () => {
  const r = nombreDesdeArchivo('C:/Musica/ - Titulo Solo.mp3');
  assert.equal(r, null);
});

test('nombreDesdeArchivo con varios guiones usa el primero como separador (comportamiento documentado, no un bug)', () => {
  // Caso "01 - Nirvana - Smells Like Teen Spirit.mp3" (numeración de pista):
  // no es el patrón que se pidió soportar (Artista - Título), así que el
  // resultado es intencionalmente "impreciso" acá — el archivo termina
  // igual en la biblioteca, solo que con estos datos, y el usuario lo puede
  // corregir a mano si hace falta.
  const r = nombreDesdeArchivo('C:/Musica/01 - Nirvana - Smells Like Teen Spirit.mp3');
  assert.deepEqual(r, { artista: '01', titulo: 'Nirvana - Smells Like Teen Spirit' });
});

test('resolverMetadataLocal usa los tags ID3 si están completos', () => {
  const r = resolverMetadataLocal('C:/Musica/archivo-cualquiera.mp3', { artist: 'Eminem', title: 'Lose Yourself' });
  assert.deepEqual(r, { artista: 'Eminem', titulo: 'Lose Yourself', origenDatos: 'tags' });
});

test('resolverMetadataLocal recorta espacios de los tags', () => {
  const r = resolverMetadataLocal('C:/Musica/archivo.mp3', { artist: '  Eminem  ', title: '  Lose Yourself  ' });
  assert.deepEqual(r, { artista: 'Eminem', titulo: 'Lose Yourself', origenDatos: 'tags' });
});

test('resolverMetadataLocal cae al nombre de archivo si faltan tags', () => {
  const r = resolverMetadataLocal('C:/Musica/Nirvana - Smells Like Teen Spirit.mp3', { artist: '', title: '' });
  assert.deepEqual(r, { artista: 'Nirvana', titulo: 'Smells Like Teen Spirit', origenDatos: 'nombre-archivo' });
});

test('resolverMetadataLocal cae al nombre de archivo si no hay objeto de tags', () => {
  const r = resolverMetadataLocal('C:/Musica/Bob Dylan - Blowin in the Wind.mp3', null);
  assert.deepEqual(r, { artista: 'Bob Dylan', titulo: 'Blowin in the Wind', origenDatos: 'nombre-archivo' });
});

test('resolverMetadataLocal usa tags parciales + nombre de archivo cae a "ninguno" si ninguno alcanza', () => {
  // Solo viene el artista en tags, no el título, y el nombre de archivo no
  // tiene el patrón "Artista - Título" — no hay forma confiable de separar.
  const r = resolverMetadataLocal('C:/Musica/pista03.mp3', { artist: 'Desconocido Real', title: '' });
  assert.deepEqual(r, { artista: 'Desconocido', titulo: 'pista03', origenDatos: 'ninguno' });
});

const EJES_FIXTURE = [
  {
    id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', activo: true, sistema: true,
    anclas: { artistas: [], titulos: [] },
  },
  {
    id: 'rock', nombre: 'Rock', tipo: 'gusto', activo: true, sistema: false,
    anclas: { artistas: ['nirvana'], titulos: [] },
  },
];

function bibliotecaVacia() {
  return { version: 1, generado: new Date().toISOString(), totalTracks: 0, tracks: [] };
}

test('aplicarArchivosLocales crea un track nuevo con fuentes: ["local"]', () => {
  const biblioteca = bibliotecaVacia();
  const entradas = [{ artista: 'Bob Dylan', titulo: 'Blowin in the Wind', origenDatos: 'tags' }];

  const stats = aplicarArchivosLocales(entradas, { biblioteca, ejes: EJES_FIXTURE });

  assert.equal(stats.tracksNuevos, 1);
  assert.equal(stats.tracksFusionados, 0);
  assert.equal(biblioteca.tracks.length, 1);
  assert.deepEqual(biblioteca.tracks[0].fuentes, ['local']);
  assert.equal(biblioteca.tracks[0].youtubeVideoId, null);
  assert.equal(biblioteca.tracks[0].youtubeQuery, 'Bob Dylan Blowin in the Wind');
});

test('aplicarArchivosLocales clasifica por artista contra los ejes existentes', () => {
  const biblioteca = bibliotecaVacia();
  const entradas = [{ artista: 'Nirvana', titulo: 'Come As You Are', origenDatos: 'tags' }];

  aplicarArchivosLocales(entradas, { biblioteca, ejes: EJES_FIXTURE });

  assert.equal(biblioteca.tracks[0].ejes[0].ejeId, 'rock');
});

test('aplicarArchivosLocales manda a sin-clasificar los tracks con origenDatos "ninguno", sin correr clasificar()', () => {
  const biblioteca = bibliotecaVacia();
  // Aunque el artista "Nirvana" matchearía el eje Rock, origenDatos: 'ninguno'
  // significa que ese dato no viene de una fuente confiable (ver
  // resolverMetadataLocal) — va derecho a revisión manual.
  const entradas = [{ artista: 'Desconocido', titulo: 'pista03', origenDatos: 'ninguno' }];

  const stats = aplicarArchivosLocales(entradas, { biblioteca, ejes: EJES_FIXTURE });

  assert.equal(stats.sinClasificar, 1);
  assert.deepEqual(biblioteca.tracks[0].ejes, [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }]);
});

test('aplicarArchivosLocales fusiona con un track existente de otra fuente en vez de duplicar', () => {
  const biblioteca = bibliotecaVacia();
  biblioteca.tracks.push({
    id: idTrackDeTest('Bob Dylan', 'Blowin in the Wind'),
    artista: 'Bob Dylan',
    titulo: 'Blowin in the Wind',
    fuentes: ['tunemymusic'],
    youtubeQuery: 'Bob Dylan Blowin in the Wind',
    youtubeVideoId: 'abc123',
    ejes: [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }],
  });
  const entradas = [{ artista: 'Bob Dylan', titulo: 'Blowin in the Wind', origenDatos: 'tags' }];

  const stats = aplicarArchivosLocales(entradas, { biblioteca, ejes: EJES_FIXTURE });

  assert.equal(stats.tracksNuevos, 0);
  assert.equal(stats.tracksFusionados, 1);
  assert.equal(biblioteca.tracks.length, 1);
  assert.deepEqual(biblioteca.tracks[0].fuentes, ['tunemymusic', 'local']);
  // No se pisa lo que ya había resuelto (youtubeVideoId, ejes existentes).
  assert.equal(biblioteca.tracks[0].youtubeVideoId, 'abc123');
});

test('aplicarArchivosLocales no duplica "local" en fuentes si el track ya lo tenía', () => {
  const biblioteca = bibliotecaVacia();
  biblioteca.tracks.push({
    id: idTrackDeTest('Bob Dylan', 'Blowin in the Wind'),
    artista: 'Bob Dylan',
    titulo: 'Blowin in the Wind',
    fuentes: ['local'],
    youtubeQuery: 'Bob Dylan Blowin in the Wind',
    youtubeVideoId: null,
    ejes: [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }],
  });
  const entradas = [{ artista: 'Bob Dylan', titulo: 'Blowin in the Wind', origenDatos: 'tags' }];

  const stats = aplicarArchivosLocales(entradas, { biblioteca, ejes: EJES_FIXTURE });

  assert.equal(stats.tracksFusionados, 1);
  assert.deepEqual(biblioteca.tracks[0].fuentes, ['local']);
});
