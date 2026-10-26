// src/data/letras.js
// Letras desde LRCLIB (lrclib.net): gratis, sin clave, con CORS abierto, así
// que sirve igual en web, escritorio y Android. Primero la búsqueda exacta
// (artista + título + duración, como BitChord); si no, la abierta, eligiendo
// la de duración más parecida y prefiriendo las sincronizadas.
// Respaldos, en este orden: LyricsPlus (palabra a palabra), BetterLyrics (palabra
// a palabra, solo canciones que ya tiene en caché), NetEase Cloud Music
// (sincronizada), YouTube Music (plana) y lyrics.ovh (plana). Todos gratuitos y
// sin clave; BetterLyrics, NetEase y lyrics.ovh no tienen CORS abierto, así que
// en el móvil salen por la red nativa. El usuario puede forzar un proveedor
// concreto (`elegirProveedor`) y esa elección queda en la caché de la canción.

const BASE = 'https://lrclib.net/api';
const LIMITE_FUENTE_MS = 6000;
const TTL_NO_ENCONTRADA_MS = 7 * 24 * 3600 * 1000;
const TTL_ENCONTRADA_MS = 30 * 24 * 3600 * 1000;
const cache = new Map(); // clave -> Promise<resultado>

const ETIQUETAS = {
  lrclib: 'LRCLIB',
  lyricsplus: 'LyricsPlus',
  betterlyrics: 'BetterLyrics',
  netease: 'NetEase Cloud Music',
  'youtube-music': 'YouTube Music',
  'lyrics-ovh': 'lyrics.ovh',
};

/** Proveedores que se pueden elegir a mano, en el orden de la cadena automática. */
export const PROVEEDORES = ['lrclib', 'lyricsplus', 'betterlyrics', 'netease', 'youtube-music', 'lyrics-ovh'].map((id) => ({ id, nombre: ETIQUETAS[id] }));

/** Pie del panel: «Letra: LRCLIB», «Letra de YouTube Music · sin sincronizar»... */
export function etiquetaFuente(letra) {
  const nombre = ETIQUETAS[letra?.fuente] ?? 'LRCLIB';
  if (letra?.sincronizada?.some((l) => l.palabras?.length)) return `Letra: ${nombre} · palabra a palabra`;
  return letra?.sincronizada ? `Letra: ${nombre}` : `Letra de ${nombre} · sin sincronizar`;
}

/** "[01:23.45] texto" -> [{t: segundos, texto}] ordenado. */
export function parsearLrc(lrc) {
  const lineas = [];
  for (const cruda of String(lrc ?? '').split('\n')) {
    const marcas = [...cruda.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (marcas.length === 0) continue;
    const texto = cruda.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of marcas) lineas.push({ t: Number(m[1]) * 60 + Number(m[2]), texto });
  }
  return lineas.sort((a, b) => a.t - b.t);
}

function resultado(j) {
  if (!j) return null;
  return {
    sincronizada: j.syncedLyrics ? parsearLrc(j.syncedLyrics) : null,
    plana: j.plainLyrics ?? null,
    instrumental: !!j.instrumental,
    fuente: 'lrclib',
  };
}

/** fetch con tiempo límite: aborta la petición y, si el fetch no hace caso (red nativa), deja de esperarla. */
async function fetchConLimite(fetchFn, url, init = {}, ms = LIMITE_FUENTE_MS) {
  const ctl = new AbortController();
  let timer;
  const limite = new Promise((_, rechazar) => {
    timer = setTimeout(() => {
      ctl.abort();
      rechazar(new Error(`tiempo agotado (${ms} ms)`));
    }, ms);
  });
  try {
    return await Promise.race([fetchFn(url, { ...init, signal: ctl.signal }), limite]);
  } finally {
    clearTimeout(timer);
  }
}

async function pedir(url, reintentos = 2) {
  const r = await fetchConLimite(fetch, url, { headers: { Accept: 'application/json' } });
  // LRCLIB da 503 de vez en cuando (a veces seguidos) y 429 si se le machaca: reintentos cortos.
  if ((r.status >= 500 || r.status === 429) && reintentos > 0) {
    await new Promise((ok) => setTimeout(ok, r.status === 429 ? 1500 : 800));
    return pedir(url, reintentos - 1);
  }
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`LRCLIB HTTP ${r.status}`);
  return r.json();
}

