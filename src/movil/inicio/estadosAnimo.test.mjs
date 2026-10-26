import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ANIMOS, estadosAnimo, estadosVisibles, parsearPalabras, ejesConEstados, moverVisible, conVisible,
  idLibre, sinEstadoPropio, ordenarConRecientes, marcarReciente, carruselAnimo, estadoDeEje,
} from './estadosAnimo.js';
import { ICONOS_DISPONIBLES as CATALOGO_ICONOS } from './catalogoIconos.js';

const sistema = { id: 'sin-clasificar', nombre: 'Sin clasificar', sistema: true, tipo: 'sistema' };
const ids = (l) => l.map((e) => e.id);

test('sin moods: los 6 de siempre visibles y las 4 sugerencias ocultas', () => {
  const todos = estadosAnimo([]);
  assert.deepEqual(ids(estadosVisibles([])), ['tranquilo', 'energia', 'melancolico', 'fiesta', 'feliz', 'inspirado']);
  assert.deepEqual(ids(todos.filter((e) => !e.visible)), ['lover', 'retro', 'free', 'chill']);
});

test('el mood manda: nombre, color, icono, visibilidad y orden', () => {
  const ejes = [
    sistema,
    { id: 'con-energia', nombre: 'Gym', familia: 'estado', chipId: 'energia', color: '#111111', icono: 'mancuerna', animoOrden: 0, animoVisible: true, palabras: ['gym'] },
    { id: 'tranquilo', nombre: 'Tranquilo', familia: 'estado', chipId: 'tranquilo', animoVisible: false },
  ];
  const v = estadosVisibles(ejes);
  assert.equal(v[0].id, 'energia');
  assert.equal(v[0].nombre, 'Gym');
  assert.equal(v[0].icono, 'mancuerna');
  assert.deepEqual(v[0].palabrasUsuario, ['gym']);
  assert.ok(v[0].palabras.includes('gym') && v[0].palabras.includes('workout'));
  assert.ok(!ids(v).includes('tranquilo'));
});

test('máximo 10 visibles y conVisible lo respeta', () => {
  let lista = estadosAnimo([]);
  for (const id of ['lover', 'retro', 'free']) lista = conVisible(lista, id, true) ?? lista;
  assert.equal(lista.filter((e) => e.visible).length, MAX_ANIMOS - 1);
  lista = conVisible(lista, 'chill', true);
  assert.equal(lista.filter((e) => e.visible).length, MAX_ANIMOS);
  assert.equal(conVisible(lista, 'chill', false).filter((e) => e.visible).length, MAX_ANIMOS - 1);
  const llena = lista.map((e) => ({ ...e, visible: true })).concat([{ id: 'x', visible: false }]);
  assert.equal(conVisible(llena, 'x', true), null);
});

test('mostrar una sugerencia la deja la última de los visibles', () => {
  const lista = conVisible(estadosAnimo([]), 'free', true);
  assert.deepEqual(ids(lista.filter((e) => e.visible)).slice(-2), ['inspirado', 'free']);
});

test('moverVisible sube y baja entre visibles y respeta los bordes', () => {
  const lista = estadosAnimo([]);
  assert.deepEqual(ids(moverVisible(lista, 'feliz', -1).filter((e) => e.visible)).slice(3, 5), ['feliz', 'fiesta']);
  assert.equal(moverVisible(lista, 'tranquilo', -1), lista);
  assert.equal(moverVisible(lista, 'inspirado', 1), lista);
});

test('guardar: activar una sugerencia crea un mood estado que se rellena solo, con chip y palabras', () => {
  const ejes = [sistema];
  let lista = conVisible(estadosAnimo(ejes), 'lover', true);
  lista = lista.map((e) => (e.id === 'lover' ? { ...e, palabrasUsuario: parsearPalabras('baladas, Romántico, bachata') } : e));
  const nuevos = ejesConEstados(ejes, lista);
  const lover = nuevos.find((e) => e.chipId === 'lover');
  assert.equal(lover.familia, 'estado');
  assert.equal(lover.autoRellenar, true);
  assert.equal(lover.activo, true);
  assert.deepEqual(lover.palabras, ['baladas', 'romántico', 'bachata']);
  assert.deepEqual(lover.anclas, { artistas: [], titulos: [] });
  assert.equal(lover.animoOrden, 6);
  // los seis de siempre también se crean (están visibles) con el id de la taxonomía
  assert.ok(nuevos.some((e) => e.id === 'con-energia' && e.chipId === 'energia'));
  assert.deepEqual(estadosVisibles(nuevos).map((e) => e.id).slice(-1), ['lover']);
});

test('guardar no crea moods para sugerencias ocultas y sin cambios', () => {
  const nuevos = ejesConEstados([sistema], estadosAnimo([]));
  assert.ok(!nuevos.some((e) => ['lover', 'retro', 'free', 'chill'].includes(e.chipId)));
});

