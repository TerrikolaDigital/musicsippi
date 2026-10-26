import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparEnBloques, traducirBloque, traducirLineas, obtenerTraduccion } from './traduccion-letra.js';

// Respuesta de translate_a/single: [[ [traducido, original, ...], ... ], null, idiomaDetectado]
// Como el servicio real: cada segmento (salvo el último) acaba en salto de línea.
const conSaltos = (pares) => pares.map(([t, o], i) => (i < pares.length - 1 ? [t + '\n', o + '\n'] : [t, o]));
const google = (pares, idioma = 'en') => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify([pares.map(([t, o]) => [t, o, null, null, 3]), null, idioma]),
});

test('agruparEnBloques: respeta el máximo y no parte un texto', () => {
  assert.deepEqual(agruparEnBloques(['aaaa', 'bbbb', 'cc'], 10), [['aaaa', 'bbbb'], ['cc']]);
  assert.deepEqual(agruparEnBloques(['x'.repeat(30)], 10), [['x'.repeat(30)]]);
  assert.deepEqual(agruparEnBloques([]), []);
});

test('traducirBloque: alinea por líneas (los segmentos traen salto al final) y devuelve el idioma detectado', async () => {
  let url;
  const r = await traducirBloque(['Hello', 'Good night'], {
    fetchFn: async (u) => ((url = u), google([['Hola\n', 'Hello\n'], ['Buenas noches', 'Good night']])),
  });
  assert.deepEqual(r, { idioma: 'en', lineas: ['Hola', 'Buenas noches'] });
  assert.match(url, /^https:\/\/translate\.googleapis\.com\/translate_a\/single\?/);
  assert.match(url, /client=gtx/);
  assert.match(url, /sl=auto/);
  assert.match(url, /tl=es/);
  assert.match(url, /q=Hello%0AGood\+night/);
});

test('traducirBloque: devuelve null si el nº de líneas no cuadra, hay error HTTP o falla la red', async () => {
  assert.equal(await traducirBloque(['a', 'b'], { fetchFn: async () => google([['uno', 'a']]) }), null);
  assert.equal(await traducirBloque(['a'], { fetchFn: async () => ({ ok: false, status: 429, text: async () => '' }) }), null);
  assert.equal(await traducirBloque(['a'], { fetchFn: async () => { throw new Error('red'); } }), null);
  assert.equal(await traducirBloque(['a'], { fetchFn: () => new Promise(() => {}), limiteMs: 20 }), null);
});