/**
 * Caché persistente (solo en el móvil, en el store clave/valor «configuracion» de IndexedDB):
 * las letras halladas 30 días y las «no encontrada» 7, para no machacar las APIs.
 * @returns {{leer: (k: string) => Promise<any>, guardar: (k: string, v: any) => Promise<void>}|null}
 */
export function almacenPorDefecto() {
  if (import.meta.env?.VITE_MODO_LOCAL !== 'true' || typeof indexedDB === 'undefined') return null;
  const db = () => import('./lib/db.js');
  return {
    leer: async (k) => (await (await db()).obtenerPorClave('configuracion', `letras:${k}`))?.valor,
    guardar: async (k, v) => void (await (await db()).guardarValorConfig(`letras:${k}`, v)),
  };
}

export const claveDe = ({ artista, titulo }) => `${artista}|${titulo}`.toLowerCase();
// Por canción: proveedores que ya no la tenían (✕ en la hoja de proveedores) y el elegido a mano.
const estados = new Map(); // clave -> {sinLetra: Set<string>, elegido: string|null}
const estadoDe = (clave) => {
  if (!estados.has(clave)) estados.set(clave, { sinLetra: new Set(), elegido: null });
  return estados.get(clave);
};

function persistir(almacen, clave, letra, ahora) {
  const e = estadoDe(clave);
  return Promise.resolve(
    almacen?.guardar(clave, { letra, hasta: ahora() + (letra ? TTL_ENCONTRADA_MS : TTL_NO_ENCONTRADA_MS), sinLetra: [...e.sinLetra], elegido: e.elegido }),
  ).catch(() => {});
}

/** Proveedores que ya se probaron para esta canción sin encontrarla. */
export const proveedoresSinLetra = (cancion) => [...estadoDe(claveDe(cancion)).sinLetra];

/**
 * @param {{artista: string, titulo: string, album?: string|null, duracionS?: number}} t
 * @returns {Promise<{sincronizada: Array<{t:number,texto:string,palabras?:Array<{t:number,fin:number,texto:string}>}>|null, plana: string|null, instrumental: boolean, fuente?: string}|null>}
 *   null = no hay letra.
 */
export function obtenerLetras({ artista, titulo, album, duracionS }, { almacen = almacenPorDefecto(), ahora = Date.now, buscarFn = buscar } = {}) {
  const clave = claveDe({ artista, titulo });
  if (!cache.has(clave)) {
    const promesa = (async () => {
      const guardada = await almacen?.leer(clave).catch(() => undefined);
      const e = estadoDe(clave);
      if (guardada && typeof guardada.hasta === 'number' && guardada.hasta > ahora()) {
        for (const id of guardada.sinLetra ?? []) e.sinLetra.add(id);
        e.elegido = guardada.elegido ?? null;
        return guardada.letra ?? null;
      }
      const estado = { incompleto: false, sinLetra: new Set() };
      const letra = await buscarFn({ artista, titulo, album, duracionS }, { estado });
      for (const id of estado.sinLetra) e.sinLetra.add(id);
      // Un fallo de red (LRCLIB caído, sin conexión) no se anota como «no encontrada».
      if (letra || !estado.incompleto) persistir(almacen, clave, letra, ahora);
      return letra;
    })().catch((e) => {
      cache.delete(clave); // un fallo de red no se queda cacheado
      throw e;
    });
    cache.set(clave, promesa);
  }
  return cache.get(clave);
}

/**
 * Busca solo en el proveedor `id`. Si encuentra, pasa a ser la letra de la canción (y se
 * recuerda en la caché persistente); si no, se anota como «sin letra». Lanza si falla la red.
 */