test('guardar actualiza un mood existente sin tocar sus otros campos', () => {
  const ejes = [sistema, { id: 'feliz', nombre: 'Feliz', familia: 'estado', chipId: 'feliz', autoRellenar: false, orden: 5 }];
  const lista = estadosAnimo(ejes).map((e) => (e.id === 'feliz' ? { ...e, nombre: 'Contento', color: '#abcdef' } : e));
  const f = ejesConEstados(ejes, lista).find((e) => e.id === 'feliz');
  assert.equal(f.nombre, 'Contento');
  assert.equal(f.color, '#abcdef');
  assert.equal(f.autoRellenar, false);
  assert.equal(f.orden, 5);
});

test('estado propio: se ve y se puede borrar sin tocar canciones; los de siempre no se borran', () => {
  const ejes = [sistema, { id: 'gym', nombre: 'Gym', familia: 'estado', chipId: 'gym', autoRellenar: true, icono: 'mancuerna' }, { id: 'feliz', nombre: 'Feliz', familia: 'estado', chipId: 'feliz' }];
  const gym = estadosAnimo(ejes).find((e) => e.id === 'gym');
  assert.ok(gym.propio && gym.visible);
  assert.deepEqual(ids(sinEstadoPropio(ejes, 'gym')), ['sin-clasificar', 'feliz']);
  assert.equal(sinEstadoPropio(ejes, 'feliz'), ejes);
});

test('idLibre no repite ids de moods, chips ni estados de siempre', () => {
  const ejes = [{ id: 'gym', chipId: 'gym' }, { id: 'con-energia', chipId: 'energia' }];
  assert.equal(idLibre('Dream', ejes), 'dream');
  assert.equal(idLibre('Gym', ejes), 'gym-2');
  assert.equal(idLibre('Energía', ejes), 'energia-2');
  assert.equal(idLibre('Lover', []), 'lover-2');
  assert.equal(idLibre('¿¿', []), 'estado');
});

test('parsearPalabras limpia, quita repetidas y limita', () => {
  assert.deepEqual(parsearPalabras(' Baladas, romántico;BACHATA\nbaladas, a, '), ['baladas', 'romántico', 'bachata']);
  assert.deepEqual(parsearPalabras('romantico, romántico'), ['romantico']);
  assert.equal(parsearPalabras(Array.from({ length: 50 }, (_, i) => `palabra${i}`).join(',')).length, 20);
});

test('el último estado usado va primero', () => {
  const v = estadosVisibles([]);
  assert.deepEqual(ids(ordenarConRecientes(v, ['feliz', 'tranquilo'])).slice(0, 3), ['feliz', 'tranquilo', 'energia']);
  assert.deepEqual(marcarReciente(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
  assert.equal(marcarReciente([], 'x').length, 1);
});

test('carrusel: uno de siempre sin música no sale; uno propio o activado a mano sí', () => {
  const ejes = [
    sistema,
    { id: 'gym', nombre: 'Gym', familia: 'estado', chipId: 'gym' },
    { id: 'lover', nombre: 'Lover', familia: 'estado', chipId: 'lover', animoVisible: true, animoOrden: 0 },
  ];
  const r = carruselAnimo(ejes, { tracks: [], conteos: new Map() }, []);
  assert.deepEqual(ids(r), ['lover', 'gym']);
});

test('estadoDeEje da icono y color del estado propio', () => {
  const eje = { id: 'gym', nombre: 'Gym', familia: 'estado', chipId: 'gym', icono: 'mancuerna', color: '#123456' };
  const e = estadoDeEje(eje);
  assert.equal(e.icono, 'mancuerna');
  assert.equal(e.color, '#123456');
  assert.equal(estadoDeEje({ id: 'rock', familia: 'genero' }), null);
});

test('el catálogo tiene 20 iconos distintos y los 6 de siempre primero', () => {
  assert.equal(CATALOGO_ICONOS.length, 20);
  assert.equal(new Set(CATALOGO_ICONOS.map((i) => i.id)).size, 20);
  assert.deepEqual(CATALOGO_ICONOS.slice(0, 6).map((i) => i.id), ['tranquilo', 'energia', 'melancolico', 'fiesta', 'feliz', 'inspirado']);
  assert.ok(CATALOGO_ICONOS.every((i) => i.nombre ));
});

test('nombres por defecto en inglés con frase; el nombre antiguo no editado se muestra con el nuevo y el renombrado se respeta', () => {
  const sin = estadosAnimo([]);
  assert.deepEqual(sin.slice(0, 6).map((e) => e.nombre), ['Zen', 'Power', 'Blue', 'Party', 'Sunny', 'Dream']);
  assert.ok(sin.every((e) => e.frase));
  const ejes = [
    { id: 'tranquilo', nombre: 'Tranquilo', familia: 'estado', chipId: 'tranquilo' },
    { id: 'feliz', nombre: 'Contento', familia: 'estado', chipId: 'feliz' },
  ];
  const todos = estadosAnimo(ejes);
  assert.equal(todos.find((e) => e.id === 'tranquilo').nombre, 'Zen');
  assert.equal(todos.find((e) => e.id === 'feliz').nombre, 'Contento');
});
