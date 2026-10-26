import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';
import { seguir, dejarDeSeguir, listarSeguidas, debeComprobar, comprobarSeguidas, urlCanonica, hayConexion } from './seguidas.js';
import { detectarOrigen } from './enlace.js';

const H = 3600 * 1000;
const AHORA = 1_000_000_000_000;

async function conSeguidas(...lecturas) {
  const almacen = crearAlmacenMemoria();
  for (const [id, hace] of lecturas) {
    await seguir({ origen: 'deezer', id, nombre: `L${id}` }, hace === null ? NaN : AHORA - hace * H, almacen);
  }
  return almacen;
}

function dobles({ fallaLeer = [], fallaImportar = [], nuevas = {} } = {}) {
  const llamadas = { leer: [], importar: [], organizar: [], avisos: [] };
  return {
    llamadas,
    leer: async (url) => {
      llamadas.leer.push(url);
      const id = url.split('/').pop();
      if (fallaLeer.includes(id)) throw new Error('red caída');
      return { nombre: `L${id}`, filas: [] };
    },
    importar: async (lectura) => {
      llamadas.importar.push(lectura.nombre);
      if (fallaImportar.includes(lectura.nombre)) throw new Error('disco lleno');
      return { tracksNuevos: nuevas[lectura.nombre] ?? 0 };
    },
    organizar: async (o) => llamadas.organizar.push(o),
    avisar: (m) => llamadas.avisos.push(m),
    hayRed: async () => true,
  };
}

test('debeComprobar: nunca leída sí, 23 h no, 24 h y 25 h sí', () => {
  assert.equal(debeComprobar({}, AHORA), true);
  assert.equal(debeComprobar({ ultimaLectura: null }, AHORA), true);
  assert.equal(debeComprobar({ ultimaLectura: AHORA - 23 * H }, AHORA), false);
  assert.equal(debeComprobar({ ultimaLectura: AHORA - 24 * H }, AHORA), true);
  assert.equal(debeComprobar({ ultimaLectura: AHORA - 25 * H }, AHORA), true);
});

test('seguir guarda la playlist, listar la devuelve y dejarDeSeguir la quita', async () => {
  const almacen = crearAlmacenMemoria();
  await seguir({ origen: 'spotify', id: '37i9dQZF1DXcBWIGoYBM5M', nombre: 'Lounge' }, AHORA, almacen);
  const [s] = await listarSeguidas(almacen);
  assert.deepEqual(s, {
    clave: 'spotify:37i9dQZF1DXcBWIGoYBM5M',
    origen: 'spotify',
    id: '37i9dQZF1DXcBWIGoYBM5M',
    url: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
    nombre: 'Lounge',
    ejeId: null,
    ultimaLectura: AHORA,
  });
  await dejarDeSeguir(s.clave, almacen);
  assert.deepEqual(await listarSeguidas(almacen), []);
});

test('el enlace canónico se reconoce con detectarOrigen', () => {
  for (const [origen, id] of [['spotify', '37i9dQZF1DXcBWIGoYBM5M'], ['deezer', '123456'], ['youtube', 'PLabc123']]) {
    assert.deepEqual(detectarOrigen(urlCanonica(origen, id)), { origen, id });
  }
});

test('nunca leída se lee; 23 h no; 25 h sí', async () => {
  const almacen = await conSeguidas(['1', null], ['2', 23], ['3', 25]);
  const d = dobles();
  const r = await comprobarSeguidas({ ahoraMs: AHORA, ...d, almacen });
  assert.deepEqual(d.llamadas.leer.sort(), ['https://www.deezer.com/playlist/1', 'https://www.deezer.com/playlist/3']);
  assert.deepEqual(r, { revisadas: 2, nuevas: 0 });
  const por = Object.fromEntries((await listarSeguidas(almacen)).map((s) => [s.id, s.ultimaLectura]));
  assert.equal(por['1'], AHORA);
  assert.equal(por['2'], AHORA - 23 * H);
  assert.equal(por['3'], AHORA);
});

test('sin conexión no lee nada', async () => {
  const almacen = await conSeguidas(['1', 30]);
  const d = dobles();
  const r = await comprobarSeguidas({ ahoraMs: AHORA, ...d, hayRed: async () => false, almacen });
  assert.deepEqual(d.llamadas.leer, []);
  assert.deepEqual(r, { revisadas: 0, nuevas: 0 });
});