export async function elegirProveedor(cancion, id, { almacen = almacenPorDefecto(), ahora = Date.now, buscarEnFn = buscarEnProveedor } = {}) {
  const clave = claveDe(cancion);
  const letra = await buscarEnFn(id, cancion);
  const e = estadoDe(clave);
  if (letra) {
    e.sinLetra.delete(id);
    e.elegido = id;
    cache.set(clave, Promise.resolve(letra));
    await persistir(almacen, clave, letra, ahora);
    return letra;
  }
  e.sinLetra.add(id);
  const actual = await (cache.get(clave) ?? Promise.resolve(null)).catch(() => null);
  await persistir(almacen, clave, actual, ahora);
  return null;
}

const normalizar = (t) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    // Tildes solo en latín: en cirílico/japonés las marcas son parte de la letra.
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const sinParentesis = (t) => String(t ?? '').replace(/\s*[([][^)\]]*[)\]]/g, '');

// « - Remastered 2011», « - Radio Edit», « - Piano Version», « - From "Armageddon" Soundtrack»...
const SUFIJO_VERSION =
  /\s+[-–—]\s+(?:.*\b(?:remaster(?:ed)?|radio|edit|version|versi[oó]n|mix|remix|live|en vivo|cover|instrumental|soundtrack|from|mono|stereo|deluxe|bonus|unplugged|acoustic|ac[uú]stic[oa]|demo|single|extended)\b.*|(?:19|20)\d\d\b.*)$/i;

/** Título sin «(feat. X)», «[Live]» ni sufijos « - Remastered», « - Radio Edit»... */
export function limpiarTitulo(t) {
  const limpio = sinParentesis(t).replace(SUFIJO_VERSION, '').trim();
  return limpio || String(t ?? '').trim();
}

/** Primer artista de «A · B» (el separador del importador); solo para consultar. */
const primerArtista = (t) => String(t ?? '').split(/\s*·\s*/)[0].trim() || String(t ?? '');

const artistasDe = (t) =>
  String(t ?? '')
    .split(/\s*(?:,|&|·|;|\/|\bfeat\.?|\bft\.?|\bfeaturing\b|\s+x\s+)\s*/i)
    .map(normalizar)
    .filter(Boolean);

/**
 * ¿El resultado de LRCLIB es esta canción? Título limpio (sin paréntesis ni sufijos de versión,
 * normalizado) igual o contenido en el otro, y al menos un artista en común. Mejor sin letra que una equivocada.
 * @param {{titulo: string, artista: string}} cancion
 * @param {{trackName?: string, artistName?: string}} candidato
 */
export function coincide({ titulo, artista }, { trackName, artistName }) {
  const a = normalizar(limpiarTitulo(titulo));
  const b = normalizar(limpiarTitulo(trackName));
  if (!a || !b || !(a === b || a.includes(b) || b.includes(a))) return false;
  // Una subcadena muy corta («Yes», «Hey») no basta para dar por buena una más larga.
  if (a !== b && Math.min(a.length, b.length) <= 3) return false;
  const propios = artistasDe(artista);
  return artistasDe(artistName).some((x) => propios.includes(x));
}

async function crearInnertubeLetras() {
  const { Capacitor } = await import('@capacitor/core');
  const { crearFetchNativo } = await import('./audio-nativo.js');
  const { Innertube } = await import('youtubei.js');
  return Innertube.create({
    ...(Capacitor.isNativePlatform() ? { fetch: crearFetchNativo() } : {}),
    generate_session_locally: true,
    retrieve_player: false,
  });
}

function candidatosYoutube(resultado) {
  return resultado?.contents ?? resultado?.results ?? [];
}

/** Alternativa sin sincronización: solo se acepta una coincidencia de título y artista. */
export async function buscarEnYouTubeMusic(cancion, { crearInnertube = crearInnertubeLetras, limiteMs = LIMITE_FUENTE_MS } = {}) {
  let timer;
  const limite = new Promise((ok) => {
    timer = setTimeout(() => ok(null), limiteMs);
  });
  const trabajo = (async () => {
    const yt = await crearInnertube();
    const busqueda = await yt.music.search(`${cancion.titulo} ${cancion.artista}`, { type: 'song' });
    const pista = candidatosYoutube(busqueda).find((x) =>
      x?.id && coincide(cancion, { trackName: x.title?.text ?? x.title, artistName: (x.artists ?? x.authors ?? []).map((a) => a.name ?? a.text).join(', ') }),
    );
    if (!pista) return null;
    const letra = await yt.music.getLyrics(pista.id);
    const plana = String(letra?.lyrics ?? letra?.text ?? letra?.contents?.text ?? '').trim();
    return plana ? { sincronizada: null, plana, instrumental: false, fuente: 'youtube-music' } : null;
  })().catch(() => null);
  try {
    return await Promise.race([trabajo, limite]);
  } finally {
    clearTimeout(timer);
  }
}

