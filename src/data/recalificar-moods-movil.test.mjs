import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenMemoria } from './lib/almacen-memoria.js';
import { CLAVE_CAMBIOS } from './lib/journal.js';
import { CLAVE_COPIA_PREVIA, CLAVE_ESQUEMA } from './migrar-moods-movil.js';
import { CLAVE_EXCLUSIONES_ESTADOS } from '../organizador/alimentar-estados.js';
import { agruparRevision, deshacerRecalificacion, devolverCancion, hayCopiaRecalificacion, leerRevision, recalificarMovil } from './recalificar-moods-movil.js';

const e = (ejeId, origen = 'auto', senal = 'migracion-moods') => ({ ejeId, origen, senal, score: 1 });
const eje = (id, nombre, familia) => ({ id, nombre, familia, tipo: 'gusto', orden: 1, activo: true, sistema: false });
const EJES = [eje('tranquilo', 'Zen', 'estado'), eje('de-fiesta', 'Party', 'estado'), eje('pop', 'Pop', 'genero'), eje('pop-bailable', 'Pop bailable', 'genero'), eje('rock', 'Rock', 'genero')];
const copiaPrevia = {
  fecha: '2026-10-21T00:00:00Z',
  ejes: [{ id: 'chill', nombre: 'Chill' }],
  biblioteca: [{ id: 't1', ejes: [e('chill', 'manual', 'usuario')] }],
  cambios: [],
  sinColocar: {},
  esquema: 0,
};
const inicial = () => ({
  ejes: EJES,
  biblioteca: [
    { id: 't1', artista: 'Alguien', titulo: 'Fiesta', ejes: [e('pop-bailable'), e('tranquilo', 'manual', 'usuario')] },
    { id: 't2', artista: 'Billie Eilish', titulo: 'lovely', ejes: [e('pop-bailable'), e('de-fiesta')] },
    { id: 't3', artista: 'Otro', titulo: 'Tema', ejes: [e('rock')] },
  ],
});
const montar = async (extra = {}) => {
  const a = crearAlmacenMemoria(inicial());
  await a.guardarValorConfig(CLAVE_ESQUEMA, 1);
  await a.guardarValorConfig(CLAVE_COPIA_PREVIA, copiaPrevia);
  for (const [k, v] of Object.entries(extra)) await a.guardarValorConfig(k, v);
  return a;
};
const ejesDe = async (a, id) => (await a.obtenerPorClave('biblioteca', id)).ejes.map((x) => x.ejeId);

test('recalifica una sola vez: guarda copia previa, lista de cambios y anota al PC', async () => {
  const a = await montar();
  const r = await recalificarMovil(a, { ahora: () => new Date('2026-10-26T10:00:00Z') });
  assert.equal(r.hecho, true);
  assert.equal(r.cambiadas, 2);
  assert.deepEqual(await ejesDe(a, 't1'), ['pop-bailable'], 'Zen heredado de Chill con Pop bailable sale');
  assert.deepEqual((await ejesDe(a, 't2')).sort(), ['pop'], 'Billie Eilish: género Pop y sin Party');
  assert.deepEqual(await hayCopiaRecalificacion(a), { fecha: '2026-10-26T10:00:00.000Z', canciones: 2 });
  assert.equal((await leerRevision(a)).cambios.length, 2);
  const cambios = (await a.obtenerValorConfig(CLAVE_CAMBIOS, [])).map((c) => `${c.endpoint}:${c.cuerpo.trackId}:${c.cuerpo.ejeId}`).sort();
  assert.deepEqual(cambios, ['asignar:t2:pop', 'quitar-modo:t1:tranquilo', 'quitar-modo:t2:de-fiesta', 'quitar-modo:t2:pop-bailable']);
  const segunda = await recalificarMovil(a);
  assert.deepEqual(segunda, { hecho: false, motivo: 'ya-hecha' });
});

test('no hace nada si el móvil aún no está reorganizado en moods', async () => {
  const a = crearAlmacenMemoria({ ejes: [{ id: 'chill', nombre: 'Chill' }], biblioteca: [{ id: 't1', artista: 'A', titulo: 'B', ejes: [e('chill')] }] });
  assert.deepEqual(await recalificarMovil(a), { hecho: false, motivo: 'sin-migrar' });
});

test('respeta las acciones del usuario anotadas en el registro de cambios', async () => {
  const a = await montar({ [CLAVE_CAMBIOS]: [{ endpoint: 'asignar', cuerpo: { trackId: 't1', ejeId: 'tranquilo' }, ts: 1 }] });
  await recalificarMovil(a);
  assert.ok((await ejesDe(a, 't1')).includes('tranquilo'));
});

test('Deshacer devuelve las canciones a como estaban y lo anota al PC', async () => {
  const a = await montar();
  const antes = JSON.stringify(await a.obtenerTodos('biblioteca'));
  await recalificarMovil(a);
  const r = await deshacerRecalificacion(a);
  assert.equal(r.canciones, 2);
  assert.equal(JSON.stringify(await a.obtenerTodos('biblioteca')), antes);
  assert.equal(await hayCopiaRecalificacion(a), null);
  assert.equal(await leerRevision(a), null);
  const ultimos = (await a.obtenerValorConfig(CLAVE_CAMBIOS, [])).slice(-4).map((c) => c.endpoint);
  assert.ok(ultimos.includes('asignar'));
});

test('Revisar: agrupa por mood y «devolver» vuelve a poner la canción como decisión del usuario', async () => {
  const a = await montar({ [CLAVE_EXCLUSIONES_ESTADOS]: { t1: ['tranquilo'] } });
  await recalificarMovil(a);
  const grupos = agruparRevision(await leerRevision(a), EJES);
  assert.deepEqual(grupos.map((g) => g.ejeId), ['tranquilo', 'de-fiesta', 'pop-bailable']);
  const zen = grupos[0].items[0];
  assert.deepEqual([zen.trackId, zen.tipo, zen.devuelto], ['t1', 'salio', false]);
  await devolverCancion(a, 't1', 'tranquilo');
  const t1 = await a.obtenerPorClave('biblioteca', 't1');
  assert.deepEqual(t1.ejes.find((x) => x.ejeId === 'tranquilo'), { ejeId: 'tranquilo', origen: 'manual', senal: 'usuario', score: 1 });
  assert.equal((await a.obtenerValorConfig(CLAVE_EXCLUSIONES_ESTADOS, {})).t1, undefined, 'deja de estar excluida');
  assert.equal(agruparRevision(await leerRevision(a), EJES)[0].items[0].devuelto, true);
  // devolver el género que se cambió: vuelve el viejo y se retira el que se puso
  await devolverCancion(a, 't2', 'pop-bailable');
  const t2 = (await a.obtenerPorClave('biblioteca', 't2')).ejes.map((x) => x.ejeId).sort();
  assert.deepEqual(t2, ['pop-bailable']);
  // una segunda recalificación nunca pisaría lo devuelto (es manual y real)
  const c = (await a.obtenerPorClave('biblioteca', 't1')).ejes.find((x) => x.ejeId === 'tranquilo');
  assert.equal(c.origen, 'manual');
});
