// src/data/traduccion-letra.js
// Traducción de la letra al español bajo cada línea (como BitChord). Usa el endpoint público
// de Google Translate (translate.googleapis.com, client=gtx): sin clave y con CORS abierto. Se
// traduce por bloques de varias líneas (no una petición por línea) y el resultado se guarda por
// canción en el mismo almacén clave/valor que las letras. Si Google no responde se usa MyMemory
// (gratis, sin clave). Si falla todo, obtenerTraduccion devuelve false para que la pantalla avise («No se pudo traducir»).
//
// OJO móvil: el HTTP nativo de Android sale con el user-agent «Dalvik/...», y Google responde 429
// a ese user-agent (y al «Mozilla/5.0» pelado); con uno de navegador responde 200. Por eso la
// petición lleva siempre un user-agent de Chrome móvil.

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MAX_CARACTERES_BLOQUE = 1200;
const LIMITE_MS = 8000;
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const TTL_MS = 30 * 24 * 3600 * 1000;
const CLAVE_PREFERENCIA = 'musicsippi:traducir-letra';
const memoria = new Map(); // clave -> Promise<resultado>

/** Preferencia «mostrar traducción» (localStorage; sin almacenamiento, desactivada). */
export function leerPreferenciaTraduccion() {
  try {
    return localStorage.getItem(CLAVE_PREFERENCIA) === '1';
  } catch {
    return false;
  }
}

export function guardarPreferenciaTraduccion(activa) {
  try {
    if (activa) localStorage.setItem(CLAVE_PREFERENCIA, '1');
    else localStorage.removeItem(CLAVE_PREFERENCIA);
  } catch {
    // sin almacenamiento: dura lo que dure la sesión
  }
}

/** Agrupa textos consecutivos en bloques de como mucho `max` caracteres (cada texto va entero en un bloque). */
export function agruparEnBloques(textos, max = MAX_CARACTERES_BLOQUE) {
  const bloques = [];
  let actual = [];
  let largo = 0;
  for (const t of textos) {
    if (actual.length && largo + t.length + 1 > max) {
      bloques.push(actual);
      actual = [];
      largo = 0;
    }
    actual.push(t);
    largo += t.length + 1;
  }
  if (actual.length) bloques.push(actual);
  return bloques;
}

// En la app se usa CapacitorHttp directo: pasar por `new Request(url, {headers})` (crearFetchNativo)
// descarta en silencio la cabecera User-Agent (nombre prohibido en el WebView) y sale el «Dalvik/...»
// de Android, con el que Google da 429. Aquí las cabeceras llegan tal cual.
async function fetchTraduccion() {
  try {
    const { Capacitor, CapacitorHttp } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      return async (url, init) => {
        const r = await CapacitorHttp.get({ url, headers: init?.headers ?? {}, responseType: 'text', connectTimeout: 8000, readTimeout: 8000 });
        return {
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          text: async () => (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)),
        };
      };
    }
  } catch {
    // sin Capacitor (Node, tests): fetch global
  }
  return fetch.bind(globalThis);
}

/**
 * Traduce un bloque de líneas. Devuelve {idioma, lineas} con una traducción por línea de entrada,
 * o null si la respuesta no cuadra (otro nº de líneas) o falla la red.
 */