/** fetch que se salta CORS en el móvil (CapacitorHttp); en web/Node, el global. */
async function fetchSinCors() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { crearFetchNativo } = await import('./audio-nativo.js');
      return crearFetchNativo();
    }
  } catch {
    // sin Capacitor (Node, tests): fetch global
  }
  return fetch.bind(globalThis);
}

const REGEX_CREDITOS = /^(?:作词|作曲|编曲|制作人|混音|母带|录音|监制|词|曲)\s*[:：]/;

/**
 * NetEase Cloud Music: búsqueda + letra LRC. Se acepta solo si artista y título coinciden y, cuando
 * se conoce, la duración difiere menos de 15 s. Devuelve null si no hay; lanza si falla la red.
 */
export async function buscarNetEase({ artista, titulo, duracionS }, { fetchFn, limiteMs = LIMITE_FUENTE_MS } = {}) {
  const f = fetchFn ?? (await fetchSinCors());
  const json = async (url) => {
    const r = await fetchConLimite(f, url, {}, limiteMs);
    if (!r.ok) throw new Error(`NetEase HTTP ${r.status}`);
    return JSON.parse(await r.text());
  };
  const q = `${primerArtista(artista)} ${limpiarTitulo(titulo)}`;
  const busqueda = await json(`https://music.163.com/api/search/get?${new URLSearchParams({ s: q, type: '1', limit: '10', offset: '0' })}`);
  const candidatas = (busqueda?.result?.songs ?? [])
    .filter((c) => coincide({ titulo, artista }, { trackName: c.name, artistName: (c.artists ?? []).map((a) => a.name).join(', ') }))
    .filter((c) => {
      const d = (c.duration ?? c.dt ?? 0) / 1000;
      return !(duracionS > 0 && d > 0) || Math.abs(d - duracionS) <= 15;
    })
    .slice(0, 3);
  for (const c of candidatas) {
    const l = await json(`https://music.163.com/api/song/lyric?id=${c.id}&lv=1`);
    if (l?.pureMusic) return { sincronizada: null, plana: null, instrumental: true, fuente: 'netease' };
    const crudo = String(l?.lrc?.lyric ?? '').trim();
    if (!crudo) continue;
    const lineas = parsearLrc(crudo).filter((x) => !REGEX_CREDITOS.test(x.texto));
    if (lineas.length >= 3) {
      return { sincronizada: lineas, plana: lineas.map((x) => x.texto).join('\n'), instrumental: false, fuente: 'netease' };
    }
    if (lineas.length === 0 && crudo.length >= 30) return { sincronizada: null, plana: crudo, instrumental: false, fuente: 'netease' };
  }
  return null;
}

/** lyrics.ovh: último recurso, letra sin sincronizar. null = no hay; lanza si falla la red. */
export async function buscarLyricsOvh({ artista, titulo }, { fetchFn, limiteMs = LIMITE_FUENTE_MS } = {}) {
  const f = fetchFn ?? (await fetchSinCors());
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(primerArtista(artista))}/${encodeURIComponent(limpiarTitulo(titulo))}`;
  const r = await fetchConLimite(f, url, {}, limiteMs);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`lyrics.ovh HTTP ${r.status}`);
  const plana = String((await r.json())?.lyrics ?? '').replace(/\r\n?/g, '\n').trim();
  return plana.length >= 30 ? { sincronizada: null, plana, instrumental: false, fuente: 'lyrics-ovh' } : null;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (t) =>
  String(t).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTIDADES[e.toLowerCase()];
  });

/** "27.395", "3:21.570", "1:02:03.5" o "12.5s" -> segundos (NaN si no es un tiempo). */
export function segundosTtml(t) {
  const partes = String(t ?? '').trim().replace(/s$/, '').split(':');
  if (partes.some((x) => x === '' || Number.isNaN(Number(x)))) return NaN;
  return partes.reduce((acc, x) => acc * 60 + Number(x), 0);
}

const atributo = (attrs, nombre) => new RegExp(`(?:^|\\s)(?:[\\w-]+:)?${nombre}="([^"]*)"`).exec(attrs)?.[1];

