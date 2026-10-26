import test from 'node:test';
import assert from 'node:assert/strict';
import { buscar, coincide, buscarEnYouTubeMusic, buscarNetEase, buscarLyricsOvh, limpiarTitulo, etiquetaFuente, obtenerLetras } from './letras.js';

const nada = async () => null;

const cancion = (titulo, artista) => ({ titulo, artista });
const cand = (trackName, artistName) => ({ trackName, artistName });

test('misma canción con «(Remastered 2011)» coincide', () => {
  assert.equal(coincide(cancion('Under Pressure', 'Queen'), cand('Under Pressure (Remastered 2011)', 'Queen')), true);
  assert.equal(coincide(cancion('Under Pressure (Remastered 2011)', 'Queen'), cand('Under Pressure', 'Queen')), true);
});

test('mismo artista y otro título no coincide', () => {
  assert.equal(coincide(cancion('Bohemian Rhapsody', 'Queen'), cand('Radio Ga Ga', 'Queen')), false);
});

test('mismo título y otro artista no coincide', () => {
  assert.equal(coincide(cancion('Hold On', 'Chord Overstreet'), cand('Hold On', 'Justin Bieber')), false);
});

test('«Shakira, Fuerza Regida» frente a «Shakira» coincide', () => {
  assert.equal(coincide(cancion('El Jefe', 'Shakira, Fuerza Regida'), cand('El Jefe', 'Shakira')), true);
  assert.equal(coincide(cancion('El Jefe', 'Shakira'), cand('El Jefe', 'Fuerza Regida & Shakira')), true);
});

test('separa artistas por feat., ft. y x', () => {
  assert.equal(coincide(cancion('Tití Me Preguntó', 'Bad Bunny feat. Jowell'), cand('Tití Me Preguntó', 'Bad Bunny')), true);
  assert.equal(coincide(cancion('Hit', 'Rosalía x Travis'), cand('Hit', 'Travis')), true);
});

test('tildes, mayúsculas y signos no importan', () => {
  assert.equal(coincide(cancion('Bailando', 'Enrique Iglesias'), cand('BAILANDO!', 'enrique iglésias')), true);
  assert.equal(coincide(cancion('Corazón Espinado', 'Maná'), cand('corazon espinado', 'MANA')), true);
});

test('un título contenido en el otro coincide', () => {
  assert.equal(coincide(cancion('Blinding Lights', 'The Weeknd'), cand('Blinding Lights - Radio Edit', 'The Weeknd')), true);
});

test('vacíos no coinciden', () => {
  assert.equal(coincide(cancion('', 'A'), cand('', 'A')), false);
  assert.equal(coincide(cancion('T', ''), cand('T', '')), false);
});

test('alfabetos no latinos: «Группа крови / Кино» y «夜に駆ける / YOASOBI» coinciden', () => {
  assert.equal(coincide(cancion('Группа крови', 'Кино'), cand('Группа крови', 'Кино')), true);
  assert.equal(coincide(cancion('夜に駆ける', 'YOASOBI'), cand('夜に駆ける', 'YOASOBI')), true);
});

test('alfabetos no latinos: otro título no coincide', () => {
  assert.equal(coincide(cancion('Группа крови', 'Кино'), cand('Звезда по имени Солнце', 'Кино')), false);
  assert.equal(coincide(cancion('夜に駆ける', 'YOASOBI'), cand('怪物', 'YOASOBI')), false);
});

test('tildes latinas siguen ignorándose', () => {
  assert.equal(coincide(cancion('Corazón', 'Maluma'), cand('Corazon', 'Maluma')), true);
});

test('una subcadena de ≤ 3 caracteres no casa con un título largo', () => {
  assert.equal(coincide(cancion('Yes', 'Artista'), cand('Yes I Am Here With You', 'Artista')), false);
  assert.equal(coincide(cancion('Yes', 'Artista'), cand('Yes', 'Artista')), true);
});

