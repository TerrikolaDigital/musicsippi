import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarModosConfirmados } from './aplicar-modos.mjs';

function ejesBase() {
  return {
    ejes: [
      { id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', orden: 999, activo: true, sistema: true, padre: null, descripcion: '', anclas: { artistas: [], titulos: [] }, tagsLastfm: [] },
    ],
  };
}

function bibliotecaBase() {
  return {
    tracks: [
      { id: 't1', artista: 'A', titulo: 'Uno', ejes: [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }] },
      { id: 't2', artista: 'B', titulo: 'Dos', ejes: [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }] },
    ],
  };
}

test('crea un eje nuevo por cada modo confirmado, con origen "descubierto"', () => {
  const ejesActuales = ejesBase();
  const biblioteca = bibliotecaBase();
  const { nuevosEjes } = aplicarModosConfirmados(ejesActuales, biblioteca, [{ nombre: 'Phonk', trackIds: ['t1'] }]);

  assert.equal(nuevosEjes.length, 1);
  assert.equal(nuevosEjes[0].nombre, 'Phonk');
  assert.equal(nuevosEjes[0].origen, 'descubierto');
  assert.equal(ejesActuales.ejes.some((e) => e.id === nuevosEjes[0].id), true);
});

test('un track que gana un modo real pierde el tag sin-clasificar', () => {
  const ejesActuales = ejesBase();
  const biblioteca = bibliotecaBase();
  aplicarModosConfirmados(ejesActuales, biblioteca, [{ nombre: 'Phonk', trackIds: ['t1'] }]);

  const t1 = biblioteca.tracks.find((t) => t.id === 't1');
  assert.equal(t1.ejes.some((a) => a.ejeId === 'sin-clasificar'), false);
  assert.equal(t1.ejes.some((a) => a.ejeId === 'phonk'), true);

  const t2 = biblioteca.tracks.find((t) => t.id === 't2');
  assert.equal(t2.ejes.some((a) => a.ejeId === 'sin-clasificar'), true, 't2 no estaba en el modo, sigue sin clasificar');
});

test('guarda en el track con que evidencia quedo clasificado, y cae al generico si no se paso ninguna', () => {
  const ejesActuales = ejesBase();
  const biblioteca = bibliotecaBase();
  // t1 tiene evidencia propia (el nombre de una lista suya lo describia);
  // t2 no tiene ninguna, asi que solo pudo entrar por similitud de embeddings.
  aplicarModosConfirmados(ejesActuales, biblioteca, [{ nombre: 'Chill', trackIds: ['t1', 't2'] }], [], {
    t1: 'nombre-lista',
    t2: 'ia-embeddings',
  });

  const asignacion = (id) => biblioteca.tracks.find((t) => t.id === id).ejes.find((a) => a.ejeId === 'chill');
  assert.equal(asignacion('t1').senal, 'nombre-lista');
  assert.equal(asignacion('t2').senal, 'ia-embeddings');

  // Sin senalPorTrack (la pantalla de revision no la calcula) se mantiene el
  // valor de siempre, sin romper a quien ya llamaba con cuatro argumentos.
  const otrosEjes = ejesBase();
  const otraBiblioteca = bibliotecaBase();
  aplicarModosConfirmados(otrosEjes, otraBiblioteca, [{ nombre: 'Chill', trackIds: ['t1'] }]);
  const sinSenal = otraBiblioteca.tracks.find((t) => t.id === 't1').ejes.find((a) => a.ejeId === 'chill');
  assert.equal(sinSenal.senal, 'descubrimiento');
});

test('un modo descubierto que vuelve a salir en otro ciclo reusa el eje, no crea uno nuevo', () => {
  const ejesActuales = ejesBase();
  const biblioteca = bibliotecaBase();

  // Ciclo 1: aparece "Electronic" con t1.
  aplicarModosConfirmados(ejesActuales, biblioteca, [{ nombre: 'Electronic', trackIds: ['t1'] }]);
  // Ciclo 2 (tras Deezer/MusicBrainz, con mas evidencia): vuelve a salir el
  // mismo nombre, ahora con t2. Es EL MISMO modo, no uno nuevo.
  aplicarModosConfirmados(ejesActuales, biblioteca, [{ nombre: 'Electronic', trackIds: ['t2'] }]);

  const electronicos = ejesActuales.ejes.filter((e) => e.nombre === 'Electronic');
  assert.equal(electronicos.length, 1, 'no se duplica el eje en cada re-descubrimiento');
  const id = electronicos[0].id;
  assert.equal(id, 'electronic', 'sigue siendo el eje original, sin sufijo -2');
  for (const trackId of ['t1', 't2']) {
    const track = biblioteca.tracks.find((t) => t.id === trackId);
    assert.equal(track.ejes.some((a) => a.ejeId === id), true, `${trackId} quedo en el eje reusado`);
  }
});

test('ids de eje nuevos no chocan con ids existentes (sufijo -2, -3...)', () => {
  const ejesActuales = ejesBase();
  ejesActuales.ejes.push({ id: 'phonk', nombre: 'Phonk viejo', tipo: 'gusto', orden: 1, activo: true, sistema: false, padre: null, descripcion: '', origen: 'manual', anclas: { artistas: [], titulos: [] }, tagsLastfm: [] });
  const biblioteca = bibliotecaBase();
  const { nuevosEjes } = aplicarModosConfirmados(ejesActuales, biblioteca, [{ nombre: 'Phonk', trackIds: ['t1'] }]);

  assert.equal(nuevosEjes[0].id, 'phonk-2');
});

