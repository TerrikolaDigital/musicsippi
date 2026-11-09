import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRevisorVersiones, entradasCacheDelPc, REVISION_VERSIONES } from './revisar-versiones.js';

const ref = { titulo: 'Madrugal', artista: 'Café Tacvba', duracionS: null };
const cacheado = { trackId: 't1', videoId: 'cover' };
const original = { videoId: 'orig', titulo: 'Madrugal', artistas: ['Café Tacvba'], duracion: 70, tipo: 'cancion' };
const cover = { videoId: 'cover', titulo: 'Madrugal', artistas: ['Blodtørst'], duracion: 70, tipo: 'cancion' };

function preparar(extra = {}) {
  const guardados = [];
  return { guardados, base: { cacheado, ref, intocable: false, buscar: async () => [cover, original], guardar: async (r) => guardados.push(r), ...extra } };
}

test('cambia el cover guardado por el original y lo deja marcado como revisado', async () => {
  const { guardados, base } = preparar();
  assert.equal(await crearRevisorVersiones().revisar(base), 'orig');
  assert.deepEqual(guardados, [{ trackId: 't1', videoId: 'orig', revision: REVISION_VERSIONES }]);
});

test('sin versión fiel conserva el vídeo y no lo revisa otra vez', async () => {
  const { guardados, base } = preparar({ buscar: async () => [cover] });
  assert.equal(await crearRevisorVersiones().revisar(base), 'cover');
  assert.deepEqual(guardados, [{ trackId: 't1', videoId: 'cover', revision: REVISION_VERSIONES }]);
});

test('no busca nada para lo elegido a mano, lo ya revisado, las copias sin conexión o sin referencia', async () => {
  const buscar = async () => assert.fail('no debía buscar');
  const casos = [
    { cacheado: { ...cacheado, origen: 'usuario' } },
    { cacheado: { ...cacheado, revision: REVISION_VERSIONES } },
    { ref: { ...ref, manual: true } },
    { intocable: true },
    { ref: null },
  ];
  for (const caso of casos) {
    const { guardados, base } = preparar({ buscar, ...caso });
    assert.equal(await crearRevisorVersiones().revisar(base), 'cover');
    assert.deepEqual(guardados, []);
  }
});

test('un fallo de red no marca nada y deja de buscar un rato para no frenar la cola', async () => {
  let reloj = 0;
  let busquedas = 0;
  const revisor = crearRevisorVersiones({ ahora: () => reloj, pausaMs: 1000 });
  const { guardados, base } = preparar({
    buscar: async () => {
      busquedas += 1;
      throw new Error('error_red');
    },
  });
  assert.equal(await revisor.revisar(base), 'cover');
  assert.equal(await revisor.revisar(base), 'cover');
  assert.equal(busquedas, 1);
  reloj = 1001;
  await revisor.revisar(base);
  assert.equal(busquedas, 2);
  assert.deepEqual(guardados, []);
});

test('si la búsqueda tarda, suena lo guardado y el resultado queda para la próxima', async () => {
  let soltar;
  const espera = new Promise((r) => {
    soltar = r;
  });
  const { guardados, base } = preparar({ buscar: () => espera.then(() => [cover, original]) });
  assert.equal(await crearRevisorVersiones({ topeMs: 5 }).revisar(base), 'cover');
  soltar();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(guardados[0].videoId, 'orig');
});

test('la sincronización del PC no pisa lo revisado ni lo elegido a mano, pero trae lo nuevo', () => {
  const propios = [
    { trackId: 'rev', videoId: 'bueno', revision: REVISION_VERSIONES },
    { trackId: 'usu', videoId: 'mio', origen: 'usuario' },
    { trackId: 'sin', videoId: 'viejo' },
  ];
  const pc = { version: 1, rev: 'cover', usu: 'otro', sin: 'nuevo', falta: { videoId: 'x' } };
  assert.deepEqual(entradasCacheDelPc(pc, propios), [
    { trackId: 'sin', videoId: 'nuevo' },
    { trackId: 'falta', videoId: 'x' },
  ]);
});

test('lo revisado en la versión 1 sigue fijado frente al PC, pero se vuelve a revisar con la versión actual', async () => {
  assert.ok(REVISION_VERSIONES >= 2);
  assert.deepEqual(entradasCacheDelPc({ v1: 'cover' }, [{ trackId: 'v1', videoId: 'bueno', revision: 1 }]), []);
  const guardados = [];
  const r = await crearRevisorVersiones({ topeMs: 50 }).revisar({
    cacheado: { trackId: 'v1', videoId: 'bueno', revision: 1 },
    ref: { artista: 'A', titulo: 'T' },
    buscar: async () => [],
    guardar: async (x) => guardados.push(x),
  });
  assert.equal(r, 'bueno');
  assert.equal(guardados.length, 1);
});
