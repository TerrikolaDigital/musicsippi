import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seleccionarSinConexion, filtrarDisponibles, filtrarCola, restaurarCola,
  leerAjustesSinConexion, guardarAjustesSinConexion, LIMITES_MB, EVENTO_AJUSTES,
  URL_SIN_CONEXION, urlSinConexion, formatearTamano, claveSeleccion,
  fusionarEstado, etiquetaLimite, textoFranjaSinConexion, textoEspacioUsado, textoResumenSinConexion, favoritasNoCaben,
} from './sin-conexion.js';

const DIA = 86400000;
const AHORA = Date.UTC(2026, 9, 26);
const tr = (id, extra = {}) => ({ id, artista: `Art ${id}`, titulo: `Tit ${id}`, youtubeVideoId: `v${id}`, ejes: [], ...extra });
const fav = (id, extra = {}) => tr(id, { ejes: [{ ejeId: 'favoritos' }], ...extra });
const esc = (trackId, dias) => ({ trackId, ts: AHORA - dias * DIA });
const videoIdDe = (t) => t.youtubeVideoId ?? null;
const base = { noMeGusta: [], idsLocales: new Set(), videoIdDe, ahora: AHORA };

test('favoritas primero, por su última escucha', () => {
  const tracks = [tr('x'), fav('f1'), fav('f2'), fav('f3')];
  const historial = [esc('x', 1), esc('x', 2), esc('f1', 30), esc('f2', 5), esc('f2', 40)];
  const r = seleccionarSinConexion({ ...base, tracks, historial });
  assert.deepEqual(r.ids, ['vf2', 'vf1', 'vf3', 'vx']);
  assert.equal(r.nFavoritas, 3);
});

test('recientes antes que antiguas', () => {
  const tracks = [tr('B'), tr('A'), tr('C')];
  const historial = [esc('A', 1), esc('A', 1), ...Array.from({ length: 10 }, () => esc('B', 200))];
  const r = seleccionarSinConexion({ ...base, tracks, historial });
  assert.deepEqual(r.ids, ['vA', 'vB']);
  assert.equal(r.nFavoritas, 0);
});

test('excluye no me gusta, locales y sin videoId', () => {
  const tracks = [fav('a'), fav('b'), fav('c'), fav('d', { youtubeVideoId: null }), fav('e')];
  const marcas = [{ tipo: 'artista', clave: 'art a', etiqueta: 'Art a' }];
  const r = seleccionarSinConexion({
    ...base, tracks, historial: [], noMeGusta: marcas, idsLocales: new Set(['b']),
  });
  assert.deepEqual(r.ids.sort(), ['vc', 've']);
  assert.equal(r.nFavoritas, 2);
});

test('sin repetidos por videoId', () => {
  const tracks = [fav('a', { youtubeVideoId: 'dup' }), fav('b', { youtubeVideoId: 'dup' })];
  const r = seleccionarSinConexion({ ...base, tracks, historial: [] });
  assert.deepEqual(r.ids, ['dup']);
  assert.equal(r.nFavoritas, 1);
});

test('filtrarDisponibles deja guardadas por videoId y locales por trackId, sin mutar', () => {
  const tracks = [tr('a'), tr('b'), tr('c')];
  const copia = [...tracks];
  const r = filtrarDisponibles(tracks, { guardados: new Set(['va']), idsLocales: new Set(['b']), videoIdDe });
  assert.deepEqual(r.map((t) => t.id), ['a', 'b']);
  assert.notEqual(r, tracks);
  assert.deepEqual(tracks, copia);
});

test('filtrarCola quita no disponibles, conserva la actual y recalcula indice', () => {
  const cola = [tr('a'), tr('b'), tr('c'), tr('d')];
  const disp = (t) => t.id === 'a' || t.id === 'd';
  const r = filtrarCola(cola, 2, disp);
  assert.deepEqual(r.cola.map((t) => t.id), ['a', 'c', 'd']);
  assert.equal(r.indice, 1);
  assert.equal(cola.length, 4);
  const r2 = filtrarCola(cola, 3, disp);
  assert.deepEqual(r2.cola.map((t) => t.id), ['a', 'd']);
  assert.equal(r2.indice, 1);
});