/**
 * TTML de Apple (el que sirve BetterLyrics) -> líneas [{t, texto, palabras?}]. Las sílabas sin
 * espacio entre ellas ("e" + "nough") se juntan en una palabra; los `<span>` anidados (voces de
 * fondo) cuentan como palabras sueltas. Sin `<span>` con tiempo, la línea queda sin palabras.
 */
export function parsearTtml(ttml) {
  const lineas = [];
  for (const m of String(ttml ?? '').matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const t = segundosTtml(atributo(m[1], 'begin'));
    if (Number.isNaN(t)) continue;
    const palabras = [];
    let actual = null;
    const cerrar = () => {
      if (actual) palabras.push(actual);
      actual = null;
    };
    for (const tok of m[2].matchAll(/<span\b([^>]*)>([^<]*)<\/span>|([^<]+)/g)) {
      if (tok[1] === undefined) {
        if (/\s/.test(tok[3])) cerrar();
        continue;
      }
      const texto = decodificar(tok[2]);
      const ini = segundosTtml(atributo(tok[1], 'begin'));
      const fin = segundosTtml(atributo(tok[1], 'end'));
      if (/^\s/.test(texto)) cerrar();
      if (texto.trim()) {
        if (!actual) actual = { t: Number.isNaN(ini) ? t : ini, fin: 0, texto: '' };
        actual.texto += texto.trim();
        actual.fin = Number.isNaN(fin) ? actual.t : fin;
      }
      if (/\s$/.test(texto)) cerrar();
    }
    cerrar();
    const texto = palabras.length ? palabras.map((w) => w.texto).join(' ') : decodificar(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (texto) lineas.push(palabras.length ? { t, texto, palabras } : { t, texto });
  }
  return lineas.sort((a, b) => a.t - b.t);
}

/** Duración «3:21.570» del cuerpo de un TTML (segundos) o 0. */
const duracionTtml = (ttml) => {
  const d = segundosTtml(/<body\b[^>]*\bdur="([^"]*)"/.exec(String(ttml ?? ''))?.[1]);
  return Number.isNaN(d) ? 0 : d;
};

/** Respuesta de LyricsPlus (/v2/lyrics/get, tiempos en ms) -> {sincronizada, plana}. */
export function convertirLyricsPlus(j) {
  const crudas = Array.isArray(j?.lyrics) ? j.lyrics.filter((l) => String(l?.text ?? '').trim()) : [];
  const lineas = crudas
    .filter((l) => l.time > 0)
    .map((l) => {
      const palabras = [];
      let actual = null;
      const cerrar = () => {
        if (actual) palabras.push(actual);
        actual = null;
      };
      for (const sil of l.syllabus ?? []) {
        if (sil.isBackground) continue;
        const tx = String(sil.text ?? '');
        if (/^\s/.test(tx)) cerrar();
        if (tx.trim()) {
          if (!actual) actual = { t: sil.time / 1000, fin: 0, texto: '' };
          actual.texto += tx.trim();
          actual.fin = (sil.time + (sil.duration ?? 0)) / 1000;
        }
        if (/\s$/.test(tx)) cerrar();
      }
      cerrar();
      const texto = palabras.length ? palabras.map((w) => w.texto).join(' ') : String(l.text).trim();
      return palabras.length ? { t: l.time / 1000, texto, palabras } : { t: l.time / 1000, texto };
    })
    .sort((a, b) => a.t - b.t);
  const plana = crudas.map((l) => String(l.text).trim()).join('\n');
  return { sincronizada: lineas.length >= 3 ? lineas : null, plana };
}

