import test from 'node:test';
import assert from 'node:assert/strict';
import { comandoCaducado, planAdopcion, indiceDePista, crearCoalescedor, pendientesParaNativo, destinoMetadata } from './sincronizar-nativo.js';

const esLocal = (id) => id.startsWith('local:');

test('pendientesParaNativo: pasa los datos y rellena los que faltan', () => {
  assert.deepEqual(pendientesParaNativo([{ videoId: 'a', titulo: 'T', artista: 'R', portadaUrl: 'u', trackId: 1 }, { videoId: 'b' }], esLocal), [
    { id: 'a', titulo: 'T', artista: 'R', portadaUrl: 'u' },
    { id: 'b', titulo: '', artista: '', portadaUrl: null },
  ]);
});

test('pendientesParaNativo: se corta en la primera local para no saltarse canciones', () => {
  const lista = [{ videoId: 'a' }, { videoId: 'local:1' }, { videoId: 'b' }];
  assert.deepEqual(pendientesParaNativo(lista, esLocal).map((p) => p.id), ['a']);
  assert.deepEqual(pendientesParaNativo([{ videoId: 'local:1' }, { videoId: 'b' }], esLocal), []);
});

test('comandoCaducado: solo ⏭/⏮ con retraso grande', () => {
  assert.equal(comandoCaducado('anterior', 1000, 20000), true);
  assert.equal(comandoCaducado('siguiente', 1000, 3000), false);
  assert.equal(comandoCaducado('favorito', 1000, 99999), false);
  assert.equal(comandoCaducado('aleatorio', 1000, 99999), false);
  assert.equal(comandoCaducado('anterior', undefined, 99999), false); // sin ts: compatible con versiones viejas
});

test('planAdopcion: nativo vacío o JS cargando no adopta', () => {
  assert.equal(planAdopcion({ nativo: {}, videoActual: 'a', cargando: 0 }), null);
  assert.equal(planAdopcion({ nativo: null, videoActual: 'a', cargando: 0 }), null);
  assert.equal(planAdopcion({ nativo: { id: 'b' }, videoActual: 'a', cargando: 3 }), null);
});

test('planAdopcion: misma pista no es cambio; otra sí', () => {
  const n = { id: 'b', posicionMs: 4200, duracionMs: 180000, estado: 'reproduciendo' };
  assert.deepEqual(planAdopcion({ nativo: n, videoActual: 'b', cargando: 0 }), {
    id: 'b', cambioPista: false, posicionMs: 4200, duracionMs: 180000, estado: 'reproduciendo',
    respaldo: false, senalDebil: null,
  });
  assert.equal(planAdopcion({ nativo: n, videoActual: 'a', cargando: 0 }).cambioPista, true);
  assert.equal(planAdopcion({ nativo: n, videoActual: null, cargando: 0 }).cambioPista, true); // WebView recién abierto
});

test('indiceDePista: busca en círculo desde el actual y reconoce ids locales', () => {
  const cola = [{ id: 't1', v: 'a' }, { id: 't2', v: 'b' }, { id: 't3', v: 'a' }];
  const idsDe = (t) => [t.v, `local:${t.id}`];
  assert.equal(indiceDePista(cola, 'a', 1, idsDe), 2); // duplicado: el más cercano hacia delante
  assert.equal(indiceDePista(cola, 'a', 0, idsDe), 0);
  assert.equal(indiceDePista(cola, 'a', 2, idsDe), 2);
  assert.equal(indiceDePista(cola, 'local:t2', 0, idsDe), 1);
  assert.equal(indiceDePista(cola, 'zzz', 0, idsDe), -1);
  assert.equal(indiceDePista([], 'a', 0, idsDe), -1);
});

test('planAdopcion: pasa respaldo y senalDebil del nativo', () => {
  const sd = { activo: true, esperando: false, idInterrumpida: 'x' };
  const p = planAdopcion({ nativo: { id: 'g', respaldo: true, senalDebil: sd }, videoActual: 'a', cargando: 0 });
  assert.equal(p.respaldo, true);
  assert.deepEqual(p.senalDebil, sd);
});

test('coalescedor_aplica_solo_la_ultima', () => {
  const pendientes = new Map();
  let n = 0;
  const programar = (fn) => { pendientes.set(++n, fn); return n; };
  const cancelar = (id) => pendientes.delete(id);
  const vistos = [];
  const c = crearCoalescedor((v) => vistos.push(v), 300, { programar, cancelar });
  c('a'); c('b'); c('c');
  assert.equal(pendientes.size, 1);
  const disparar = () => { const fns = [...pendientes.values()]; pendientes.clear(); fns.forEach((fn) => fn()); };
  disparar();
  assert.deepEqual(vistos, ['c']);
  c('d');
  disparar();
  assert.deepEqual(vistos, ['c', 'd']);
});

// Regresión: sonaba «Runnin'» y el bloqueo decía «Without Me – Halsey» con la duración de «Runnin'»
// (3:43). App publicó la siguiente antes de que el nativo cambiara y la metadata se pegó a la vieja.
test('destinoMetadata: la metadata de otra canción no se aplica a la que tiene el nativo', () => {
  const nativoEnRunnin = { idNativo: 'vidRunnin', trackIdNativo: 't-runnin' };
  assert.equal(destinoMetadata({ trackIdMeta: 't-without-me', ...nativoEnRunnin }), null);
  assert.equal(destinoMetadata({ trackIdMeta: 't-runnin', ...nativoEnRunnin }), 'vidRunnin');
});

test('destinoMetadata: cuando JS marca la pista nueva, su metadata va con su id', () => {
  assert.equal(destinoMetadata({ trackIdMeta: 't-without-me', idNativo: 'vidWithoutMe', trackIdNativo: 't-without-me' }), 'vidWithoutMe');
  assert.equal(destinoMetadata({ trackIdMeta: 7, idNativo: 'v', trackIdNativo: '7' }), 'v'); // ids numéricos o texto
});

test('destinoMetadata: sin pista nativa o sin poder comprobarla, se espera', () => {
  assert.equal(destinoMetadata({ trackIdMeta: 't', idNativo: null, trackIdNativo: null }), null);
  assert.equal(destinoMetadata({ trackIdMeta: 't', idNativo: 'v', trackIdNativo: null }), null);
  assert.equal(destinoMetadata({ trackIdMeta: null, idNativo: 'v', trackIdNativo: 't' }), null);
  assert.equal(destinoMetadata({ trackIdMeta: null, idNativo: 'v', trackIdNativo: null }), 'v'); // sin datos: como antes
});