test('ajustes por defecto y guardado', () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  const eventos = [];
  globalThis.window = { dispatchEvent: (e) => eventos.push(e.type) };
  assert.deepEqual(leerAjustesSinConexion(), { activado: true, limiteMb: 1024 });
  guardarAjustesSinConexion({ limiteMb: 2048 });
  assert.deepEqual(leerAjustesSinConexion(), { activado: true, limiteMb: 2048 });
  guardarAjustesSinConexion({ activado: false });
  assert.deepEqual(leerAjustesSinConexion(), { activado: false, limiteMb: 2048 });
  assert.deepEqual(eventos, [EVENTO_AJUSTES, EVENTO_AJUSTES]);
  assert.deepEqual(LIMITES_MB, [500, 1024, 2048, 4096]);
  mem.set('sinConexion', '{roto');
  assert.deepEqual(leerAjustesSinConexion(), { activado: true, limiteMb: 1024 });
  delete globalThis.localStorage; delete globalThis.window;
});

test('url y formato de tamaño', () => {
  assert.equal(urlSinConexion('abc'), `${URL_SIN_CONEXION}abc`);
  assert.equal(formatearTamano(0), '0 MB');
  assert.equal(formatearTamano(367001600), '350 MB');
  assert.equal(formatearTamano(1288490189), '1,2 GB');
});

test('claveSeleccion: igual para la misma selección y ajustes, distinta si cambia algo', () => {
  const aj = { activado: true, limiteMb: 1024 };
  assert.equal(claveSeleccion(['a', 'b'], aj), claveSeleccion(['a', 'b'], { ...aj }));
  assert.notEqual(claveSeleccion(['a', 'b'], aj), claveSeleccion(['b', 'a'], aj));
  assert.notEqual(claveSeleccion(['a'], aj), claveSeleccion(['a'], { ...aj, limiteMb: 500 }));
  assert.notEqual(claveSeleccion(['a'], aj), claveSeleccion(['a'], { ...aj, activado: false }));
});

test('textos de la UI sin conexión', () => {
  assert.equal(etiquetaLimite(500), '500 MB');
  assert.equal(etiquetaLimite(4096), '4 GB');
  assert.equal(textoFranjaSinConexion(1), 'Sin conexión · 1 canción guardada');
  assert.equal(textoFranjaSinConexion(12), 'Sin conexión · 12 canciones guardadas');
  assert.equal(textoEspacioUsado({ bytes: 367001600, limiteMb: 1024, n: 12 }), 'Espacio usado: 350 MB de 1 GB · 12 canciones');
  assert.equal(textoResumenSinConexion({ n: 1, bytes: 0 }), '1 canción · 0 MB');
  assert.equal(favoritasNoCaben(3, 10), true);
  assert.equal(favoritasNoCaben(10, 10), false);
  assert.equal(favoritasNoCaben(-1, 10), false);
});

test('ajustes: un límite fuera de la lista (0, negativo, otro) vale el de por defecto', () => {
  for (const malo of [0, -5, 300, 1.5, '1024', null]) {
    globalThis.localStorage = { getItem: () => JSON.stringify({ activado: true, limiteMb: malo }), setItem() {} };
    assert.equal(leerAjustesSinConexion().limiteMb, 1024, String(malo));
  }
  for (const bueno of LIMITES_MB) {
    globalThis.localStorage = { getItem: () => JSON.stringify({ activado: true, limiteMb: bueno }), setItem() {} };
    assert.equal(leerAjustesSinConexion().limiteMb, bueno);
  }
  delete globalThis.localStorage;
});

test('fusionarEstado: sin cambios reales devuelve el mismo estado', () => {
  const e = { hayRed: true, guardados: new Set(['a', 'b']), bytesUsados: 5, sonoridad: { a: -3 } };
  assert.equal(fusionarEstado(e, { hayRed: true }), e);
  assert.equal(fusionarEstado(e, { guardados: new Set(['b', 'a']), bytesUsados: 5, sonoridad: { a: -3 } }), e);
});