/**
 * LyricsPlus (lyricsplus.binimum.org, el servicio de BiniLyrics): público, sin clave y con CORS
 * abierto; devuelve letra palabra a palabra (origen Apple Music/QQ/Deezer). Se acepta solo si el
 * título y el artista que devuelve coinciden y, si da duración, difiere menos de 15 s.
 */
export async function buscarLyricsPlus({ artista, titulo, duracionS }, { fetchFn, limiteMs = 12000 } = {}) {
  const f = fetchFn ?? (await fetchSinCors());
  const p = new URLSearchParams({ title: limpiarTitulo(titulo), artist: primerArtista(artista) });
  if (duracionS > 0) p.set('duration', String(Math.round(duracionS)));
  const r = await fetchConLimite(f, `https://lyricsplus.binimum.org/v2/lyrics/get?${p}`, {}, limiteMs);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`LyricsPlus HTTP ${r.status}`);
  const j = JSON.parse(await r.text());
  const meta = j?.metadata ?? {};
  if (!coincide({ titulo, artista }, { trackName: meta.title, artistName: meta.artist })) return null;
  const d = segundosTtml(meta.totalDuration);
  if (duracionS > 0 && d > 0 && Math.abs(d - duracionS) > 15) return null;
  const { sincronizada, plana } = convertirLyricsPlus(j);
  if (!sincronizada && plana.length < 30) return null;
  return { sincronizada, plana, instrumental: false, fuente: 'lyricsplus' };
}

/**
 * BetterLyrics (lyrics-api.boidu.dev, la API de la extensión): TTML palabra a palabra de Apple
 * Music. Sin clave solo responde lo que ya tiene en caché (401 «API key required» = no lo tiene,
 * se cuenta como «sin letra»). No da título ni artista, así que se comprueba la duración (±15 s).
 */
export async function buscarBetterLyrics({ artista, titulo, duracionS }, { fetchFn, limiteMs = LIMITE_FUENTE_MS } = {}) {
  const f = fetchFn ?? (await fetchSinCors());
  const p = new URLSearchParams({ s: limpiarTitulo(titulo), a: primerArtista(artista) });
  if (duracionS > 0) p.set('d', String(Math.round(duracionS)));
  const r = await fetchConLimite(f, `https://lyrics-api.boidu.dev/getLyrics?${p}`, {}, limiteMs);
  if (r.status === 404 || r.status === 401) return null;
  if (!r.ok) throw new Error(`BetterLyrics HTTP ${r.status}`);
  const ttml = JSON.parse(await r.text())?.ttml;
  const dur = duracionTtml(ttml);
  if (duracionS > 0 && dur > 0 && Math.abs(dur - duracionS) > 15) return null;
  const lineas = parsearTtml(ttml);
  if (lineas.length < 3) return null;
  return { sincronizada: lineas, plana: lineas.map((x) => x.texto).join('\n'), instrumental: false, fuente: 'betterlyrics' };
}

/** LRCLIB: búsqueda exacta (/get) y, si no, la abierta (/search). null = no hay; las caídas marcan `estado.incompleto`. */
export async function buscarLrclib({ artista, titulo, album, duracionS }, { pedirFn = pedir, estado = {} } = {}) {
  const conFallo = () => {
    estado.incompleto = true;
    return null;
  };
  // Sin "(Remastered 2011)", "(feat. X)", " - Radio Edit"...: LRCLIB los guarda casi siempre sin ellos.
  const tituloLimpio = limpiarTitulo(titulo);
  const artistaConsulta = primerArtista(artista);
  // /get a veces da 503 (consulta externa de LRCLIB): se sigue con la búsqueda abierta.
  for (const nombre of tituloLimpio === titulo ? [titulo] : [titulo, tituloLimpio]) {
    const p = new URLSearchParams({ artist_name: artistaConsulta, track_name: nombre });
    if (album) p.set('album_name', album);
    if (duracionS > 0) p.set('duration', String(Math.round(duracionS)));
    const exacta = await pedirFn(`${BASE}/get?${p}`).catch(conFallo);
    if (
      exacta &&
      (exacta.syncedLyrics || exacta.plainLyrics || exacta.instrumental) &&
      coincide({ titulo, artista }, exacta)
    )
      return resultado(exacta);
  }

  const q = new URLSearchParams({ artist_name: artistaConsulta, track_name: tituloLimpio });
  // LRCLIB caído o limitando (429 sin CORS => «Failed to fetch»): se pasa a los respaldos.
  const lista = ((await pedirFn(`${BASE}/search?${q}`).catch(conFallo)) ?? []).filter((j) => coincide({ titulo, artista }, j));
  if (lista.length === 0) return null;
  const puntuar = (j) =>
    (j.syncedLyrics ? 0 : 1000) + (duracionS > 0 && j.duration ? Math.abs(j.duration - duracionS) : 500);
  const mejor = [...lista].sort((a, b) => puntuar(a) - puntuar(b))[0];
  // Más de 15 s de diferencia: probablemente otra versión; mejor nada que una letra desfasada.
  if (duracionS > 0 && mejor.duration && Math.abs(mejor.duration - duracionS) > 15) return null;
  return resultado(mejor);
}