test('con datos móviles sí lee: solo la falta de conexión lo impide', () => {
  assert.equal(hayConexion({ onLine: true, connection: { type: 'cellular', saveData: true } }), true);
  assert.equal(hayConexion({ onLine: false }), false);
  assert.equal(hayConexion({}), true);
});

test('guarda el ejeId del importar y lo completa al revisar si faltaba', async () => {
  const almacen = crearAlmacenMemoria();
  await seguir({ origen: 'deezer', id: '1', nombre: 'L1', ejeId: 'lounge' }, AHORA - 30 * H, almacen);
  await seguir({ origen: 'deezer', id: '2', nombre: 'L2' }, AHORA - 30 * H, almacen);
  const d = dobles();
  await comprobarSeguidas({ ahoraMs: AHORA, ...d, importar: async () => ({ tracksNuevos: 0, ejeLista: 'nuevo' }), almacen });
  const por = Object.fromEntries((await listarSeguidas(almacen)).map((s) => [s.id, s.ejeId]));
  assert.deepEqual(por, { 1: 'nuevo', 2: 'nuevo' });
  const sin = crearAlmacenMemoria();
  await seguir({ origen: 'deezer', id: '3', nombre: 'L3', ejeId: 'lounge' }, AHORA - 30 * H, sin);
  await comprobarSeguidas({ ahoraMs: AHORA, ...dobles(), importar: async () => ({ tracksNuevos: 0 }), almacen: sin });
  assert.equal((await listarSeguidas(sin))[0].ejeId, 'lounge');
});

test('un lector que lanza no impide revisar las demás y no actualiza su ultimaLectura', async () => {
  const almacen = await conSeguidas(['1', 30], ['2', 30]);
  const d = dobles({ fallaLeer: ['1'] });
  const r = await comprobarSeguidas({ ahoraMs: AHORA, ...d, almacen });
  assert.equal(r.revisadas, 1);
  assert.equal(d.llamadas.leer.length, 2);
  const por = Object.fromEntries((await listarSeguidas(almacen)).map((s) => [s.id, s.ultimaLectura]));
  assert.equal(por['1'], AHORA - 30 * H);
  assert.equal(por['2'], AHORA);
});

test('si la importación falla tampoco se da por leída', async () => {
  const almacen = await conSeguidas(['1', 30]);
  const d = dobles({ fallaImportar: ['L1'] });
  const r = await comprobarSeguidas({ ahoraMs: AHORA, ...d, almacen });
  assert.deepEqual(r, { revisadas: 0, nuevas: 0 });
  assert.equal((await listarSeguidas(almacen))[0].ultimaLectura, AHORA - 30 * H);
});

test('canciones ya existentes no cuentan: ni aviso ni organización', async () => {
  const almacen = await conSeguidas(['1', 30]);
  const d = dobles({ nuevas: { L1: 0 } });
  const r = await comprobarSeguidas({ ahoraMs: AHORA, ...d, almacen });
  assert.deepEqual(r, { revisadas: 1, nuevas: 0 });
  assert.deepEqual(d.llamadas.organizar, []);
  assert.deepEqual(d.llamadas.avisos, []);
});

test('con nuevas: un aviso por playlist y una sola organización', async () => {
  const almacen = await conSeguidas(['1', 30], ['2', 30], ['3', 30]);
  const d = dobles({ nuevas: { L1: 3, L2: 1 } });
  const r = await comprobarSeguidas({ ahoraMs: AHORA, ...d, almacen });
  assert.deepEqual(r, { revisadas: 3, nuevas: 4 });
  assert.deepEqual(d.llamadas.avisos, ['3 canciones nuevas de «L1»', '1 canción nueva de «L2»']);
  assert.deepEqual(d.llamadas.organizar, [{ motivo: 'seguidas' }]);
});

test('al importar una seguida se le pasa la seguida (con su ejeId) como destino', async () => {
  const almacen = crearAlmacenMemoria();
  await seguir({ origen: 'deezer', id: '1', nombre: 'L1', ejeId: 'chill' }, AHORA - 30 * H, almacen);
  const vistas = [];
  await comprobarSeguidas({
    ahoraMs: AHORA, ...dobles(), almacen,
    importar: async (lectura, seguida) => { vistas.push(seguida.ejeId); return { tracksNuevos: 0 }; },
  });
  assert.deepEqual(vistas, ['chill']);
});