test('transversales activados crean un eje tipo funcional y no tocan sin-clasificar de otros tracks', () => {
  const ejesActuales = ejesBase();
  const biblioteca = bibliotecaBase();
  const { nuevosEjes } = aplicarModosConfirmados(ejesActuales, biblioteca, [], [
    { id: 'entrenar', nombre: 'Entrenar', trackIds: ['t1'] },
  ]);

  assert.equal(nuevosEjes[0].tipo, 'funcional');
  assert.equal(nuevosEjes[0].origen, 'transversal');
  const t1 = biblioteca.tracks.find((t) => t.id === 't1');
  assert.equal(t1.ejes.some((a) => a.ejeId === 'sin-clasificar'), true, 'un transversal no saca sin-clasificar (no es una clasificacion real)');
});

test('modo con nombre vacio o sin trackIds se ignora sin romper el resto', () => {
  const ejesActuales = ejesBase();
  const biblioteca = bibliotecaBase();
  const { nuevosEjes } = aplicarModosConfirmados(ejesActuales, biblioteca, [
    { nombre: '   ', trackIds: ['t1'] },
    { nombre: 'Valido', trackIds: ['t2'] },
  ]);

  assert.equal(nuevosEjes.length, 1);
  assert.equal(nuevosEjes[0].nombre, 'Valido');
});

test('un modo descubierto con el nombre de una playlist importada convierte la playlist en el modo, sin crear un eje duplicado', () => {
  const ejesActuales = ejesBase();
  ejesActuales.ejes.push({ id: 'chill', nombre: 'Chill', tipo: 'playlist', orden: 1012, activo: true, sistema: false, padre: null, descripcion: 'Importada desde TuneMyMusic.', anclas: { artistas: [], titulos: [] }, tagsLastfm: [] });
  const biblioteca = bibliotecaBase();
  biblioteca.tracks[0].ejes = [{ ejeId: 'chill', origen: 'auto', senal: 'nombre-lista', score: 1 }];

  const { nuevosEjes } = aplicarModosConfirmados(ejesActuales, biblioteca, [{ nombre: 'chill', trackIds: ['t1', 't2'] }]);

  const chill = ejesActuales.ejes.filter((e) => e.nombre === 'Chill');
  assert.equal(chill.length, 1, 'un solo eje Chill');
  assert.equal(chill[0].id, 'chill');
  assert.equal(chill[0].tipo, 'gusto');
  assert.equal(chill[0].origen, 'descubierto');
  assert.equal(chill[0].orden, 1012);
  assert.equal(ejesActuales.ejes.some((e) => e.id === 'chill-2'), false);
  assert.equal(nuevosEjes.length, 0);

  const a1 = biblioteca.tracks[0].ejes.filter((a) => a.ejeId === 'chill');
  assert.equal(a1.length, 1);
  assert.equal(a1[0].origen, 'manual', 'la pertenencia de la lista no se degrada a auto');
  const a2 = biblioteca.tracks[1].ejes.find((a) => a.ejeId === 'chill');
  assert.equal(a2.origen, 'auto');
  assert.equal(biblioteca.tracks[1].ejes.some((a) => a.ejeId === 'sin-clasificar'), false);
});

test('un modo descubierto en singular convierte la playlist en plural del mismo nombre', () => {
  const ejesActuales = ejesBase();
  ejesActuales.ejes.push({ id: 'soundtracks', nombre: 'Soundtracks', tipo: 'playlist', orden: 1012, activo: true, sistema: false, padre: null, descripcion: '', anclas: { artistas: [], titulos: [] }, tagsLastfm: [] });
  const biblioteca = bibliotecaBase();
  const { nuevosEjes } = aplicarModosConfirmados(ejesActuales, biblioteca, [{ nombre: 'Soundtrack', trackIds: ['t1'] }]);
  assert.equal(nuevosEjes.length, 0);
  assert.equal(ejesActuales.ejes.filter((e) => /soundtrack/i.test(e.nombre)).length, 1);
  assert.equal(ejesActuales.ejes.find((e) => e.id === 'soundtracks').origen, 'descubierto');
});

test('un mood con autoRellenar:false no recibe canciones ni se clona', () => {
  const ejesActuales = ejesBase();
  ejesActuales.ejes.push({ id: 'mi-lista', nombre: 'Mi lista', tipo: 'playlist', origen: 'descubierto', autoRellenar: false, activo: true, sistema: false, anclas: { artistas: [], titulos: [] }, tagsLastfm: [] });
  const biblioteca = bibliotecaBase();
  const { nuevosEjes } = aplicarModosConfirmados(ejesActuales, biblioteca, [{ nombre: 'Mi Lista', trackIds: ['t1'] }, { nombre: 'Phonk', trackIds: ['t2'] }]);
  assert.deepEqual(nuevosEjes.map((e) => e.nombre), ['Phonk']);
  assert.equal(ejesActuales.ejes.filter((e) => /lista/i.test(e.nombre)).length, 1);
  assert.equal(biblioteca.tracks[0].ejes.some((a) => a.ejeId === 'mi-lista'), false);
  assert.equal(biblioteca.tracks[0].ejes.some((a) => a.ejeId === 'sin-clasificar'), true);
});
