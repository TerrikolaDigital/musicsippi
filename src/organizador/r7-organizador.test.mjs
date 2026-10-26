// R7 y R2 en el organizador: cola de género, rellenado por parecido y vetos al aplicar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEntrada } from './entrada.js';
import { calcularOrganizacion } from './calculo.js';
import { aplicarResultado } from './aplicar.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';

const eje = (id, familia, extra = {}) => ({ id, nombre: id, familia, tipo: 'gusto', orden: 1, activo: true, sistema: false, ...extra });
const fuentes = { vocabulario: { sinonimos: {}, patronesTitulo: [], nombresHumanos: { rock: 'Rock' } }, umbrales: { masaMinima: 25, masaMinimaPorcentaje: 0.03 } };

test('R7: una canción con solo un estado (sin género) entra en la cola; con género, no', async () => {
  const almacen = crearAlmacenMemoria({
    biblioteca: [
      { id: 'a', artista: 'A', titulo: 'Solo Power', fuentes: ['movil'], ejes: [{ ejeId: 'con-energia' }] },
      { id: 'b', artista: 'B', titulo: 'Power y Pop', fuentes: ['movil'], ejes: [{ ejeId: 'con-energia' }, { ejeId: 'pop' }] },
      { id: 'c', artista: 'C', titulo: 'Solo BSO', fuentes: ['movil'], ejes: [{ ejeId: 'bandas-sonoras' }] },
      { id: 'd', artista: 'D', titulo: 'Zen y favorita', fuentes: ['movil'], ejes: [{ ejeId: 'tranquilo' }, { ejeId: 'favoritos' }] },
    ],
    ejes: [eje('con-energia', 'estado'), eje('tranquilo', 'estado'), eje('pop', 'genero'), eje('bandas-sonoras', 'genero')],
  });
  const e = await prepararEntrada(almacen, fuentes);
  assert.deepEqual(e.tracks.map((t) => t.id).sort(), ['a', 'd']);
});

test('R7/R2: por parecido solo se rellenan los géneros, nunca un estado «descubierto»', async () => {
  const embeber = async (texto) => (texto.toLowerCase().includes('rock') ? Float32Array.from([1, 0]) : Float32Array.from([0, 1]));
  const base = { tipo: 'gusto', origen: 'descubierto', activo: true, sistema: false, anclas: { artistas: [], titulos: [] }, tagsLastfm: [] };
  const entrada = {
    tracks: [{ id: 't9', artista: 'Z', titulo: 'Rockera', ejes: [] }],
    evidencia: [],
    ejes: [{ ...base, id: 'rock-zen', nombre: 'Rock zen', familia: 'estado' }],
    fuentes,
    totalTracks: 1,
    vectoresPrevios: [],
  };
  const r = await calcularOrganizacion(entrada, { embeber });
  assert.ok(!r.modosConfirmados.some((m) => m.nombre === 'Rock zen'));
  const conGenero = await calcularOrganizacion({ ...entrada, ejes: [{ ...base, id: 'rock', nombre: 'Rock', familia: 'genero' }] }, { embeber });
  assert.ok(conGenero.modosConfirmados.some((m) => m.nombre === 'Rock'));
});

test('R2: el género nuevo no convive con un estado que lo veta: se quita el estado de lista y se respeta el manual', async () => {
  const almacen = crearAlmacenMemoria({
    biblioteca: [
      { id: 't1', artista: 'A', titulo: 'Uno', fuentes: ['movil'], ejes: [{ ejeId: 'tranquilo', origen: 'lista', senal: 'lista-importada', score: 1.5 }] },
      { id: 't2', artista: 'B', titulo: 'Dos', fuentes: ['movil'], ejes: [{ ejeId: 'tranquilo', origen: 'manual', senal: 'usuario', score: 1 }] },
    ],
    ejes: [eje('tranquilo', 'estado'), eje('rock', 'genero', { origen: 'descubierto' })],
  });
  await aplicarResultado({ modosConfirmados: [{ nombre: 'rock', trackIds: ['t1', 't2'] }], senalPorTrack: {}, vectoresNuevos: [] }, almacen);
  const t1 = await almacen.obtenerPorClave('biblioteca', 't1');
  const t2 = await almacen.obtenerPorClave('biblioteca', 't2');
  assert.deepEqual(t1.ejes.map((x) => x.ejeId), ['rock']);
  assert.deepEqual(t2.ejes.map((x) => x.ejeId), ['tranquilo'], 'lo puesto a mano gana: el género no se queda');
  const cambios = await almacen.obtenerValorConfig('cambiosPendientes', []);
  assert.deepEqual(cambios.map((c) => `${c.endpoint}:${c.cuerpo.trackId ?? ''}:${c.cuerpo.ejeId ?? ''}`), ['confirmar-modos::', 'quitar-modo:t1:tranquilo', 'quitar-modo:t2:rock']);
});
