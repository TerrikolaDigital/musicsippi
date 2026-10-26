import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsFaltantes, completarVectoresBiblioteca } from './vectores-biblioteca.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';

const fuentes = { vocabulario: { sinonimos: {}, patronesTitulo: [], nombresHumanos: {} } };
const t = (id) => ({ id, artista: `A${id}`, titulo: `T${id}`, ejes: [] });

test('calcula solo las que faltan, guarda cada lote y la segunda pasada no hace nada', async () => {
  const almacen = crearAlmacenMemoria({ biblioteca: [t('a'), t('b'), t('c')] });
  const pedidos = [];
  const embeberItems = async (items, onLote) => {
    pedidos.push(items.map((i) => i.trackId));
    for (let i = 0; i < items.length; i += 2) onLote(items.slice(i, i + 2).map((x) => ({ trackId: x.trackId, hash: x.hash, vector: new Float32Array([1, 0]) })));
  };
  assert.deepEqual(await completarVectoresBiblioteca({ almacen, fuentes, embeberItems }), { calculados: 3 });
  assert.equal((await almacen.obtenerTodos('vectores')).length, 3);
  assert.deepEqual(await completarVectoresBiblioteca({ almacen, fuentes, embeberItems }), { calculados: 0 });
  // Canción nueva: solo esa.
  await almacen.guardarRegistro('biblioteca', t('d'));
  await completarVectoresBiblioteca({ almacen, fuentes, embeberItems });
  assert.deepEqual(pedidos.at(-1), ['d']);
});

test('reanudable: si se corta tras un lote, lo guardado se conserva y solo falta el resto', async () => {
  const almacen = crearAlmacenMemoria({ biblioteca: [t('a'), t('b'), t('c')] });
  const corta = async (items, onLote) => {
    onLote([{ trackId: items[0].trackId, hash: items[0].hash, vector: new Float32Array([1]) }]);
    throw new Error('app cerrada');
  };
  await assert.rejects(completarVectoresBiblioteca({ almacen, fuentes, embeberItems: corta }));
  const guardados = await almacen.obtenerTodos('vectores');
  const previos = guardados.map((v) => v.trackId);
  assert.deepEqual(previos, ['a']);
  let resto = [];
  await completarVectoresBiblioteca({ almacen, fuentes, embeberItems: async (items) => { resto = items.map((i) => i.trackId); } });
  assert.deepEqual(resto, ['b', 'c']);
});

test('itemsFaltantes: el hash distinto (otros géneros) se recalcula', () => {
  const ev = new Map([['a', { generos: ['rock'] }]]);
  const [x] = itemsFaltantes([t('a')], ev, []);
  assert.equal(itemsFaltantes([t('a')], ev, [{ trackId: 'a', hash: x.hash }]).length, 0);
  assert.equal(itemsFaltantes([t('a')], new Map([['a', { generos: ['pop'] }]]), [{ trackId: 'a', hash: x.hash }]).length, 1);
});

test('el texto del vector lleva el mood de género de la canción y cambia si se lo cambian', () => {
  const ejes = [{ id: 'tango', nombre: 'Tango', familia: 'genero' }, { id: 'rock', nombre: 'Rock', familia: 'genero' }];
  const conTango = { ...t('a'), ejes: [{ ejeId: 'tango' }] };
  const [item] = itemsFaltantes([conTango], new Map(), [], ejes);
  assert.equal(item.texto, 'Aa — Ta. Géneros: Tango.');
  assert.deepEqual(itemsFaltantes([conTango], new Map(), [{ trackId: 'a', hash: item.hash }], ejes), []);
  const conRock = { ...conTango, ejes: [{ ejeId: 'rock' }] };
  assert.equal(itemsFaltantes([conRock], new Map(), [{ trackId: 'a', hash: item.hash }], ejes).length, 1);
});
