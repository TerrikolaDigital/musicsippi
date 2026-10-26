import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDeezer } from './deezer.js';
import { cargarConCache, claveSemana } from './cache.js';
import { artistasSemilla, calcularDescubrimiento, calcularNovedades, calcularParecidos, calcularTendencias, generosDeModos, haceTexto, albumesRecientes, sinLoQueTengo } from './calculos.js';
import { claveCancion, entrelazar, indiceBiblioteca, norm } from './claves.js';
import { deezerConIds, elegirResultado, resolverVideo } from './externas.js';

const DIA = 24 * 3600 * 1000;
const ahora = new Date(2026, 9, 19, 12).getTime(); // lunes 19 oct 2026
const fecha = (dias) => {
  const d = new Date(ahora - dias * DIA);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Respuestas con el mismo formato que la API real de Deezer (campos recortados).
const art = (id, name, fan = 100) => ({ id, name, picture_medium: `https://img/${id}.jpg`, nb_fan: fan });
const cancion = (id, title, artist, albumCover = 'https://c/x.jpg') => ({ id, title, artist: { id: 1, name: artist }, album: { cover_medium: albumCover } });
const alb = (id, title, release_date, record_type = 'album') => ({ id, title, release_date, record_type, cover_medium: `https://c/${id}.jpg` });

function falsoDeezer(rutas) {
  const llamadas = [];
  const get = async (url) => {
    llamadas.push(url);
    const ruta = url.replace('https://api.deezer.com', '');
    for (const [patron, resp] of Object.entries(rutas)) if (ruta.startsWith(patron)) return typeof resp === 'function' ? resp(ruta) : resp;
    return { data: [] };
  };
  return { dz: crearDeezer({ get, esperar: async () => {} }), llamadas };
}

test('claves: norm, claveCancion e índice de biblioteca', () => {
  assert.equal(norm('Canción (Remastered 2011) feat. X'), 'cancion');
  assert.equal(claveCancion('Ana, Beto', 'Hola (Live)'), 'ana|hola');
  const { canciones, artistas } = indiceBiblioteca([{ artista: 'Ana & Beto', titulo: 'Hola' }]);
  assert.ok(canciones.has('ana|hola'));
  assert.ok(artistas.has('ana') && artistas.has('beto'));
  assert.deepEqual(entrelazar([[{ k: 1 }, { k: 2 }], [{ k: 1 }, { k: 3 }]], (x) => x.k, 3).map((x) => x.k), [1, 2, 3]);
});

test('deezer: buscarArtista exige el nombre exacto y elige al de más fans', async () => {
  const { dz } = falsoDeezer({ '/search/artist': { data: [art(1, 'Dani', 5), art(2, 'Dani Martín', 900), art(3, 'dani', 50)] } });
  assert.equal((await dz.buscarArtista('Dani')).id, 3);
  assert.equal(await dz.buscarArtista('Nadie'), null);
});

test('deezer: tiempo límite, cuota con un reintento y error de API', async () => {
  const lento = crearDeezer({ get: () => new Promise(() => {}), limiteMs: 20 });
  await assert.rejects(lento.top(1), /tiempo agotado/);
  let n = 0;
  const cuota = crearDeezer({ get: async () => (n++ === 0 ? { error: { code: 4, message: 'Quota' } } : { data: [cancion(9, 'A', 'B')] }), esperar: async () => {} });
  assert.equal((await cuota.top(1)).length, 1);
  assert.equal(n, 2);
  const roto = crearDeezer({ get: async () => ({ error: { code: 800, message: 'no data' } }) });
  await assert.rejects(roto.top(1), /no data/);
});

test('deezer: nunca más de 3 peticiones a la vez', async () => {
  let vuelo = 0;
  let maximo = 0;
  const dz = crearDeezer({
    get: async () => {
      maximo = Math.max(maximo, ++vuelo);
      await new Promise((r) => setTimeout(r, 5));
      vuelo--;
      return { data: [] };
    },
  });
  await Promise.all(Array.from({ length: 10 }, (_, i) => dz.top(i)));
  assert.equal(maximo, 3);
});

test('cache: usa lo vigente, recarga lo caducado y tolera fallos de red con copia vieja', async () => {
  const mem = new Map();
  const almacen = { leer: async (k) => mem.get(k), guardar: async (k, v) => void mem.set(k, v) };
  let t = 1000;
  let cargas = 0;
  const op = { ttlMs: 100, almacen, ahora: () => t, cargar: async () => ({ n: ++cargas }) };
  assert.deepEqual(await cargarConCache('k', op), { datos: { n: 1 }, origen: 'red' });
  assert.deepEqual(await cargarConCache('k', op), { datos: { n: 1 }, origen: 'cache' });
  t += 101;
  assert.equal((await cargarConCache('k', op)).datos.n, 2);
  t += 101;
  const roto = { ...op, cargar: async () => { throw new Error('sin red'); } };
  assert.deepEqual(await cargarConCache('k', roto), { datos: { n: 2 }, origen: 'caducada' });
  await assert.rejects(cargarConCache('otra', roto), /sin red/);
  assert.equal((await cargarConCache('k', { ...op, valida: () => false })).origen, 'red');
});

test('cache: claveSemana devuelve el lunes', () => {
  assert.equal(claveSemana(new Date(2026, 9, 19, 0, 5).getTime()), '2026-10-19');
  assert.equal(claveSemana(new Date(2026, 9, 25, 23, 59).getTime()), '2026-10-19');
  assert.equal(claveSemana(new Date(2026, 9, 26, 0, 1).getTime()), '2026-10-26');
});

test('descubrimiento: canciones de artistas parecidos que no están en la biblioteca, sin repetir', async () => {
  const { dz } = falsoDeezer({
    '/search/artist?q=Ana': { data: [art(10, 'Ana')] },
    '/search/artist?q=Beto': { data: [art(20, 'Beto')] },
    '/artist/10/related': { data: [art(11, 'Cris'), art(12, 'Dora')] },
    '/artist/20/related': { data: [art(11, 'Cris'), art(21, 'Eva')] },
    '/artist/11/top': { data: [cancion(1, 'Uno', 'Cris'), cancion(2, 'Dos', 'Cris')] },
    '/artist/12/top': { data: [cancion(3, 'Tres', 'Dora')] },
    '/artist/21/top': { data: [cancion(4, 'Cuatro', 'Eva')] },
  });
  const tracks = [{ artista: 'Cris', titulo: 'Uno' }, { artista: 'Ana', titulo: 'Yo' }];
  const r = await calcularDescubrimiento({ semillas: ['Ana', 'Beto'], dz, tracks, max: 10 });
  assert.deepEqual(r.map((c) => c.titulo).sort(), ['Cuatro', 'Dos', 'Tres']);
  assert.ok(r.every((c) => c.cover && c.id.startsWith('deezer-')));
  // Si el usuario añade una, deja de aparecer.
  assert.equal(sinLoQueTengo(r, [...tracks, { artista: 'Eva', titulo: 'Cuatro' }], 20).length, 2);
});

test('descubrimiento: un artista que falla no tumba el resto, pero si fallan todos lanza', async () => {
  const get = async (url) => {
    if (url.includes('q=Mal')) throw new Error('403');
    if (url.includes('/search/artist')) return { data: [art(10, 'Ana')] };
    if (url.includes('/related')) return { data: [art(11, 'Cris')] };
    return { data: [cancion(1, 'Uno', 'Cris')] };
  };
  const dz = crearDeezer({ get });
  assert.equal((await calcularDescubrimiento({ semillas: ['Mal', 'Ana'], dz, tracks: [] })).length, 1);
  await assert.rejects(calcularDescubrimiento({ semillas: ['Mal'], dz, tracks: [] }), /403/);
});

test('novedades: solo los últimos 60 días, del más nuevo al más viejo, sin futuros ni repetidos', async () => {
  const albumes = [alb(1, 'Viejo', fecha(90)), alb(2, 'Reciente', fecha(3), 'single'), alb(3, 'Hace un mes', fecha(30)), alb(4, 'Futuro', fecha(-20)), alb(5, 'Reciente', fecha(3), 'album')];
  const lista = albumesRecientes(albumes.map((a) => ({ id: `d${a.id}`, titulo: a.title, artista: 'Ana', fecha: a.release_date })), ahora);
  assert.deepEqual(lista.map((a) => a.titulo), ['Reciente', 'Hace un mes']);

  const { dz } = falsoDeezer({
    '/search/artist?q=Ana': { data: [art(10, 'Ana')] },
    '/search/artist?q=Beto': { data: [art(20, 'Beto')] },
    '/artist/10/albums': { data: albumes },
    '/artist/20/albums': { data: [alb(9, 'Nuevo de Beto', fecha(1))] },
  });
  const r = await calcularNovedades({ artistas: ['Ana', 'Beto'], dz, ahora });
  assert.deepEqual(r.map((a) => a.titulo), ['Nuevo de Beto', 'Reciente', 'Hace un mes']);
  assert.equal(r[0].artista, 'Beto');
});

test('haceTexto', () => {
  assert.equal(haceTexto(ahora - 3600_000, ahora), 'Hoy');
  assert.equal(haceTexto(ahora - DIA, ahora), 'Ayer');
  assert.equal(haceTexto(ahora - 3 * DIA, ahora), 'Hace 3 días');
  assert.equal(haceTexto(ahora - 21 * DIA, ahora), 'Hace 3 semanas');
  assert.equal(haceTexto(ahora - 65 * DIA, ahora), 'Hace 2 meses');
});

test('tendencias: géneros según los modos y mezcla de los charts sin lo que ya tienes', async () => {
  const conteos = new Map([['a', 50], ['b', 30], ['c', 10], ['d', 5], ['e', 99]]);
  const ejes = [
    { id: 'a', nombre: 'Rock clásico', tipo: 'gusto' },
    { id: 'b', nombre: 'Reggaetón', tipo: 'gusto' },
    { id: 'c', nombre: 'Para estudiar', tipo: 'funcional' },
    { id: 'd', nombre: 'Rap/Trap', tipo: 'gusto' },
    { id: 'e', nombre: 'Pop', tipo: 'gusto', sistema: true },
  ];
  assert.deepEqual(generosDeModos(ejes, conteos), ['152', '122', '116']);
  assert.deepEqual(generosDeModos([{ id: 'x', nombre: 'Mi mezcla', tipo: 'gusto' }], new Map([['x', 3]])), ['0']);

  const { dz } = falsoDeezer({
    '/chart/152/tracks': { data: [cancion(1, 'R1', 'X'), cancion(2, 'R2', 'Y')] },
    '/chart/122/tracks': { data: [cancion(3, 'P1', 'Z'), cancion(1, 'R1', 'X')] },
  });
  const r = await calcularTendencias({ generos: ['152', '122'], dz });
  assert.deepEqual(r.map((c) => c.titulo), ['R1', 'P1', 'R2']);
  assert.deepEqual(sinLoQueTengo(r, [{ artista: 'Z', titulo: 'P1' }], 10).map((c) => c.titulo), ['R1', 'R2']);
});

test('parecidos: artistas fuera de la biblioteca, primero los que salen en más listas', async () => {
  const { dz } = falsoDeezer({
    '/search/artist?q=Ana': { data: [art(10, 'Ana')] },
    '/search/artist?q=Beto': { data: [art(20, 'Beto')] },
    '/artist/10/related': { data: [art(11, 'Cris', 5), art(12, 'Dora', 9), art(30, 'Beto')] },
    '/artist/20/related': { data: [art(12, 'Dora', 9), art(13, 'Eva', 1)] },
  });
  const r = await calcularParecidos({ semillas: ['Ana', 'Beto'], dz, tracks: [{ artista: 'Ana', titulo: 'x' }, { artista: 'Beto', titulo: 'y' }] });
  assert.deepEqual(r.map((a) => a.nombre), ['Dora', 'Cris', 'Eva']);
  assert.equal(r[0].foto, 'https://img/12.jpg');
});

test('artistasSemilla: quita colaboraciones y repetidos', () => {
  assert.deepEqual(artistasSemilla([[{ nombre: 'Ana, Beto' }, { nombre: 'ana' }], [{ nombre: 'Cris' }]], 5), ['Ana', 'Cris']);
  assert.deepEqual(artistasSemilla([[{ nombre: 'A' }, { nombre: 'B' }]], 1), ['A']);
});

test('externas: elige el resultado cuyo título coincide y resuelve el vídeo', async () => {
  const resultados = [{ videoId: 'v1', tituloSugerido: 'Otra cosa' }, { videoId: 'v2', tituloSugerido: 'Uno (Official Video)' }];
  assert.equal(elegirResultado(resultados, { titulo: 'Uno' }).videoId, 'v2');
  assert.equal(elegirResultado(resultados, { titulo: 'Zzz' }).videoId, 'v1');
  assert.equal(elegirResultado([], { titulo: 'Uno' }), null);
  assert.equal(await resolverVideo(async (q) => ({ resultados: q === 'Ana Uno' ? resultados : [] }), { artista: 'Ana', titulo: 'Uno' }), 'v2');
  await assert.rejects(resolverVideo(async () => ({ resultados: [] }), { artista: 'A', titulo: 'B' }), /sin resultados/);
});

test('externas: el id de un artista se cachea y un artista desconocido no vuelve a consultarse', async () => {
  const mem = new Map();
  const almacen = { leer: async (k) => mem.get(k), guardar: async (k, v) => void mem.set(k, v) };
  let n = 0;
  const base = { buscarArtista: async (nombre) => (n++, nombre === 'Ana' ? { id: 10, nombre: 'Ana' } : null) };
  const dz = deezerConIds(base, almacen, () => 1);
  assert.equal((await dz.buscarArtista('Ana')).id, 10);
  assert.equal((await dz.buscarArtista('Ana')).id, 10);
  assert.equal(await dz.buscarArtista('Nadie'), null);
  assert.equal(await dz.buscarArtista('Nadie'), null);
  assert.equal(n, 2);
});