test('si LRCLIB no encuentra nada, YouTube Music aporta letra plana de una coincidencia válida', async () => {
  const yt = { music: {
    search: async () => ({ contents: [{ id: 'abc', title: 'Bailando', artists: [{ name: 'Enrique Iglesias' }] }] }),
    getLyrics: async () => ({ lyrics: 'Uno\nDos' }),
  } };
  const r = await buscar(
    { titulo: 'Bailando', artista: 'Enrique Iglesias' },
    { pedirFn: async () => [], buscarLyricsPlus: nada, buscarBetterLyrics: nada, buscarNetEase: nada, buscarOvh: nada, buscarYoutube: (c) => buscarEnYouTubeMusic(c, { crearInnertube: async () => yt }) },
  );
  assert.deepEqual(r, { sincronizada: null, plana: 'Uno\nDos', instrumental: false, fuente: 'youtube-music' });
});

test('YouTube Music descarta el resultado si no coincide título y artista', async () => {
  const yt = { music: {
    search: async () => ({ contents: [{ id: 'abc', title: 'Otra canción', artists: [{ name: 'Otro artista' }] }] }),
    getLyrics: async () => ({ lyrics: 'No debe usarse' }),
  } };
  assert.equal(await buscarEnYouTubeMusic({ titulo: 'Bailando', artista: 'Enrique Iglesias' }, { crearInnertube: async () => yt }), null);
});

test('buscar: si LRCLIB falla (429/red) usa la letra de YouTube Music', async () => {
  const { buscar } = await import('./letras.js');
  const r = await buscar({ artista: 'Disclosure', titulo: 'Omen' }, {
    pedirFn: () => Promise.reject(new TypeError('Failed to fetch')),
    buscarLyricsPlus: nada, buscarBetterLyrics: nada, buscarNetEase: nada,
    buscarOvh: nada,
    buscarYoutube: async () => ({ sincronizada: null, plana: 'hola', fuente: 'youtube' }),
  });
  assert.equal(r.plana, 'hola');
});

test('buscar: con «(feat. …)» prueba /get también con el título limpio', async () => {
  const pedidas = [];
  const r = await buscar(
    { artista: 'David Guetta', titulo: 'Sound of Letting Go (feat. Chris Willis)', duracionS: 215 },
    {
      pedirFn: async (url) => {
        pedidas.push(url);
        if (!url.includes('/get?') || url.includes('feat')) return null;
        return { trackName: 'Sound of Letting Go', artistName: 'David Guetta', plainLyrics: 'la la', syncedLyrics: null };
      },
      buscarLyricsPlus: nada, buscarBetterLyrics: nada, buscarNetEase: nada,
      buscarOvh: nada,
      buscarYoutube: nada,
    },
  );
  assert.equal(r?.plana, 'la la');
  assert.equal(pedidas.filter((u) => u.includes('/get?')).length, 2);
});

test('limpiarTitulo quita paréntesis y sufijos de versión', () => {
  assert.equal(limpiarTitulo('Blinding Lights - Radio Edit'), 'Blinding Lights');
  assert.equal(limpiarTitulo('Under Pressure - Remastered 2011'), 'Under Pressure');
  assert.equal(limpiarTitulo("I Don't Want To Miss A Thing - From \"Armageddon\" Soundtrack"), "I Don't Want To Miss A Thing");
  assert.equal(limpiarTitulo('El baile y el salon (Unplugged) - En Vivo'), 'El baile y el salon');
  assert.equal(limpiarTitulo('Stand By Me - Ben E. King'), 'Stand By Me - Ben E. King');
  assert.equal(limpiarTitulo('Sweet Disposition (a moment, a love)'), 'Sweet Disposition');
});

test('coincide: artistas separados por «·» y títulos con sufijo de versión', () => {
  assert.equal(coincide(cancion('Blame', 'Calvin Harris · John Newman'), cand('Blame', 'Calvin Harris')), true);
  assert.equal(coincide(cancion('Hit - Radio Edit', 'A'), cand('Hit', 'A')), true);
});

test('buscar: usa solo el primer artista de «A · B» al consultar LRCLIB', async () => {
  const pedidas = [];
  await buscar({ artista: 'Calvin Harris · John Newman', titulo: 'Blame' }, {
    pedirFn: async (u) => { pedidas.push(u); return null; },
    buscarLyricsPlus: nada, buscarBetterLyrics: nada, buscarNetEase: nada, buscarYoutube: nada, buscarOvh: nada,
  });
  assert.ok(pedidas.length >= 2 && pedidas.every((u) => u.includes('artist_name=Calvin+Harris&')));
});

