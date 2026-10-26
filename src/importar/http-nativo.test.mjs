import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearHttp } from './http-nativo.js';

test('en Android usa la petición nativa como texto y devuelve la URL final', async () => {
  let opciones;
  const http = crearHttp({
    nativo: true,
    peticionNativa: async (o) => {
      opciones = o;
      return { status: 200, data: { a: 1 }, url: 'https://final/x' };
    },
  });
  const r = await http.get('https://corto/x', { headers: { 'User-Agent': 'UA' } });
  assert.deepEqual(r, { status: 200, texto: '{"a":1}', url: 'https://final/x' });
  assert.equal(opciones.responseType, 'text');
  assert.equal(opciones.method, 'GET');
  assert.deepEqual(opciones.headers, { 'User-Agent': 'UA' });
});

test('en el navegador usa fetch', async () => {
  const http = crearHttp({
    nativo: false,
    fetchFn: async (url) => ({ status: 201, url: `${url}?final`, text: async () => 'hola' }),
  });
  assert.deepEqual(await http.get('https://a'), { status: 201, texto: 'hola', url: 'https://a?final' });
});

test('si la petición no sale es sin-red', async () => {
  const http = crearHttp({ nativo: false, fetchFn: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(http.get('https://a'), (e) => e.codigo === 'sin-red');
});
