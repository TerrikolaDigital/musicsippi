import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { coincide, ampliarMiniatura, pendientesImagen, completarImagenes, reiniciarEstadoImagenes, sePuedeComparar, esNombreBasura, completarFotosArtistas, artistasSinFotoMetadata } from './completar-imagenes.js';
import { combinarMetadataLocal } from '../data/combinar-metadata.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';

beforeEach(() => reiniciarEstadoImagenes());

const DIA = 86400000;
const AHORA = Date.UTC(2026, 10, 4);
const track = (id, artista, titulo) => ({ id, artista, titulo, fuentes: ['movil'] });
const ok = (obj) => ({ status: 200, texto: JSON.stringify(obj), url: '' });

function httpFalso({ deezer = () => ({ data: [] }), itunes = () => ({ results: [] }) } = {}) {
  const llamadas = [];
  return {
    llamadas,
    async get(url) {
      llamadas.push(url);
      if (url.startsWith('https://api.deezer.com/')) return ok(deezer(decodeURIComponent(url)));
      if (url.startsWith('https://itunes.apple.com/')) return ok(itunes(decodeURIComponent(url)));
      return { status: 404, texto: '{}', url };
    },
  };
}
const deezerCon = (artista, titulo, cover) => ({ data: [{ title: titulo, artist: { name: artista }, album: { cover_big: cover } }] });
const itunesCon = (artista, titulo, art) => ({ results: [{ artistName: artista, trackName: titulo, artworkUrl100: art }] });
const sinEsperar = async () => {};
const sinMetadata = async () => ({ tracks: {} });
const preparar = (tracks, extra = {}) => crearAlmacenMemoria({ biblioteca: tracks, ...extra });

test('cover de otro artista no coincide', () => {
  assert.equal(coincide('Soda Stereo', 'De música ligera', 'Los Cantantes', 'De música ligera'), false);
  assert.equal(coincide('Soda Stereo', 'De música ligera', 'Soda Stereo', 'De Música Ligera (Remasterizado)'), true);
});

test('título con sufijo Instrumental coincide', () => {
  assert.equal(coincide('Artista', 'Canción', 'Artista', 'Canción (Instrumental)'), true);
  assert.equal(coincide('Artista', 'Canción - Instrumental', 'Artista', 'Canción'), true);
  assert.equal(coincide('Artista', 'Canción', 'Artista', 'Otra cosa'), false);
});

test('ampliarMiniatura cambia el tamaño y respeta lo desconocido', () => {
  assert.equal(ampliarMiniatura('https://yt3.googleusercontent.com/abc=w120-h120-l90-rj'), 'https://yt3.googleusercontent.com/abc=w544-h544');
  assert.equal(ampliarMiniatura('https://i.ytimg.com/vi/x/hq.jpg'), 'https://i.ytimg.com/vi/x/hq.jpg');
});

test('pendientesImagen: sin portada y sin registro, o noEncontrada de hace 30 días o más', () => {
  const tracks = [track('a', 'A', 'a'), track('b', 'B', 'b'), track('c', 'C', 'c'), track('d', 'D', 'd'), track('e', 'E', 'e')];
  const metadata = { tracks: { a: { coverUrl: 'x' } } };
  const registros = [
    { trackId: 'b', imagen: { fecha: AHORA - 10 * DIA, noEncontrada: true } },
    { trackId: 'c', imagen: { fecha: AHORA - 30 * DIA, noEncontrada: true } },
    { trackId: 'd' },
  ];
  assert.deepEqual(pendientesImagen(tracks, metadata, registros, AHORA).map((t) => t.id), ['c', 'd', 'e']);
});

