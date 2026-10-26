// Letra palabra a palabra (TTML de BetterLyrics y JSON de LyricsPlus) y elección de proveedor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buscar, etiquetaFuente, obtenerLetras, parsearTtml, segundosTtml, convertirLyricsPlus,
  buscarLyricsPlus, buscarBetterLyrics, buscarEnProveedor, elegirProveedor, proveedoresSinLetra, PROVEEDORES,
} from './letras.js';

const nada = async () => null;
const DIA = 24 * 3600 * 1000;
const almacenFalso = () => {
  const m = new Map();
  return { m, leer: async (k) => m.get(k), guardar: async (k, v) => void m.set(k, v) };
};
const respuestaTexto = (cuerpo, status = 200) => ({ ok: status < 400, status, text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) });

const TTML = `<tt><body dur="3:21.570"><div>
<p begin="27.395" end="28.960" ttm:agent="v1"><span begin="27.395" end="27.549">I</span> <span begin="27.549" end="27.740">been</span> <span begin="28.077" end="28.960">tryna</span></p>
<p begin="30.189" end="32.529"><span begin="30.189" end="31.839">Long</span> <span begin="31.839" end="31.996">e</span><span begin="31.996" end="32.529">nough</span> <span begin="32.5" end="33">it&apos;s &amp; co</span></p>
<p begin="1:02.500" end="1:05"><span begin="1:02.500" end="1:03">Tercera</span></p>
<p begin="1:10" end="1:12">Sin palabras</p>
</div></body></tt>`;

test('segundosTtml: segundos, mm:ss.xx, h:mm:ss y sufijo s', () => {
  assert.equal(segundosTtml('27.395'), 27.395);
  assert.equal(segundosTtml('3:21.570'), 201.57);
  assert.equal(segundosTtml('1:02:03.5'), 3723.5);
  assert.equal(segundosTtml('12.5s'), 12.5);
  assert.ok(Number.isNaN(segundosTtml('')));
  assert.ok(Number.isNaN(segundosTtml(undefined)));
});

test('parsearTtml: palabras con tiempo, sílabas juntas, entidades y línea sin palabras', () => {
  const l = parsearTtml(TTML);
  assert.equal(l.length, 4);
  assert.deepEqual(l[0].palabras.map((w) => w.texto), ['I', 'been', 'tryna']);
  assert.equal(l[0].texto, 'I been tryna');
  assert.equal(l[0].palabras[1].t, 27.549);
  assert.equal(l[0].palabras[1].fin, 27.74);
  // «e» + «nough» sin espacio son una palabra que acaba cuando acaba la última sílaba
  assert.deepEqual(l[1].palabras.map((w) => w.texto), ['Long', 'enough', "it's & co"]);
  assert.equal(l[1].palabras[1].t, 31.839);
  assert.equal(l[1].palabras[1].fin, 32.529);
  assert.equal(l[2].t, 62.5);
  assert.equal(l[3].texto, 'Sin palabras');
  assert.equal(l[3].palabras, undefined);
});

test('BetterLyrics: TTML -> sincronizada con palabras; 401/404 = null; duración distinta = null; 500 lanza', async () => {
  const urls = [];
  const ok = async (u) => (urls.push(u), respuestaTexto({ ttml: TTML }));
  const r = await buscarBetterLyrics({ artista: 'The Weeknd · X', titulo: 'Blinding Lights (Remastered)', duracionS: 200 }, { fetchFn: ok });
  assert.equal(r.fuente, 'betterlyrics');
  assert.equal(r.sincronizada.length, 4);
  assert.equal(r.plana.split('\n')[0], 'I been tryna');
  assert.match(urls[0], /s=Blinding\+Lights&a=The\+Weeknd&d=200/);
  assert.equal(await buscarBetterLyrics({ artista: 'A', titulo: 'B', duracionS: 120 }, { fetchFn: ok }), null); // 201 s frente a 120 s
  assert.equal(await buscarBetterLyrics({ artista: 'A', titulo: 'B' }, { fetchFn: async () => respuestaTexto({ error: 'API key required' }, 401) }), null);
  assert.equal(await buscarBetterLyrics({ artista: 'A', titulo: 'B' }, { fetchFn: async () => respuestaTexto('', 404) }), null);
  await assert.rejects(buscarBetterLyrics({ artista: 'A', titulo: 'B' }, { fetchFn: async () => respuestaTexto('', 500) }));
});