const respuesta = (cuerpo, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo });

function fetchNetEase({ canciones, lrc, pureMusic = false }) {
  const urls = [];
  const fn = async (url) => {
    urls.push(url);
    if (url.includes('/search/get')) return respuesta({ result: { songs: canciones } });
    return respuesta({ lrc: { lyric: lrc }, pureMusic });
  };
  return { fn, urls };
}

const LRC = '[00:00.00] 作词 : X\n[00:01.00] Hola\n[00:05.50] Adiós\n[00:09.00] Fin';
const cNE = { id: 7, name: 'Pide piso', duration: 200000, artists: [{ name: 'Bajofondo' }] };

test('NetEase: devuelve letra sincronizada sin las líneas de créditos', async () => {
  const { fn, urls } = fetchNetEase({ canciones: [cNE], lrc: LRC });
  const r = await buscarNetEase({ artista: 'Bajofondo', titulo: 'Pide piso', duracionS: 205 }, { fetchFn: fn });
  assert.equal(r.fuente, 'netease');
  assert.deepEqual(r.sincronizada.map((l) => l.texto), ['Hola', 'Adiós', 'Fin']);
  assert.ok(urls[0].includes('music.163.com/api/search/get') && urls[1].includes('id=7'));
});

test('NetEase: descarta otro artista, otro título o duración distinta de >15 s', async () => {
  for (const cancionPedida of [
    { artista: 'Otro', titulo: 'Pide piso' },
    { artista: 'Bajofondo', titulo: 'Otra cosa' },
    { artista: 'Bajofondo', titulo: 'Pide piso', duracionS: 120 },
  ]) {
    const { fn } = fetchNetEase({ canciones: [cNE], lrc: LRC });
    assert.equal(await buscarNetEase(cancionPedida, { fetchFn: fn }), null);
  }
});

test('NetEase: pureMusic = instrumental; sin letra = null; HTTP de error lanza', async () => {
  const a = fetchNetEase({ canciones: [cNE], lrc: '', pureMusic: true });
  assert.equal((await buscarNetEase({ artista: 'Bajofondo', titulo: 'Pide piso' }, { fetchFn: a.fn })).instrumental, true);
  const b = fetchNetEase({ canciones: [cNE], lrc: '' });
  assert.equal(await buscarNetEase({ artista: 'Bajofondo', titulo: 'Pide piso' }, { fetchFn: b.fn }), null);
  await assert.rejects(buscarNetEase({ artista: 'A', titulo: 'B' }, { fetchFn: async () => respuesta({}, 503) }));
});

test('NetEase: corta por tiempo límite', async () => {
  await assert.rejects(
    buscarNetEase({ artista: 'A', titulo: 'B' }, { fetchFn: () => new Promise(() => {}), limiteMs: 30 }),
    /tiempo agotado/,
  );
});

test('lyrics.ovh: letra plana, 404 = null, texto corto = null', async () => {
  const url = [];
  const largo = 'Línea uno de la letra\nLínea dos de la letra';
  const r = await buscarLyricsOvh({ artista: 'Coldplay', titulo: 'Yellow (Remastered)' }, { fetchFn: async (u) => { url.push(u); return respuesta({ lyrics: largo }); } });
  assert.deepEqual(r, { sincronizada: null, plana: largo, instrumental: false, fuente: 'lyrics-ovh' });
  assert.ok(url[0].endsWith('/v1/Coldplay/Yellow'));
  assert.equal(await buscarLyricsOvh({ artista: 'A', titulo: 'B' }, { fetchFn: async () => respuesta({}, 404) }), null);
  assert.equal(await buscarLyricsOvh({ artista: 'A', titulo: 'B' }, { fetchFn: async () => respuesta({ lyrics: 'corta' }) }), null);
});