test('orden Deezer, iTunes, YouTube y se para en la primera', async () => {
  const almacen = preparar([track('1', 'Artista', 'Uno'), track('2', 'Artista', 'Dos'), track('3', 'Artista', 'Tres')]);
  const http = httpFalso({
    deezer: (u) => (u.includes('Uno') ? deezerCon('Artista', 'Uno', 'https://dz/uno.jpg') : { data: [] }),
    itunes: (u) => (u.includes('Dos') ? itunesCon('Artista', 'Dos', 'https://it/dos/100x100bb.jpg') : { results: [] }),
  });
  const consultasYT = [];
  const buscarCanciones = async (q) => {
    consultasYT.push(q);
    return q.includes('Tres') ? [{ titulo: 'Tres', artistas: ['Artista'], thumbnail: 'https://yt3.googleusercontent.com/z=w120-h120-l90' }] : [];
  };
  const r = await completarImagenes({ almacen, http, buscarCanciones, obtenerMetadata: sinMetadata, esperar: sinEsperar, ahora: () => AHORA });
  assert.deepEqual(r, { encontradas: 3, procesadas: 3 });
  assert.equal(http.llamadas.filter((u) => u.includes('itunes') && u.includes('Uno')).length, 0);
  assert.deepEqual(consultasYT, ['Artista Tres']);
  const meta = Object.fromEntries((await almacen.obtenerTodos('metadataLocal')).map((m) => [m.trackId, m.coverUrl]));
  assert.deepEqual(meta, { 1: 'https://dz/uno.jpg', 2: 'https://it/dos/600x600bb.jpg', 3: 'https://yt3.googleusercontent.com/z=w544-h544' });
});

test('fallo de red no marca noEncontrada; sin coincidencia en las 3 sí', async () => {
  const almacen = preparar([track('1', 'A', 'Uno'), track('2', 'B', 'Dos')]);
  const buscarCanciones = async (q) => {
    if (q.includes('Uno')) throw new Error('sin red');
    return [];
  };
  const r = await completarImagenes({ almacen, http: httpFalso(), buscarCanciones, obtenerMetadata: sinMetadata, esperar: sinEsperar, ahora: () => AHORA });
  assert.deepEqual(r, { encontradas: 0, procesadas: 2 });
  assert.equal(await almacen.obtenerPorClave('generos', '1'), undefined);
  assert.deepEqual((await almacen.obtenerPorClave('generos', '2')).imagen, { fecha: AHORA, noEncontrada: true });
});

test('una canción con fallo de red no para la pasada', async () => {
  const almacen = preparar([track('1', 'A', 'Uno'), track('2', 'B', 'Dos')]);
  const http = httpFalso({ deezer: (u) => (u.includes('Dos') ? deezerCon('B', 'Dos', 'https://dz/dos.jpg') : { data: [] }) });
  const original = http.get;
  http.get = async (url) => {
    if (decodeURIComponent(url).includes('Uno')) throw new Error('sin red');
    return original(url);
  };
  const buscarCanciones = async () => {
    throw new Error('sin red');
  };
  const r = await completarImagenes({ almacen, http, buscarCanciones, obtenerMetadata: sinMetadata, esperar: sinEsperar, ahora: () => AHORA });
  assert.deepEqual(r, { encontradas: 1, procesadas: 2 });
  assert.equal(await almacen.obtenerPorClave('generos', '1'), undefined);
});

test('no encontrada se reintenta a los 30 días y no antes', async () => {
  const registros = [{ trackId: '1', imagen: { fecha: AHORA - 29 * DIA, noEncontrada: true } }];
  const almacen = preparar([track('1', 'A', 'Uno')], { generos: registros });
  const args = { almacen, http: httpFalso(), buscarCanciones: async () => [], obtenerMetadata: sinMetadata, esperar: sinEsperar };
  assert.equal((await completarImagenes({ ...args, ahora: () => AHORA })).procesadas, 0);
  assert.equal((await completarImagenes({ ...args, ahora: () => AHORA + DIA })).procesadas, 1);
});

test('espera 4 s entre peticiones a iTunes', async () => {
  const almacen = preparar([track('1', 'A', 'Uno'), track('2', 'B', 'Dos'), track('3', 'C', 'Tres')]);
  const esperas = [];
  await completarImagenes({
    almacen,
    http: httpFalso(),
    buscarCanciones: async () => [],
    obtenerMetadata: sinMetadata,
    esperar: async (ms) => {
      esperas.push(ms);
    },
    ahora: () => AHORA,
  });
  assert.deepEqual(esperas, [4000, 4000]);
});

