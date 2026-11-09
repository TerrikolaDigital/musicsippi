import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artistasAPreguntar, esSaltoRapido, reiniciaPorEscucha, registrarSalto, reiniciarCancion } from './saltos.js';

const t = { id: '1', artista: 'Ana', titulo: 'Sol' };
const vacio = { canciones: {} };
const marcaSaltos = (artista, titulo) => ({ tipo: 'cancion', clave: `${artista}|${titulo}`.toLowerCase(), origen: 'saltos', artista });

test('tres saltos marcan', () => {
  let r = registrarSalto(vacio, t, 0);
  r = registrarSalto(r.estado, t, 5000);
  assert.equal(r.marcar, false);
  r = registrarSalto(r.estado, t, 10000);
  assert.equal(r.marcar, true);
});

test('dos saltos no marcan', () => {
  const r = registrarSalto(registrarSalto(vacio, t, 0).estado, t, 5000);
  assert.equal(r.marcar, false);
  assert.equal(Object.values(r.estado.canciones)[0].n, 2);
});

test('mismo track en 2 s cuenta una vez', () => {
  const a = registrarSalto(vacio, t, 1000);
  const b = registrarSalto(a.estado, t, 2500);
  assert.equal(Object.values(b.estado.canciones)[0].n, 1);
  const c = registrarSalto(b.estado, t, 3100);
  assert.equal(Object.values(c.estado.canciones)[0].n, 2);
});

test('reiniciar pone a cero', () => {
  const a = registrarSalto(vacio, t, 0);
  const b = reiniciarCancion(a.estado, t);
  assert.deepEqual(b.canciones, {});
  assert.equal(registrarSalto(b, t, 100000).marcar, false);
});

test('9,9 s cuenta y 10 s no', () => {
  assert.equal(esSaltoRapido(9.9), true);
  assert.equal(esSaltoRapido(10), false);
  assert.equal(esSaltoRapido(1), true);
});

test('0,5 s no cuenta', () => {
  assert.equal(esSaltoRapido(0.5), false);
});

test('artista compuesto suma a cada uno', () => {
  const marcas = [
    ...[1, 2, 3].map((i) => marcaSaltos('Ana, Beto', `c${i}`)),
    marcaSaltos('Beto', 'c4'),
  ];
  const r = artistasAPreguntar(marcas, {});
  assert.deepEqual(r, [{ nombre: 'Beto', n: 4 }]);
  const r2 = artistasAPreguntar([...marcas, marcaSaltos('Ana', 'c5')], {});
  assert.deepEqual(r2.map((x) => x.nombre).sort(), ['Ana', 'Beto']);
});

test('marcas manuales no cuentan', () => {
  const marcas = [1, 2, 3, 4].map((i) => ({ tipo: 'cancion', clave: `ana|c${i}`, artista: 'Ana' }));
  assert.deepEqual(artistasAPreguntar(marcas, {}), []);
});

test('cuatro preguntan y tres no', () => {
  const tres = [1, 2, 3].map((i) => marcaSaltos('Ana', `c${i}`));
  assert.deepEqual(artistasAPreguntar(tres, {}), []);
  assert.deepEqual(artistasAPreguntar([...tres, marcaSaltos('Ana', 'c4')], {}), [{ nombre: 'Ana', n: 4 }]);
});

test('artista ya marcado no se pregunta', () => {
  const marcas = [1, 2, 3, 4].map((i) => marcaSaltos('Ana', `c${i}`));
  marcas.push({ tipo: 'artista', clave: 'ana' });
  assert.deepEqual(artistasAPreguntar(marcas, {}), []);
});

test('rechazado con n=4 no repite y con n=5 sí', () => {
  const marcas = [1, 2, 3, 4].map((i) => marcaSaltos('Ana', `c${i}`));
  assert.deepEqual(artistasAPreguntar(marcas, { ana: 4 }), []);
  const cinco = [...marcas, marcaSaltos('Ana', 'c5')];
  assert.deepEqual(artistasAPreguntar(cinco, { ana: 4 }), [{ nombre: 'Ana', n: 5 }]);
});

test('reiniciaPorEscucha: 0.7 no reinicia, 0.71 sí', () => {
  assert.equal(reiniciaPorEscucha(0.7), false);
  assert.equal(reiniciaPorEscucha(0.71), true);
});

test('salto nativo anterior al de JS cuenta una vez', () => {
  const a = registrarSalto(vacio, t, 10000);
  const b = registrarSalto(a.estado, t, 9000);
  assert.equal(Object.values(b.estado.canciones)[0].n, 1);
  const c = registrarSalto(b.estado, t, 7000);
  assert.equal(Object.values(c.estado.canciones)[0].n, 2);
});

import { ordenarPendientesNativos, resolverPendientesNativos } from './saltos.js';

const lib = [
  { id: 'a', artista: 'Ana', titulo: 'Sol' },
  { id: 'b', artista: '米津玄師', titulo: 'Lemon' },
  { id: 'c', artista: 'Beto', titulo: 'Luna', youtubeVideoId: 'vid-c' },
];

