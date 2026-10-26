import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarResultado } from './aplicar.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';

const sin = () => [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }];
const almacenBase = () =>
  crearAlmacenMemoria({
    biblioteca: [
      { id: 't1', artista: 'A', titulo: 'Uno', fuentes: ['movil'], ejes: sin() },
      { id: 't2', artista: 'B', titulo: 'Dos', fuentes: ['movil'], ejes: sin() },
    ],
    ejes: [{ id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', orden: 999, activo: true, sistema: true }],
  });
const resultado = {
  modosConfirmados: [{ nombre: 'Rock', trackIds: ['t1', 't2'] }],
  senalPorTrack: { t1: 'genero-musicbrainz', t2: 'ia-embeddings' },
  vectoresNuevos: [{ trackId: 't1', hash: 'h', vector: Float32Array.from([1, 0]) }],
};

test('crea el modo con el id del PC, coloca las canciones y lo anota para el PC', async () => {
  const almacen = almacenBase();
  const r = await aplicarResultado(resultado, almacen);
  assert.deepEqual(r, { modosNuevos: [{ id: 'rock', nombre: 'Rock' }], colocadas: 2 });
  const eje = await almacen.obtenerPorClave('ejes', 'rock');
  assert.equal(eje.origen, 'descubierto');
  const t1 = await almacen.obtenerPorClave('biblioteca', 't1');
  assert.deepEqual(t1.ejes, [{ ejeId: 'rock', origen: 'auto', senal: 'genero-musicbrainz', score: 1 }]);
  assert.ok(await almacen.obtenerPorClave('vectores', 't1'));
  const cambios = await almacen.obtenerValorConfig('cambiosPendientes', []);
  assert.deepEqual(cambios.map((c) => c.endpoint), ['confirmar-modos']);
  assert.deepEqual(cambios[0].cuerpo, { modosConfirmados: resultado.modosConfirmados, transversalesActivados: [] });
});

test('aplicarlo dos veces no crea «rock-2» ni cuenta de nuevo', async () => {
  const almacen = almacenBase();
  await aplicarResultado(resultado, almacen);
  const r = await aplicarResultado(resultado, almacen);
  assert.deepEqual(r, { modosNuevos: [], colocadas: 0 });
  assert.equal((await almacen.obtenerTodos('ejes')).filter((e) => e.origen === 'descubierto').length, 1);
});

test('sin modos no escribe nada en el registro', async () => {
  const almacen = almacenBase();
  const r = await aplicarResultado({ modosConfirmados: [], senalPorTrack: {}, vectoresNuevos: [] }, almacen);
  assert.deepEqual(r, { modosNuevos: [], colocadas: 0 });
  assert.deepEqual(await almacen.obtenerValorConfig('cambiosPendientes', []), []);
});

test('el cambio queda anotado para el PC aunque falle guardar la biblioteca', async () => {
  const almacen = almacenBase();
  const guardarVarios = almacen.guardarVarios;
  almacen.guardarVarios = async (nombre, valores) => {
    if (nombre === 'biblioteca') throw new Error('app cerrada');
    return guardarVarios(nombre, valores);
  };
  await assert.rejects(aplicarResultado(resultado, almacen), /app cerrada/);
  const cambios = await almacen.obtenerValorConfig('cambiosPendientes', []);
  assert.deepEqual(cambios.map((c) => c.endpoint), ['confirmar-modos']);
  const t1 = await almacen.obtenerPorClave('biblioteca', 't1');
  assert.equal(t1.ejes[0].ejeId, 'sin-clasificar', 'la reanudación aún las ve');
});

test('una lista importada del mismo nombre se convierte en el modo y se guarda convertida', async () => {
  const almacen = almacenBase();
  await almacen.guardarRegistro('ejes', { id: 'rock', nombre: 'Rock', tipo: 'playlist', orden: 5, activo: true, sistema: false });
  const r = await aplicarResultado(resultado, almacen);
  assert.deepEqual(r.modosNuevos, []);
  const eje = await almacen.obtenerPorClave('ejes', 'rock');
  assert.equal(eje.origen, 'descubierto');
  assert.equal(eje.tipo, 'gusto');
  assert.equal(r.colocadas, 2);
});