export async function traducirBloque(lineas, { fetchFn, limiteMs = LIMITE_MS } = {}) {
  const f = fetchFn ?? (await fetchTraduccion());
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), limiteMs);
  try {
    const url = `${ENDPOINT}?${new URLSearchParams({ client: 'gtx', sl: 'auto', tl: 'es', dt: 't', q: lineas.join('\n') })}`;
    const r = await Promise.race([
      f(url, { signal: ctl.signal, headers: { 'User-Agent': USER_AGENT } }),
      new Promise((_, no) => ctl.signal.addEventListener('abort', () => no(new Error('tiempo agotado')))),
    ]);
    if (!r.ok) return null;
    const j = JSON.parse(await r.text());
    const traducido = (Array.isArray(j?.[0]) ? j[0] : []).map((s) => String(s?.[0] ?? '')).join('');
    const salida = traducido.replace(/\n+$/, '').split('\n').map((x) => x.trim());
    if (salida.length !== lineas.length) return null;
    return { idioma: typeof j?.[2] === 'string' ? j[2] : null, lineas: salida };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const ENDPOINT_RESPALDO = 'https://api.mymemory.translated.net/get';
const MAX_CARACTERES_RESPALDO = 450; // MyMemory admite 500 por petición

/**
 * Respaldo gratuito sin clave (MyMemory) cuando Google no responde. Mismo contrato que traducirBloque.
 * Idioma de origen autodetectado; si una línea es más larga que el máximo se rinde (null).
 */
export async function traducirBloqueRespaldo(lineas, { fetchFn, limiteMs = LIMITE_MS } = {}) {
  const f = fetchFn ?? (await fetchTraduccion());
  const salida = [];
  let idioma = null;
  for (const trozo of agruparEnBloques(lineas, MAX_CARACTERES_RESPALDO)) {
    if (trozo.join('\n').length > MAX_CARACTERES_RESPALDO) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), limiteMs);
    try {
      const url = `${ENDPOINT_RESPALDO}?${new URLSearchParams({ q: trozo.join('\n'), langpair: 'autodetect|es' })}`;
      const r = await Promise.race([
        f(url, { signal: ctl.signal, headers: { 'User-Agent': USER_AGENT } }),
        new Promise((_, no) => ctl.signal.addEventListener('abort', () => no(new Error('tiempo agotado')))),
      ]);
      if (!r.ok) return null;
      const j = JSON.parse(await r.text());
      if (Number(j?.responseStatus) !== 200 || j?.quotaFinished) return null;
      const lin = String(j?.responseData?.translatedText ?? '').trim().split('\n').map((x) => x.trim());
      if (lin.length !== trozo.length) return null;
      idioma ??= typeof j.responseData.detectedLanguage === 'string' ? j.responseData.detectedLanguage : null;
      salida.push(...lin);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return { idioma, lineas: salida };
}

/**
 * Traducciones alineadas con `textos` (una por posición; '' donde no hay). Las líneas vacías no se
 * mandan. Devuelve {lineas: null} si la letra ya está en español (lo detecta Google en el primer
 * bloque) y null si no se pudo traducir nada (red caída: no se cachea).
 * @param {string[]} textos
 * @returns {Promise<{lineas: string[]|null}|null>}
 */
export async function traducirLineas(textos, deps = {}) {
  const indices = textos.map((t, i) => [t, i]).filter(([t]) => /\p{L}/u.test(t));
  if (indices.length === 0) return { lineas: null };
  const salida = textos.map(() => '');
  let pos = 0;
  let alguna = false;
  let primero = true;
  for (const bloque of agruparEnBloques(indices.map(([t]) => t))) {
    const r = (await traducirBloque(bloque, deps)) ?? (await traducirBloqueRespaldo(bloque, deps));
    if (primero) {
      primero = false;
      if (r?.idioma === 'es') return { lineas: null };
    }
    if (r) {
      alguna = true;
      r.lineas.forEach((tr, k) => {
        const [orig, i] = indices[pos + k];
        // Si Google devuelve el mismo texto, no aporta nada: se deja vacío.
        salida[i] = tr.toLowerCase() === orig.trim().toLowerCase() ? '' : tr;
      });
    }
    pos += bloque.length;
  }
  return alguna ? { lineas: salida } : null;
}

/**
 * Traducción cacheada (memoria + almacén persistente de letras.js) de la letra de una canción.
 * @param {string} clave `artista|título` en minúsculas
 * @returns {Promise<string[]|null|false>} traducciones alineadas con `textos`; null si la letra ya está
 *   en español; false si no se pudo traducir (red / respuesta rara)
 */
export function obtenerTraduccion(clave, textos, { almacen = null, ahora = Date.now, traducirFn = traducirLineas } = {}) {
  const k = `traduccion:${clave}`;
  if (!memoria.has(k)) {
    const promesa = (async () => {
      const guardada = await almacen?.leer(k).catch(() => undefined);
      if (guardada && guardada.hasta > ahora() && guardada.n === textos.length) return guardada.lineas ?? null;
      const r = await traducirFn(textos);
      if (!r) {
        memoria.delete(k); // fallo de red: se reintentará la próxima vez
        return false;
      }
      Promise.resolve(almacen?.guardar(k, { lineas: r.lineas, n: textos.length, hasta: ahora() + TTL_MS })).catch(() => {});
      return r.lineas;
    })().catch(() => {
      memoria.delete(k);
      return false;
    });
    memoria.set(k, promesa);
  }
  return memoria.get(k);
}