test('máximo 60 canciones por pasada', async () => {
  const tracks = Array.from({ length: 70 }, (_, i) => track(`t${i}`, 'A', `Canción ${i}`));
  const almacen = preparar(tracks);
  const r = await completarImagenes({ almacen, http: httpFalso(), buscarCanciones: async () => [], obtenerMetadata: sinMetadata, esperar: sinEsperar, ahora: () => AHORA });
  assert.equal(r.procesadas, 60);
});

test('obtenerMetadata conserva album de la semilla al añadir solo portada', () => {
  const semilla = { tracks: { x: { album: 'Álbum', anio: 1999, duracionMs: 1000, artistaMbid: 'mb', coverUrl: null, fotoArtista: null } } };
  const r = combinarMetadataLocal(semilla, [{ trackId: 'x', coverUrl: 'https://c' }, { trackId: 'y', album: 'Solo local' }]);
  assert.deepEqual(r.x, { album: 'Álbum', anio: 1999, duracionMs: 1000, artistaMbid: 'mb', coverUrl: 'https://c', fotoArtista: null });
  assert.equal(r.y.album, 'Solo local');
  assert.equal(r.y.artistaMbid, null);
  assert.equal(semilla.tracks.x.coverUrl, null);
});

const FOTO_SODA = 'https://e-cdns-images.dzcdn.net/images/artist/abc123/500x500-000000-80-0-0.jpg';
const FOTO_VACIA = 'https://e-cdns-images.dzcdn.net/images/artist/d41d8cd98f00b204e9800998ecf8427e/500x500-000000-80-0-0.jpg';
const fotoEnDeezer = (name, picture_big, nb_fan = 1) => ({ name, picture_big, nb_fan });
function httpArtistas(respuesta) {
  const llamadas = [];
  return {
    llamadas,
    async get(url) {
      llamadas.push(url);
      return ok(respuesta(decodeURIComponent(url)));
    },
  };
}
const argsFotos = (almacen, http, nombres, extra = {}) => ({ almacen, http, nombres, esperar: sinEsperar, ahora: () => AHORA, ...extra });
const configFotos = (almacen) => almacen.obtenerValorConfig('fotosArtistas', {});

test('esNombreBasura: solo dígitos, «#» o «T<n> E<n>»', () => {
  assert.equal(esNombreBasura('195'), true);
  assert.equal(esNombreBasura('#78'), true);
  assert.equal(esNombreBasura('T6 E11 El amor de mi vida'), true);
  assert.equal(esNombreBasura('Soda Stereo'), false);
  assert.equal(esNombreBasura('The 1975'), false);
});

test('foto de artista: nombre exacto acepta y guarda url y fecha', async () => {
  const almacen = preparar([]);
  const http = httpArtistas(() => ({ data: [fotoEnDeezer('Soda Stereo', FOTO_SODA)] }));
  const r = await completarFotosArtistas(argsFotos(almacen, http, ['Soda Stereo']));
  assert.deepEqual(r, { encontradas: 1, procesadas: 1 });
  assert.equal(http.llamadas[0], 'https://api.deezer.com/search/artist?q=Soda%20Stereo');
  assert.deepEqual(await configFotos(almacen), { 'soda stereo': { url: FOTO_SODA, fecha: AHORA } });
});

test('foto de artista: nombre distinto rechaza y se marca no encontrada', async () => {
  const almacen = preparar([]);
  const http = httpArtistas(() => ({ data: [fotoEnDeezer('Los Cantantes', FOTO_SODA)] }));
  const r = await completarFotosArtistas(argsFotos(almacen, http, ['Soda Stereo']));
  assert.deepEqual(r, { encontradas: 0, procesadas: 1 });
  assert.deepEqual(await configFotos(almacen), { 'soda stereo': { url: null, fecha: AHORA } });
});

