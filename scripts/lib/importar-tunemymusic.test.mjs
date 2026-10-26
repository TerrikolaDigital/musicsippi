import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearCsvTuneMyMusic, aplicarFilasTuneMyMusic } from './importar-tunemymusic.mjs';

const ENCABEZADO = 'Track name,Artist name,Album,Playlist name,Type,ISRC';

test('fila de tipo Favorite sin artista recupera artista/titulo del "Track name"', () => {
  // Caso real: el CSV de "Liked videos" de YouTube (via TuneMyMusic) no
  // separa artista/titulo -- todas sus filas son Type=Favorite con
  // Artist name vacio, y el titulo del video trae los dos datos juntos.
  // Se recuperan partiendo por el primer " - ", que es como titula YouTube.
  const csv = `${ENCABEZADO}\n"Alguna Cancion - Video Random","","","Liked videos","Favorite",""`;
  const { filas, filasDescartadas, error } = parsearCsvTuneMyMusic(csv);
  assert.equal(error, null);
  assert.equal(filasDescartadas.length, 0);
  assert.deepEqual(filas, [
    { titulo: 'Video Random', artista: 'Alguna Cancion', album: '', playlist: 'Liked videos', tipo: 'Favorite' },
  ]);
});

test('fila sin artista y sin separador en el titulo cuenta como descartada, no desaparece', () => {
  // La otra mitad del caso de arriba: cuando no hay de donde sacar el
  // artista, la fila NO se pierde del conteo. Antes no entraba ni a `filas`
  // (falta artista) ni a `filasDescartadas` (el filtro solo miraba tipo
  // Artist/Album), y la UI mostraba "0 filas leidas" para un archivo con
  // contenido real.
  const csv = `${ENCABEZADO}\n"VideoSinSeparador","","","Liked videos","Favorite",""`;
  const { filas, filasDescartadas, error } = parsearCsvTuneMyMusic(csv);
  assert.equal(error, null);
  assert.equal(filas.length, 0);
  assert.equal(filasDescartadas.length, 1);
});

test('toda fila de datos termina en filas o en filasDescartadas, nunca se pierde', () => {
  const csv = [
    ENCABEZADO,
    '"Cancion Real","Un Artista","Un Album","Favoritas","Favorite",""',
    '"Video Sin Artista","","","Liked videos","Favorite",""',
    '"Artista Seguido","","","Mis artistas","Artist",""',
    '"Album Guardado","","","Mis albumes","Album",""',
  ].join('\n');
  const { filas, filasDescartadas, error } = parsearCsvTuneMyMusic(csv);
  assert.equal(error, null);
  assert.equal(filas.length + filasDescartadas.length, 4);
});

test('fila normal con artista y titulo se cuenta como fila util', () => {
  const csv = `${ENCABEZADO}\n"Cancion Real","Un Artista","Un Album","Favoritas","Favorite",""`;
  const { filas, filasDescartadas } = parsearCsvTuneMyMusic(csv);
  assert.equal(filas.length, 1);
  assert.equal(filasDescartadas.length, 0);
});

test('fila de tipo Artist/Album sigue contando como descartada', () => {
  const csv = `${ENCABEZADO}\n"Artista Seguido","","","Mis artistas","Artist",""`;
  const { filas, filasDescartadas } = parsearCsvTuneMyMusic(csv);
  assert.equal(filas.length, 0);
  assert.equal(filasDescartadas.length, 1);
});

/** Estado en memoria mínimo para aplicarFilasTuneMyMusic. */
function estadoBase() {
  return {
    biblioteca: { tracks: [] },
    ejes: [
      { id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', orden: 999, activo: true, sistema: true, padre: null, anclas: { artistas: [], titulos: [] }, tagsLastfm: [] },
      { id: 'favoritos', nombre: 'Favoritas', tipo: 'gusto', orden: 0, activo: true, sistema: true, padre: null, anclas: { artistas: [], titulos: [] }, tagsLastfm: [] },
    ],
    metaSpotify: { tracks: {} },
  };
}

function fila(extra) {
  return { titulo: 'Uno', artista: 'A', album: '', playlist: '', tipo: 'Track', ...extra };
}

test('una playlist que es "tus me gusta" con otro nombre entra a Favoritas, no crea una lista clon', () => {
  // TuneMyMusic exporta la coleccion de me gusta dos veces cuando en la
  // plataforma de origen tambien tiene nombre de playlist: una fila
  // Type=Favorite y otra como playlist "Mis favoritas". Medido en una
  // biblioteca real: las 83 canciones de "Mis favoritas" estaban las 83 en
  // "Favoritas", ninguna exclusiva.
  const estado = estadoBase();
  const { listasNuevas } = aplicarFilasTuneMyMusic(
    [fila({ playlist: 'Mis favoritas' }), fila({ titulo: 'Dos', playlist: 'MIS FAVORITAS' })],
    estado
  );

  assert.equal(listasNuevas.length, 0, 'no se creo ninguna lista nueva');
  for (const track of estado.biblioteca.tracks) {
    assert.equal(track.ejes.some((a) => a.ejeId === 'favoritos'), true);
  }
});

test('una lista de verdad que solo menciona "favorito" en el nombre sigue siendo una lista propia', () => {
  const estado = estadoBase();
  const { listasNuevas } = aplicarFilasTuneMyMusic([fila({ playlist: 'Rock favorito' })], estado);

  assert.equal(listasNuevas.length, 1);
  assert.equal(listasNuevas[0].nombre, 'Rock favorito');
  const track = estado.biblioteca.tracks[0];
  assert.equal(track.ejes.some((a) => a.ejeId === 'favoritos'), false);
});