const LP = {
  type: 'Word',
  metadata: { title: 'Shape of You', artist: 'Ed Sheeran', totalDuration: '3:54.000' },
  lyrics: [
    { time: 9731, duration: 2374, text: "The club isn't", syllabus: [{ time: 9731, duration: 196, text: 'The ' }, { time: 9927, duration: 357, text: 'club ' }, { time: 10284, duration: 286, text: "isn't" }, { time: 10600, duration: 100, text: '(oh)', isBackground: true }] },
    { time: 12105, duration: 1985, text: 'So the bar', syllabus: [{ time: 12105, duration: 205, text: 'So ' }, { time: 12310, duration: 118, text: 'the ' }, { time: 12428, duration: 382, text: 'ba' }, { time: 12810, duration: 232, text: 'r' }] },
    { time: 15000, duration: 1000, text: 'Línea sin sílabas', syllabus: [] },
    { time: 0, duration: 0, text: 'Sin tiempo', syllabus: [] },
  ],
};

test('convertirLyricsPlus: ms a segundos, sílabas en palabras, sin voces de fondo y sin líneas de tiempo 0', () => {
  const { sincronizada, plana } = convertirLyricsPlus(LP);
  assert.equal(sincronizada.length, 3);
  assert.deepEqual(sincronizada[0].palabras.map((w) => w.texto), ['The', 'club', "isn't"]);
  assert.equal(sincronizada[0].texto, "The club isn't");
  assert.equal(sincronizada[0].palabras[2].fin, 10.57);
  assert.deepEqual(sincronizada[1].palabras.map((w) => w.texto), ['So', 'the', 'bar']);
  assert.equal(sincronizada[2].palabras, undefined);
  assert.equal(plana.split('\n').length, 4);
});

test('convertirLyricsPlus: con menos de 3 líneas con tiempo no hay sincronizada', () => {
  const r = convertirLyricsPlus({ lyrics: [{ time: 0, text: 'a b c' }, { time: 0, text: 'd e f' }] });
  assert.equal(r.sincronizada, null);
  assert.equal(r.plana, 'a b c\nd e f');
});

test('LyricsPlus: acepta si coincide título y artista; descarta otro título, otra duración y 404', async () => {
  const dar = (cuerpo, st = 200) => async () => respuestaTexto(cuerpo, st);
  const lp3 = { ...LP, lyrics: LP.lyrics.slice(0, 3) };
  const r = await buscarLyricsPlus({ artista: 'Ed Sheeran', titulo: 'Shape of You', duracionS: 234 }, { fetchFn: dar(lp3) });
  assert.equal(r.fuente, 'lyricsplus');
  assert.equal(r.sincronizada.length, 3);
  assert.equal(await buscarLyricsPlus({ artista: 'Ed Sheeran', titulo: 'Perfect' }, { fetchFn: dar(lp3) }), null);
  assert.equal(await buscarLyricsPlus({ artista: 'Otro', titulo: 'Shape of You' }, { fetchFn: dar(lp3) }), null);
  assert.equal(await buscarLyricsPlus({ artista: 'Ed Sheeran', titulo: 'Shape of You', duracionS: 100 }, { fetchFn: dar(lp3) }), null);
  assert.equal(await buscarLyricsPlus({ artista: 'Ed Sheeran', titulo: 'Shape of You' }, { fetchFn: dar({ error: {} }, 404) }), null);
  await assert.rejects(buscarLyricsPlus({ artista: 'Ed Sheeran', titulo: 'Shape of You' }, { fetchFn: dar({}, 502) }));
});