test('buscar: orden LRCLIB, NetEase, YouTube Music, lyrics.ovh', async () => {
  const llamadas = [];
  const fuente = (n, r) => async () => { llamadas.push(n); return r; };
  const base = { pedirFn: async () => null };
  const r = await buscar({ artista: 'A', titulo: 'B' }, { ...base, buscarLyricsPlus: nada, buscarBetterLyrics: nada, buscarNetEase: fuente('ne', null), buscarYoutube: fuente('yt', null), buscarOvh: fuente('ovh', { plana: 'x', fuente: 'lyrics-ovh' }) });
  assert.equal(r.fuente, 'lyrics-ovh');
  assert.deepEqual(llamadas, ['ne', 'yt', 'ovh']);
  llamadas.length = 0;
  const r2 = await buscar({ artista: 'A', titulo: 'B' }, { ...base, buscarLyricsPlus: nada, buscarBetterLyrics: nada, buscarNetEase: fuente('ne', { plana: 'y', fuente: 'netease' }), buscarYoutube: fuente('yt', null), buscarOvh: fuente('ovh', null) });
  assert.equal(r2.fuente, 'netease');
  assert.deepEqual(llamadas, ['ne']);
});

test('buscar: un respaldo que lanza no rompe la cadena y marca el estado incompleto', async () => {
  const estado = {};
  const r = await buscar({ artista: 'A', titulo: 'B' }, {
    pedirFn: async () => null, estado,
    buscarLyricsPlus: nada, buscarBetterLyrics: nada, buscarNetEase: async () => { throw new Error('red'); },
    buscarYoutube: nada,
    buscarOvh: async () => ({ plana: 'z', fuente: 'lyrics-ovh' }),
  });
  assert.equal(r.plana, 'z');
  assert.equal(estado.incompleto, true);
});

test('etiquetaFuente nombra cada fuente', () => {
  assert.equal(etiquetaFuente({ fuente: 'lrclib', sincronizada: [{}] }), 'Letra: LRCLIB');
  assert.equal(etiquetaFuente({ fuente: 'netease', sincronizada: [{}] }), 'Letra: NetEase Cloud Music');
  assert.equal(etiquetaFuente({ fuente: 'youtube-music', sincronizada: null }), 'Letra de YouTube Music · sin sincronizar');
  assert.equal(etiquetaFuente({ fuente: 'lyrics-ovh', sincronizada: null }), 'Letra de lyrics.ovh · sin sincronizar');
});

function almacenFalso() {
  const m = new Map();
  return { m, leer: async (k) => m.get(k), guardar: async (k, v) => void m.set(k, v) };
}

const DIA = 24 * 3600 * 1000;

test('caché: «no encontrada» se guarda 7 días y se respeta; caducada, se vuelve a buscar', async () => {
  const almacen = almacenFalso();
  const ahora = 1_000_000;
  let busquedas = 0;
  const buscarFn = async () => { busquedas++; return null; };
  assert.equal(await obtenerLetras({ artista: 'Cache Uno', titulo: 'Sin letra' }, { almacen, ahora: () => ahora, buscarFn }), null);
  const [clave, entrada] = [...almacen.m.entries()][0];
  assert.equal(entrada.hasta, ahora + 7 * DIA);
  // La caché en memoria es por sesión: se simula una sesión nueva copiando la entrada persistente bajo otras claves.
  almacen.m.set('cache uno|sin letra bis', entrada);
  almacen.m.set('cache uno|sin letra ter', entrada);
  assert.ok(clave);
  await obtenerLetras({ artista: 'Cache Uno', titulo: 'Sin letra bis' }, { almacen, ahora: () => ahora + 6 * DIA, buscarFn });
  assert.equal(busquedas, 1);
  await obtenerLetras({ artista: 'Cache Uno', titulo: 'Sin letra ter' }, { almacen, ahora: () => ahora + 8 * DIA, buscarFn });
  assert.equal(busquedas, 2);
});

test('caché: un fallo de red no se guarda como «no encontrada»; una letra hallada sí', async () => {
  const almacen = almacenFalso();
  await obtenerLetras({ artista: 'Cache Dos', titulo: 'Sin red' }, {
    almacen,
    buscarFn: async (_c, { estado }) => { estado.incompleto = true; return null; },
  });
  assert.equal(almacen.m.size, 0);
  await obtenerLetras({ artista: 'Cache Dos', titulo: 'Con letra' }, {
    almacen, ahora: () => 5,
    buscarFn: async () => ({ plana: 'la', sincronizada: null, instrumental: false, fuente: 'lrclib' }),
  });
  const guardada = [...almacen.m.values()][0];
  assert.equal(guardada.letra.plana, 'la');
  assert.equal(guardada.hasta, 5 + 30 * DIA);
});