test('ordenarPendientesNativos ordena por ts y es estable', () => {
  const r = ordenarPendientesNativos([{ id: 'x', ts: 30 }, { id: 'y', ts: 10 }, { id: 'z', ts: 10 }]);
  assert.deepEqual(r.map((s) => s.id), ['y', 'z', 'x']);
  assert.deepEqual(ordenarPendientesNativos(null), []);
});

test('con título y artista se busca por clave aunque no haya cola ni videoIds', () => {
  const s = { id: 'local:a', titulo: 'sol', artista: 'ANA', segundos: 4, ts: 1 };
  const { resueltos, retenidos } = resolverPendientesNativos([s], { tracks: lib, bibliotecaCargada: true, cola: [] });
  assert.equal(resueltos[0].track.id, 'a');
  assert.deepEqual(retenidos, []);
});

test('funciona con artistas no latinos', () => {
  const s = { id: 'v', titulo: 'Lemon', artista: '米津玄師', tipo: 'oida', fraccion: 0.9, ts: 1 };
  const { resueltos } = resolverPendientesNativos([s], { tracks: lib, bibliotecaCargada: true });
  assert.equal(resueltos[0].track.id, 'b');
});

test('con la biblioteca sin cargar se retiene', () => {
  const s = { id: 'v', titulo: 'Sol', artista: 'Ana', ts: 1 };
  const { resueltos, retenidos } = resolverPendientesNativos([s], { tracks: [], bibliotecaCargada: false });
  assert.deepEqual(resueltos, []);
  assert.deepEqual(retenidos, [s]);
});

test('sin título: por id entre la cola, y se retiene mientras la cola está vacía', () => {
  const s = { id: 'vid-c', segundos: 3, ts: 1 };
  const vacia = resolverPendientesNativos([s], { tracks: lib, bibliotecaCargada: true, cola: [] });
  assert.deepEqual(vacia.retenidos, [s]);
  const con = resolverPendientesNativos([s], { tracks: lib, bibliotecaCargada: true, cola: [lib[2]] });
  assert.equal(con.resueltos[0].track.id, 'c');
});

test('sin título, ids resueltos en sesión o local: vía idsDe', () => {
  const idsDe = (t) => [`local:${t.id}`, ...(t.id === 'a' ? ['resuelto-a'] : [])];
  const r = resolverPendientesNativos([{ id: 'local:b' }, { id: 'resuelto-a' }], { tracks: lib, bibliotecaCargada: true, cola: [lib[0], lib[1]], idsDe });
  assert.deepEqual(r.resueltos.map((x) => x.track.id), ['b', 'a']);
});

test('lo que no se encuentra se descarta', () => {
  const r = resolverPendientesNativos([{ id: 'zz', titulo: 'Nada', artista: 'Nadie' }], { tracks: lib, bibliotecaCargada: true });
  assert.deepEqual(r, { resueltos: [], retenidos: [] });
});

import { cuentaComoSaltoUsuario } from './saltos.js';

test('Siguiente de la app cuenta solo si sonaba de verdad y con señal', () => {
  const ok = { esMovil: true, hayCancion: true, sonando: true, estadoResolucion: null, senalDebilActivo: false, pistaRespaldo: null };
  assert.equal(cuentaComoSaltoUsuario(ok), true);
  assert.equal(cuentaComoSaltoUsuario({ ...ok, esMovil: false }), false);
  assert.equal(cuentaComoSaltoUsuario({ ...ok, hayCancion: false }), false);
  assert.equal(cuentaComoSaltoUsuario({ ...ok, sonando: false }), false);
  assert.equal(cuentaComoSaltoUsuario({ ...ok, estadoResolucion: 'resolviendo' }), false);
  assert.equal(cuentaComoSaltoUsuario({ ...ok, senalDebilActivo: true }), false);
  assert.equal(cuentaComoSaltoUsuario({ ...ok, pistaRespaldo: { videoId: 'v', trackId: 't' } }), false);
  assert.equal(cuentaComoSaltoUsuario({ ...ok, senalDebilActivo: undefined, pistaRespaldo: undefined }), true);
});

test('una reproducción anotada se conserva aunque la canción no esté en la biblioteca ni en la cola', () => {
  const nota = { id: 'vid', tipo: 'reproduccion', titulo: 'Fuera', artista: 'Nadie', ts: 1 };
  const { resueltos, retenidos } = resolverPendientesNativos([nota], { tracks: [], bibliotecaCargada: true });
  assert.deepEqual(resueltos, [{ salto: nota, track: null }]);
  assert.deepEqual(retenidos, []);
});

test('una reproducción anotada sin artista se busca igual por título', () => {
  const nota = { id: 'vid', tipo: 'reproduccion', titulo: 'Fuera', ts: 1 };
  const { resueltos } = resolverPendientesNativos([nota], { tracks: [], bibliotecaCargada: true });
  assert.equal(resueltos.length, 1);
});

test('una reproducción anotada espera a que cargue la biblioteca', () => {
  const nota = { id: 'vid', tipo: 'reproduccion', titulo: 'Fuera', artista: 'Nadie', ts: 1 };
  const { resueltos, retenidos } = resolverPendientesNativos([nota], { tracks: [], bibliotecaCargada: false });
  assert.deepEqual(resueltos, []);
  assert.deepEqual(retenidos, [nota]);
});
