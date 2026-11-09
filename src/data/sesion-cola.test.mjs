import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosSesion, colaRestaurada, ejeSinIdRestaurado } from './sesion-cola.js';

const biblio = new Map([
  ['a', { id: 'a', titulo: 'A' }],
  ['b', { id: 'b', titulo: 'B' }],
]);
const enBiblioteca = (id) => biblio.has(id);
const prov = { id: 'album-123', titulo: 'De fuera', videoId: 'xyz' };

test('guarda enteras solo las canciones de fuera de la biblioteca', () => {
  const d = datosSesion(
    { cola: [biblio.get('a'), prov, biblio.get('b')], trackActual: prov, ejeActivo: null, ejeVista: null, tiempo: 12, aleatorio: true, repetir: false },
    enBiblioteca
  );
  assert.deepEqual(d.colaIds, ['a', 'album-123', 'b']);
  assert.deepEqual(Object.keys(d.provisionales), ['album-123']);
  assert.equal(d.trackActualId, 'album-123');
});

test('al restaurar no se pierde la provisional y conserva el orden', () => {
  const d = datosSesion(
    { cola: [biblio.get('a'), prov, biblio.get('b')], trackActual: prov, ejeActivo: null, ejeVista: null, tiempo: 0, aleatorio: false, repetir: false },
    enBiblioteca
  );
  const cola = colaRestaurada(JSON.parse(JSON.stringify(d)), biblio);
  assert.deepEqual(cola.map((t) => t.id), ['a', 'album-123', 'b']);
  assert.equal(cola.findIndex((t) => t.id === d.trackActualId), 1);
});

test('la versión de la biblioteca gana sobre una copia guardada', () => {
  const s = { colaIds: ['a'], provisionales: { a: { id: 'a', titulo: 'vieja' } } };
  assert.equal(colaRestaurada(s, biblio)[0].titulo, 'A');
});

test('sesiones viejas sin provisionales siguen funcionando', () => {
  assert.deepEqual(colaRestaurada({ colaIds: ['a', 'zz'] }, biblio).map((t) => t.id), ['a']);
});

test('el eje de un artista conserva origenArtista; un modo con id no se duplica', () => {
  const eje = { nombre: 'Kylie Minogue', origenArtista: 'Kylie Minogue' };
  const d = datosSesion({ cola: [], trackActual: null, ejeActivo: eje, ejeVista: null, tiempo: 0, aleatorio: true, repetir: false }, enBiblioteca);
  assert.deepEqual(ejeSinIdRestaurado(d), eje);
  const conId = datosSesion({ cola: [], trackActual: null, ejeActivo: { id: 'm1', nombre: 'Calma' }, ejeVista: null, tiempo: 0, aleatorio: true, repetir: false }, enBiblioteca);
  assert.equal(conId.ejeActivoExtra, null);
  assert.deepEqual(ejeSinIdRestaurado({ ejeActivoNombre: 'Búsqueda' }), { nombre: 'Búsqueda' });
});