test('buscar: tras LRCLIB prueba LyricsPlus y BetterLyrics antes que NetEase, y anota los que no la tenían', async () => {
  const llamadas = [];
  const fuente = (n, r) => async () => (llamadas.push(n), r);
  const estado = {};
  const r = await buscar({ artista: 'A', titulo: 'B' }, {
    pedirFn: async () => null,
    estado,
    buscarLyricsPlus: fuente('lp', null),
    buscarBetterLyrics: fuente('bl', { sincronizada: [{ t: 1, texto: 'x' }], plana: 'x', fuente: 'betterlyrics' }),
    buscarNetEase: fuente('ne', null),
    buscarYoutube: nada,
    buscarOvh: nada,
  });
  assert.equal(r.fuente, 'betterlyrics');
  assert.deepEqual(llamadas, ['lp', 'bl']);
  assert.deepEqual([...estado.sinLetra].sort(), ['lrclib', 'lyricsplus']);
});

test('PROVEEDORES lista todos en el orden de la cadena y la etiqueta distingue palabra a palabra', () => {
  assert.deepEqual(PROVEEDORES.map((p) => p.id), ['lrclib', 'lyricsplus', 'betterlyrics', 'netease', 'youtube-music', 'lyrics-ovh']);
  assert.equal(etiquetaFuente({ fuente: 'betterlyrics', sincronizada: [{ palabras: [{}] }] }), 'Letra: BetterLyrics · palabra a palabra');
  assert.equal(etiquetaFuente({ fuente: 'lyricsplus', sincronizada: [{ t: 1 }] }), 'Letra: LyricsPlus');
});

test('buscarEnProveedor: consulta solo ese proveedor; id desconocido lanza; LRCLIB caído lanza', async () => {
  const llamadas = [];
  const r = await buscarEnProveedor('netease', { artista: 'A', titulo: 'B' }, {
    buscarNetEase: async () => (llamadas.push('ne'), { plana: 'n', fuente: 'netease' }),
    buscarLyricsPlus: async () => llamadas.push('lp'),
  });
  assert.equal(r.fuente, 'netease');
  assert.deepEqual(llamadas, ['ne']);
  await assert.rejects(buscarEnProveedor('nada', { artista: 'A', titulo: 'B' }));
  await assert.rejects(buscarEnProveedor('lrclib', { artista: 'A', titulo: 'B' }, { pedirFn: () => Promise.reject(new Error('red')) }));
  assert.equal(await buscarEnProveedor('lrclib', { artista: 'A', titulo: 'B' }, { pedirFn: async () => null }), null);
});

test('elegirProveedor: si responde, sustituye la letra y se recuerda; si no, queda como «sin letra» y se conserva la actual', async () => {
  const almacen = almacenFalso();
  const c = { artista: 'Elegir', titulo: 'Cancion' };
  const original = { plana: 'orig', sincronizada: null, instrumental: false, fuente: 'lrclib' };
  await obtenerLetras(c, { almacen, ahora: () => 10, buscarFn: async () => original });
  const nueva = { plana: 'nueva', sincronizada: [{ t: 1, texto: 'x', palabras: [{ t: 1, fin: 2, texto: 'x' }] }], instrumental: false, fuente: 'lyricsplus' };
  assert.equal(await elegirProveedor(c, 'betterlyrics', { almacen, ahora: () => 10, buscarEnFn: async () => null }), null);
  assert.deepEqual(proveedoresSinLetra(c), ['betterlyrics']);
  assert.equal((await obtenerLetras(c, { almacen })).plana, 'orig');
  assert.equal(almacen.m.get('elegir|cancion').letra.plana, 'orig');
  assert.equal(await elegirProveedor(c, 'lyricsplus', { almacen, ahora: () => 20, buscarEnFn: async () => nueva }), nueva);
  assert.equal((await obtenerLetras(c, { almacen })).fuente, 'lyricsplus');
  const guardada = almacen.m.get('elegir|cancion');
  assert.equal(guardada.elegido, 'lyricsplus');
  assert.equal(guardada.letra.plana, 'nueva');
  assert.equal(guardada.hasta, 20 + 30 * DIA);
  await assert.rejects(elegirProveedor(c, 'netease', { almacen, buscarEnFn: async () => { throw new Error('red'); } }));
  assert.equal((await obtenerLetras(c, { almacen })).fuente, 'lyricsplus');
});