test('foto de artista: foto vacía o de placeholder rechaza', async () => {
  for (const foto of ['', FOTO_VACIA, 'https://e-cdns-images.dzcdn.net/images/artist//500x500.jpg']) {
    const almacen = preparar([]);
    const http = httpArtistas(() => ({ data: [fotoEnDeezer('Soda Stereo', foto)] }));
    const r = await completarFotosArtistas(argsFotos(almacen, http, ['Soda Stereo']));
    assert.equal(r.encontradas, 0, foto);
    assert.equal((await configFotos(almacen))['soda stereo'].url, null, foto);
  }
});

test('foto de artista: entre nombres iguales gana el de más fans', async () => {
  const almacen = preparar([]);
  const http = httpArtistas(() => ({
    data: [fotoEnDeezer('Soda Stereo', 'https://e/chico.jpg', 10), fotoEnDeezer('SODA  stereo', FOTO_SODA, 500), fotoEnDeezer('Soda Stereo Tributo', 'https://e/otro.jpg', 900)],
  }));
  await completarFotosArtistas(argsFotos(almacen, http, ['Soda Stereo']));
  assert.equal((await configFotos(almacen))['soda stereo'].url, FOTO_SODA);
});

test('foto de artista: nombres basura se saltan sin pedir nada', async () => {
  const almacen = preparar([]);
  const http = httpArtistas(() => ({ data: [] }));
  await completarFotosArtistas(argsFotos(almacen, http, ['195', '#78', 'T6 E11 El amor', 'Soda Stereo']));
  assert.equal(http.llamadas.length, 1);
  assert.deepEqual(Object.keys(await configFotos(almacen)), ['soda stereo']);
});

test('foto de artista: fallo de red no marca', async () => {
  const almacen = preparar([]);
  const http = httpArtistas(() => ({ data: [] }));
  http.get = async () => {
    throw new Error('sin red');
  };
  const r = await completarFotosArtistas(argsFotos(almacen, http, ['Soda Stereo']));
  assert.deepEqual(r, { encontradas: 0, procesadas: 0 });
  assert.deepEqual(await configFotos(almacen), {});
});

test('foto de artista: no busca si ya hay foto y reintenta no encontrados a los 30 días', async () => {
  const config = {
    'soda stereo': { url: FOTO_SODA, fecha: AHORA - DIA },
    'los gatos': { url: null, fecha: AHORA - 29 * DIA },
    vieja: { url: null, fecha: AHORA - 30 * DIA },
  };
  const almacen = preparar([], { configuracion: [{ clave: 'fotosArtistas', valor: config }] });
  const http = httpArtistas(() => ({ data: [] }));
  await completarFotosArtistas(argsFotos(almacen, http, ['Soda Stereo', 'Los Gatos', 'Vieja']));
  assert.equal(http.llamadas.length, 1);
  assert.match(http.llamadas[0], /Vieja/);
});

test('foto de artista: espera 500 ms entre artistas', async () => {
  const almacen = preparar([]);
  const esperas = [];
  await completarFotosArtistas(argsFotos(almacen, httpArtistas(() => ({ data: [] })), ['Uno', 'Dos', 'Tres'], {
    esperar: async (ms) => {
      esperas.push(ms);
    },
  }));
  assert.deepEqual(esperas, [500, 500]);
});

test('foto de artista: máximo 40 por pasada', async () => {
  const nombres = Array.from({ length: 45 }, (_, i) => `Artista ${i}`);
  const almacen = preparar([]);
  const http = httpArtistas(() => ({ data: [] }));
  const r = await completarFotosArtistas(argsFotos(almacen, http, nombres));
  assert.equal(r.procesadas, 40);
  assert.equal(http.llamadas.length, 40);
});

test('artistasSinFotoMetadata: quita los que ya tienen foto en alguna canción suya', () => {
  const tracks = [track('1', 'Soda Stereo, Gustavo Cerati', 'a'), track('2', 'Los Gatos', 'b'), track('3', 'Los Gatos', 'c')];
  const metadata = { tracks: { 1: { fotoArtista: FOTO_SODA }, 3: { fotoArtista: FOTO_VACIA } } };
  assert.deepEqual(artistasSinFotoMetadata(tracks, metadata), ['Los Gatos']);
});

