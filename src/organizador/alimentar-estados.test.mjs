import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alimentarEstadosPendientes, excluirDeEstado, perdonarEnEstado, registrarUsoEstado, CLAVE_EXCLUSIONES_ESTADOS, CLAVE_USO_ESTADOS } from './alimentar-estados.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';
import { CLAVE_CAMBIOS } from '../data/lib/journal.js';

const estado = (id, nombre, extra = {}) => ({ id, nombre, tipo: 'funcional', familia: 'estado', activo: true, origen: 'descubierto', autoRellenar: true, ...extra });
const pop = { id: 'pop', nombre: 'Pop', tipo: 'gusto', familia: 'genero', activo: true };
const t = (id) => ({ id, artista: 'A', titulo: id, ejes: [{ ejeId: 'pop', origen: 'auto', senal: 'x', score: 1 }] });

function almacen() {
  return crearAlmacenMemoria({
    biblioteca: [t('a'), t('b'), t('c')],
    ejes: [estado('de-fiesta', 'De fiesta'), estado('melancolico', 'Melancólico'), pop],
    metadataLocal: [{ trackId: 'a', bpm: 126 }, { trackId: 'b', bpm: 126 }, { trackId: 'c', bpm: 70 }],
    generos: [{ trackId: 'a', mbCancion: { generos: [], tags: ['party'] } }, { trackId: 'b', mbAlbum: { generos: [], tags: ['party'] } }, { trackId: 'c', mbCancion: { generos: [], tags: ['rock'] } }],
  });
}

test('alimenta con ritmo + etiquetas, guarda en la biblioteca y lo anota para el PC', async () => {
  const al = almacen();
  const r = await alimentarEstadosPendientes({ almacen: al });
  assert.equal(r.agregadas, 2);
  for (const id of ['a', 'b']) {
    const tr = await al.obtenerPorClave('biblioteca', id);
    assert.deepEqual(tr.ejes.at(-1), { ejeId: 'de-fiesta', origen: 'auto', senal: 'senales-estado', score: 1, senales: ['ritmo', 'etiquetas'] });
  }
  assert.equal((await al.obtenerPorClave('biblioteca', 'c')).ejes.length, 1, 'c solo tiene ritmo: una señal no basta');
  const cambios = await al.obtenerValorConfig(CLAVE_CAMBIOS, []);
  assert.equal(cambios.length, 1);
  assert.deepEqual(cambios[0].cuerpo.modosConfirmados, [{ nombre: 'De fiesta', trackIds: ['a', 'b'] }]);
  // Segunda vez: ya están, no hay nada nuevo ni cambios nuevos.
  assert.equal((await alimentarEstadosPendientes({ almacen: al })).agregadas, 0);
  assert.equal((await al.obtenerValorConfig(CLAVE_CAMBIOS, [])).length, 1);
});

test('lo quitado a mano no vuelve y volver a ponerlo a mano levanta la exclusión', async () => {
  const al = almacen();
  await excluirDeEstado(al, 'a', 'de-fiesta');
  await excluirDeEstado(al, 'a', 'de-fiesta');
  assert.deepEqual(await al.obtenerValorConfig(CLAVE_EXCLUSIONES_ESTADOS, {}), { a: ['de-fiesta'] });
  const r = await alimentarEstadosPendientes({ almacen: al });
  assert.equal(r.agregadas, 1);
  assert.equal((await al.obtenerPorClave('biblioteca', 'a')).ejes.length, 1);
  await perdonarEnEstado(al, 'a', 'de-fiesta');
  assert.deepEqual(await al.obtenerValorConfig(CLAVE_EXCLUSIONES_ESTADOS, {}), {});
});

test('el uso desde el chip suma y resta; una escucha a medias no cuenta', async () => {
  const al = almacen();
  await registrarUsoEstado(al, 'c', 'melancolico', 0.9);
  await registrarUsoEstado(al, 'c', 'melancolico', 0.5);
  await registrarUsoEstado(al, 'b', 'de-fiesta', 0.1);
  assert.deepEqual(await al.obtenerValorConfig(CLAVE_USO_ESTADOS, {}), { c: { melancolico: 1 }, b: { 'de-fiesta': -1 } });
  const r = await alimentarEstadosPendientes({ almacen: al });
  // c: ritmo (70 bpm) + uso -> Melancólico; b queda fuera por el salto aunque coincidan ritmo y etiquetas.
  const claves = (await al.obtenerTodos('biblioteca')).flatMap((x) => x.ejes.filter((e) => e.senal === 'senales-estado').map((e) => `${x.id}:${e.ejeId}`)).sort();
  assert.deepEqual(claves, ['a:de-fiesta', 'c:melancolico']);
  assert.equal(r.agregadas, 2);
});

test('un estado con «Se rellena sola» desactivado no recibe nada', async () => {
  const al = almacen();
  await al.guardarRegistro('ejes', estado('de-fiesta', 'De fiesta', { autoRellenar: false }));
  assert.equal((await alimentarEstadosPendientes({ almacen: al })).agregadas, 0);
});

test('Bandas sonoras en el móvil: álbum BSO o compositor de cine se SUMAN al género; lo quitado a mano no vuelve', async () => {
  const bso = { id: 'bandas-sonoras', nombre: 'Bandas sonoras', tipo: 'gusto', familia: 'genero', activo: true };
  const rock = { ...pop, id: 'rock-alternativo', nombre: 'Rock alternativo' };
  const tr = (id, artista, ejeId) => ({ id, artista, titulo: id, ejes: [{ ejeId, origen: 'auto', senal: 'x', score: 1 }] });
  const al = crearAlmacenMemoria({
    biblioteca: [tr('v', 'Eddie Vedder', 'rock-alternativo'), tr('r', 'Ramin Djawadi', 'pop'), tr('n', 'Otro', 'pop'), tr('q', 'Hans Zimmer', 'pop')],
    ejes: [bso, rock, pop],
    metadataLocal: [{ trackId: 'v', album: 'Eat Pray Love (Original Motion Picture Soundtrack)' }, { trackId: 'n', album: 'Greatest Hits' }],
  });
  await excluirDeEstado(al, 'q', 'bandas-sonoras');
  const r = await alimentarEstadosPendientes({ almacen: al });
  assert.equal(r.agregadas, 2);
  const ids = async (id) => (await al.obtenerPorClave('biblioteca', id)).ejes.map((x) => x.ejeId);
  assert.deepEqual(await ids('v'), ['rock-alternativo', 'bandas-sonoras']);
  assert.deepEqual(await ids('r'), ['pop', 'bandas-sonoras']);
  assert.deepEqual(await ids('n'), ['pop']);
  assert.deepEqual(await ids('q'), ['pop']);
  assert.equal((await alimentarEstadosPendientes({ almacen: al })).agregadas, 0);
});