test('fusionarEstado: con cambios crea estado nuevo y conserva el Set si sus ids son los mismos', () => {
  const e = { hayRed: true, guardados: new Set(['a']), bytesUsados: 5, sonoridad: {} };
  const n = fusionarEstado(e, { hayRed: false, guardados: new Set(['a']) });
  assert.notEqual(n, e);
  assert.equal(n.hayRed, false);
  assert.equal(n.guardados, e.guardados);
  const m = fusionarEstado(e, { guardados: new Set(['a', 'c']) });
  assert.deepEqual([...m.guardados], ['a', 'c']);
});

test('filtrarDisponibles tolera guardados o idsLocales sin definir', () => {
  const tracks = [tr('a'), tr('b')];
  assert.deepEqual(filtrarDisponibles(tracks, { videoIdDe }), []);
  assert.deepEqual(filtrarDisponibles(tracks, { guardados: new Set(['vb']), videoIdDe }).map((t) => t.id), ['b']);
  assert.deepEqual(filtrarDisponibles(tracks, { idsLocales: new Set(['a']), videoIdDe }).map((t) => t.id), ['a']);
});

test('restaurarCola devuelve la cola completa con el índice en la pista actual', () => {
  const guardada = [tr('a'), tr('b'), tr('c'), tr('d')];
  const actual = [guardada[0], guardada[3]];
  const r = restaurarCola(guardada, actual, 1);
  assert.deepEqual(r.cola.map((t) => t.id), ['a', 'b', 'c', 'd']);
  assert.equal(r.indice, 3);
  assert.notEqual(r.cola, guardada);
  // por id si la referencia cambió
  assert.equal(restaurarCola(guardada, [{ ...guardada[2] }], 0).indice, 2);
});

test('restaurarCola descarta si el usuario cambió de cola o no hay nada', () => {
  const guardada = [tr('a'), tr('b')];
  assert.equal(restaurarCola(guardada, [tr('z')], 0), null);
  assert.equal(restaurarCola(null, [tr('a')], 0), null);
  assert.equal(restaurarCola([], [tr('a')], 0), null);
  assert.equal(restaurarCola(guardada, [], 0), null);
  assert.equal(restaurarCola(guardada, [tr('a')], 5), null);
});

test('recencia: a 59,9 días cuenta como reciente y a 60,1 pasa a «total»', () => {
  const tracks = [tr('viejo'), tr('limite')];
  const historial = [
    esc('viejo', 60.1), esc('viejo', 60.1), esc('viejo', 61),
    esc('limite', 59.9),
  ];
  const r = seleccionarSinConexion({ ...base, tracks, historial });
  assert.deepEqual(r.ids, ['vlimite', 'vviejo']);
  // dos con 60,1 días: ninguno es reciente, manda el nº de escuchas
  const r2 = seleccionarSinConexion({ ...base, tracks, historial: [esc('limite', 60.1), esc('viejo', 60.1), esc('viejo', 70)] });
  assert.deepEqual(r2.ids, ['vviejo', 'vlimite']);
});

test('favoritas con la misma última escucha se ordenan por título', () => {
  const tracks = [fav('1', { titulo: 'Zeta' }), fav('2', { titulo: 'Alfa' }), fav('3', { titulo: 'Mu' })];
  const historial = [esc('1', 3), esc('2', 3), esc('3', 3)];
  const r = seleccionarSinConexion({ ...base, tracks, historial });
  assert.deepEqual(r.ids, ['v2', 'v3', 'v1']);
});

test('grupo «total»: orden por nº de escuchas descendente', () => {
  const tracks = [tr('a'), tr('b'), tr('c')];
  const historial = [esc('a', 100), esc('b', 100), esc('b', 120), esc('b', 130), esc('c', 100), esc('c', 110)];
  const r = seleccionarSinConexion({ ...base, tracks, historial });
  assert.deepEqual(r.ids, ['vb', 'vc', 'va']);
});

test('filtrarCola con cola vacía o índice fuera de rango', () => {
  assert.deepEqual(filtrarCola([], 0, () => false), { cola: [], indice: 0 });
  const cola = [tr('a'), tr('b'), tr('c')];
  const r = filtrarCola(cola, 9, (t) => t.id === 'b');
  assert.deepEqual(r.cola.map((t) => t.id), ['b']);
  assert.equal(r.indice, 0);
  assert.equal(filtrarCola(cola, -1, () => false).cola.length, 0);
});