/**
 * Busca solo en el proveedor `id` (hoja «Elegir proveedor de letras»). null = no la tiene;
 * lanza si falla la red.
 */
export async function buscarEnProveedor(id, cancion, deps = {}) {
  const {
    pedirFn,
    buscarNetEase: netease = buscarNetEase,
    buscarYoutube = buscarEnYouTubeMusic,
    buscarOvh = buscarLyricsOvh,
    buscarLyricsPlus: lyricsplus = buscarLyricsPlus,
    buscarBetterLyrics: betterlyrics = buscarBetterLyrics,
  } = deps;
  const fuentes = {
    lrclib: async (c) => {
      const estado = {};
      const r = await buscarLrclib(c, { pedirFn, estado });
      if (!r && estado.incompleto) throw new Error('LRCLIB no responde');
      return r;
    },
    lyricsplus,
    betterlyrics,
    netease,
    'youtube-music': buscarYoutube,
    'lyrics-ovh': buscarOvh,
  };
  if (!fuentes[id]) throw new Error(`proveedor desconocido: ${id}`);
  return (await fuentes[id](cancion)) ?? null;
}

/**
 * Cadena completa. `estado.incompleto` se activa si alguna fuente falló por red/HTTP (para no
 * cachear como «no encontrada» algo que solo estaba caído); `estado.sinLetra` reúne los
 * proveedores que respondieron sin letra.
 */
export async function buscar(
  { artista, titulo, album, duracionS },
  {
    pedirFn = pedir,
    buscarNetEase: netease = buscarNetEase,
    buscarYoutube = buscarEnYouTubeMusic,
    buscarOvh = buscarLyricsOvh,
    buscarLyricsPlus: lyricsplus = buscarLyricsPlus,
    buscarBetterLyrics: betterlyrics = buscarBetterLyrics,
    estado = {},
  } = {},
) {
  if (/\binstrumental\b/i.test(titulo)) return { sincronizada: null, plana: null, instrumental: true };
  const cancion = { titulo, artista, album, duracionS };
  estado.sinLetra ??= new Set();
  const lrclib = await buscarLrclib(cancion, { pedirFn, estado });
  if (lrclib) return lrclib;
  if (!estado.incompleto) estado.sinLetra.add('lrclib');
  // Orden de preferencia; cada respaldo cuenta como fallo (no «sin letra») si lanza.
  for (const [id, fuente] of [
    ['lyricsplus', lyricsplus],
    ['betterlyrics', betterlyrics],
    ['netease', netease],
    ['youtube-music', buscarYoutube],
    ['lyrics-ovh', buscarOvh],
  ]) {
    let fallo = false;
    const r = await Promise.resolve(fuente(cancion)).catch(() => {
      fallo = true;
      estado.incompleto = true;
      return null;
    });
    if (r) return r;
    if (!fallo) estado.sinLetra.add(id);
  }
  return null;
}

/** Índice de la línea que suena en `segundos` (-1 antes de la primera). */
export function lineaActual(lineas, segundos) {
  let lo = 0;
  let hi = lineas.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineas[mid].t <= segundos) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