test('tributo no coincide', () => {
  assert.equal(coincide('Coldplay', 'Yellow', 'Piano Tribute Players - Coldplay', 'Yellow'), false);
  assert.equal(coincide('Coldplay', 'Yellow', 'Coldplay', 'Yellow (Karaoke Version)'), false);
  assert.equal(coincide('Coldplay', 'Yellow', 'Coldplay', 'Yellow'), true);
  assert.equal(coincide('Bruce Springsteen', 'Cover Me', 'Bruce Springsteen', 'Cover Me'), true);
});

test('Eve no coincide con Steve Vai', () => {
  assert.equal(coincide('Eve', 'Song', 'Steve Vai', 'Song'), false);
  assert.equal(coincide('Steve Vai', 'Song', 'Eve', 'Song'), false);
});

test('A & B coincide con A', () => {
  assert.equal(coincide('A', 'Song', 'A & B', 'Song'), true);
  assert.equal(coincide('A & B', 'Song', 'A', 'Song'), true);
});

test('nombres sin letras latinas se comparan; sin palabras no se acepta ni se marca', async () => {
  assert.equal(coincide('Кино', 'Группа крови', 'Кино', 'Группа крови'), true);
  assert.equal(coincide('Кино', 'Группа крови', 'ДДТ', 'Группа крови'), false);
  assert.equal(sePuedeComparar('!!!', 'x'), false);
  const almacen = preparar([track('1', '???', '...')]);
  const r = await completarImagenes({ almacen, http: httpFalso(), buscarCanciones: async () => [], obtenerMetadata: sinMetadata, esperar: sinEsperar, ahora: () => AHORA });
  assert.deepEqual(r, { encontradas: 0, procesadas: 0 });
  assert.equal(await almacen.obtenerPorClave('generos', '1'), undefined);
});

test('un 4xx distinto de 404 es fallo, no noEncontrada', async () => {
  const almacen = preparar([track('1', 'A', 'Uno')]);
  const http = { async get(url) { return { status: url.includes('itunes') ? 403 : 200, texto: url.includes('itunes') ? '' : '{"data":[]}', url }; } };
  await completarImagenes({ almacen, http, buscarCanciones: async () => [], obtenerMetadata: sinMetadata, esperar: sinEsperar, ahora: () => AHORA });
  assert.equal(await almacen.obtenerPorClave('generos', '1'), undefined);
});

test('pasadas solapadas comparten promesa y el límite de iTunes vale entre pasadas', async () => {
  const almacen = preparar([track('1', 'A', 'Uno'), track('2', 'B', 'Dos')]);
  const esperas = [];
  const args = { almacen, http: httpFalso(), buscarCanciones: async () => [], obtenerMetadata: sinMetadata, esperar: async (ms) => { esperas.push(ms); }, ahora: () => AHORA };
  const p1 = completarImagenes(args);
  const p2 = completarImagenes(args);
  assert.equal(p1, p2);
  await p1;
  assert.deepEqual(esperas, [4000]);
  // Segunda pasada (otra canción pendiente): la primera petición a iTunes también espera.
  await almacen.guardarRegistro('generos', { trackId: '1', imagen: undefined });
  await completarImagenes({ ...args, ahora: () => AHORA + 31 * DIA + 1000 });
  assert.equal(esperas.length > 1, true);
});

test('si MusicBrainz pisa metadataLocal, la portada se reintenta y imagen se guarda tras confirmarla', async () => {
  const almacen = preparar([track('1', 'A', 'Uno')]);
  let pisar = true;
  const guardar = almacen.guardarRegistro.bind(almacen);
  almacen.guardarRegistro = async (n, v) => {
    if (n === 'metadataLocal' && v.coverUrl && pisar) {
      pisar = false;
      return guardar(n, { trackId: v.trackId, album: 'MB' }); // otra escritura sin la portada
    }
    return guardar(n, v);
  };
  const http = httpFalso({ deezer: () => deezerCon('A', 'Uno', 'https://dz/uno.jpg') });
  const r = await completarImagenes({ almacen, http, buscarCanciones: async () => [], obtenerMetadata: sinMetadata, esperar: sinEsperar, ahora: () => AHORA });
  assert.equal(r.encontradas, 1);
  assert.equal((await almacen.obtenerPorClave('metadataLocal', '1')).coverUrl, 'https://dz/uno.jpg');
  assert.equal((await almacen.obtenerPorClave('generos', '1')).imagen.noEncontrada, false);
});