test('traducirBloque: manda un user-agent de navegador (Google da 429 al «Dalvik» del HTTP nativo de Android)', async () => {
  let init;
  await traducirBloque(['Hello'], { fetchFn: async (u, i) => ((init = i), google([['Hola', 'Hello']])) });
  assert.match(init.headers['User-Agent'], /^Mozilla\/5\.0 .*Chrome\//);
});

test('traducirLineas: salta líneas vacías y ♪, una petición por bloque y deja vacío lo que no cambia', async () => {
  const peticiones = [];
  const fetchFn = async (u) => {
    const q = new URL(u).searchParams.get('q').split('\n');
    peticiones.push(q);
    return google(conSaltos(q.map((l) => [l === 'Oh oh' ? 'Oh oh' : `ES:${l}`, l])));
  };
  const r = await traducirLineas(['Hello', '', '♪', 'Oh oh', 'Bye'], { fetchFn });
  assert.deepEqual(r, { lineas: ['ES:Hello', '', '', '', 'ES:Bye'] });
  assert.equal(peticiones.length, 1);
  assert.deepEqual(peticiones[0], ['Hello', 'Oh oh', 'Bye']);
});

test('traducirLineas: si Google detecta español devuelve {lineas: null}; si todo falla, null', async () => {
  assert.deepEqual(await traducirLineas(['Hola amor'], { fetchFn: async () => google([['Hola amor', 'Hola amor']], 'es') }), { lineas: null });
  assert.equal(await traducirLineas(['Hello'], { fetchFn: async () => { throw new Error('x'); } }), null);
  assert.deepEqual(await traducirLineas(['', '♪']), { lineas: null });
});

test('traducirLineas: divide las letras largas en varios bloques', async () => {
  const textos = Array.from({ length: 100 }, (_, i) => `Line number ${i} of the song`);
  let n = 0;
  const fetchFn = async (u) => {
    n++;
    const q = new URL(u).searchParams.get('q').split('\n');
    return google(conSaltos(q.map((l) => [`ES:${l}`, l])));
  };
  const r = await traducirLineas(textos, { fetchFn });
  assert.ok(n > 1);
  assert.equal(r.lineas.length, 100);
  assert.equal(r.lineas[99], 'ES:Line number 99 of the song');
});

function almacenFalso() {
  const m = new Map();
  return { m, leer: async (k) => m.get(k), guardar: async (k, v) => void m.set(k, v) };
}

test('obtenerTraduccion: se guarda por canción, se reutiliza y los fallos no se cachean', async () => {
  const almacen = almacenFalso();
  let llamadas = 0;
  const traducirFn = async (t) => (llamadas++, { lineas: t.map((x) => `ES:${x}`) });
  const a = await obtenerTraduccion('tr uno|x', ['a', 'b'], { almacen, ahora: () => 1, traducirFn });
  assert.deepEqual(a, ['ES:a', 'ES:b']);
  assert.equal(almacen.m.get('traduccion:tr uno|x').hasta, 1 + 30 * 24 * 3600 * 1000);
  // sesión nueva: solo la caché persistente
  almacen.m.set('traduccion:tr dos|x', almacen.m.get('traduccion:tr uno|x'));
  assert.deepEqual(await obtenerTraduccion('tr dos|x', ['a', 'b'], { almacen, ahora: () => 2, traducirFn }), ['ES:a', 'ES:b']);
  assert.equal(llamadas, 1);
  // fallo: false (la pantalla avisa) y sin guardar; la siguiente vez se reintenta
  assert.equal(await obtenerTraduccion('tr tres|x', ['a'], { almacen, traducirFn: async () => null }), false);
  assert.equal(almacen.m.has('traduccion:tr tres|x'), false);
  assert.deepEqual(await obtenerTraduccion('tr tres|x', ['a'], { almacen, traducirFn }), ['ES:a']);
  // en español: se cachea el «null»
  assert.equal(await obtenerTraduccion('tr es|x', ['hola'], { almacen, traducirFn: async () => ({ lineas: null }) }), null);
  assert.equal(almacen.m.get('traduccion:tr es|x').lineas, null);
});

import { traducirBloqueRespaldo } from './traduccion-letra.js';

const memo = (traducido, extra = {}) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ responseData: { translatedText: traducido, detectedLanguage: 'en' }, responseStatus: 200, quotaFinished: false, ...extra }),
});

test('traducirBloqueRespaldo: MyMemory con autodetección, alinea por líneas', async () => {
  let url;
  const r = await traducirBloqueRespaldo(['Hello', 'Good night'], { fetchFn: async (u) => ((url = u), memo('Hola\nBuenas noches')) });
  assert.deepEqual(r, { idioma: 'en', lineas: ['Hola', 'Buenas noches'] });
  assert.match(url, /^https:\/\/api\.mymemory\.translated\.net\/get\?/);
  assert.match(url, /langpair=autodetect%7Ces/);
});

test('traducirBloqueRespaldo: parte en trozos de <=450 caracteres y falla limpio (cuota, líneas, red)', async () => {
  const lineas = Array.from({ length: 40 }, (_, i) => `Line number ${i} of the song here`);
  let n = 0;
  const r = await traducirBloqueRespaldo(lineas, { fetchFn: async (u) => ((n++), memo(new URL(u).searchParams.get('q').split('\n').map((l) => `ES ${l}`).join('\n'))) });
  assert.ok(n > 1);
  assert.equal(r.lineas.length, 40);
  assert.equal(await traducirBloqueRespaldo(['a'], { fetchFn: async () => memo('x', { quotaFinished: true }) }), null);
  assert.equal(await traducirBloqueRespaldo(['a', 'b'], { fetchFn: async () => memo('solo una') }), null);
  assert.equal(await traducirBloqueRespaldo(['a'], { fetchFn: async () => { throw new Error('red'); } }), null);
  assert.equal(await traducirBloqueRespaldo(['x'.repeat(600)], { fetchFn: async () => memo('x') }), null);
});

test('traducirLineas: si Google da 429 usa MyMemory', async () => {
  const fetchFn = async (u) => (u.includes('googleapis') ? { ok: false, status: 429, text: async () => '' } : memo('Hola\nAdiós'));
  assert.deepEqual(await traducirLineas(['Hello', 'Bye'], { fetchFn }), { lineas: ['Hola', 'Adiós'] });
});