test('pendientesImagen: imagen sin noEncontrada y sin portada vuelve a pendiente', () => {
  const r = pendientesImagen([track('a', 'A', 'a')], { tracks: {} }, [{ trackId: 'a', imagen: { fecha: AHORA, noEncontrada: false } }], AHORA);
  assert.equal(r.length, 1);
});

test('foto de artista: nombres sin letras latinas comparan por palabras Unicode', async () => {
  let almacen = preparar([]);
  let http = httpArtistas(() => ({ data: [fotoEnDeezer('Other Band', FOTO_SODA), fotoEnDeezer('ДДТ', FOTO_SODA)] }));
  let r = await completarFotosArtistas(argsFotos(almacen, http, ['Кино']));
  assert.equal(r.encontradas, 0);
  almacen = preparar([]);
  http = httpArtistas(() => ({ data: [fotoEnDeezer('Кино', FOTO_SODA)] }));
  r = await completarFotosArtistas(argsFotos(almacen, http, ['Кино']));
  assert.equal(r.encontradas, 1);
  assert.equal((await configFotos(almacen))['кино'].url, FOTO_SODA);
});

test('foto de artista: un nombre sin palabras («!!!») no se consulta ni se marca', async () => {
  const almacen = preparar([]);
  const http = httpArtistas(() => ({ data: [fotoEnDeezer('Other Band', FOTO_SODA)] }));
  const r = await completarFotosArtistas(argsFotos(almacen, http, ['!!!']));
  assert.deepEqual(r, { encontradas: 0, procesadas: 0 });
  assert.equal(http.llamadas.length, 0);
  assert.deepEqual(await configFotos(almacen), {});
});

test('foto de artista: un 403 o un cuerpo con error no dejan marca de no encontrado', async () => {
  for (const respuesta of [{ status: 403, texto: '{}', url: '' }, ok({ error: { code: 300, message: 'x' } })]) {
    const almacen = preparar([]);
    const http = { async get() { return respuesta; } };
    const r = await completarFotosArtistas(argsFotos(almacen, http, ['Soda Stereo']));
    assert.deepEqual(r, { encontradas: 0, procesadas: 0 });
    assert.deepEqual(await configFotos(almacen), {});
  }
});

test('una portada de Deezer sin imagen (/cover//) no vale: se sigue con la siguiente fuente', async () => {
  const almacen = preparar([track('1', 'Artista', 'Uno')]);
  const http = httpFalso({
    deezer: () => deezerCon('Artista', 'Uno', 'https://e-cdns-images.dzcdn.net/images/cover//1000x1000-000000-80-0-0.jpg'),
    itunes: () => itunesCon('Artista', 'Uno', 'https://it/uno/100x100bb.jpg'),
  });
  await completarImagenes({ almacen, http, buscarCanciones: async () => [], obtenerMetadata: sinMetadata, esperar: sinEsperar, ahora: () => AHORA });
  const meta = Object.fromEntries((await almacen.obtenerTodos('metadataLocal')).map((m) => [m.trackId, m.coverUrl]));
  assert.deepEqual(meta, { 1: 'https://it/uno/600x600bb.jpg' });
});

test('iTunes saturado no se reintenta (límite de 15 por minuto)', async () => {
  const almacen = preparar([track('1', 'Artista', 'Uno')]);
  let itunes = 0;
  const http = {
    async get(url) {
      if (url.startsWith('https://itunes.apple.com/')) {
        itunes++;
        return { status: 503, texto: '{}', url };
      }
      return ok({ data: [] });
    },
  };
  await completarImagenes({ almacen, http, buscarCanciones: async () => [], obtenerMetadata: sinMetadata, esperar: sinEsperar, ahora: () => AHORA });
  assert.equal(itunes, 1);
});
