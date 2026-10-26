/**
 * Archivos de audio locales entre el PC y el móvil (LAN de casa): índice de lo que el PC tiene,
 * manifiesto sin rutas y autorización de cada transferencia. La lógica es pura o recibe sus
 * dependencias (disco, reloj) para probarla sin red; vite.config.js solo la expone por HTTP.
 * Spec: docs/superpowers/specs/2026-10-15-locales-y-sync-auto-design.md
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync,
  renameSync, rmSync, statSync, statfsSync, appendFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { escribirAtomico } from './escribir-atomico.mjs';

export const LIMITE_ARCHIVO = 500 * 1024 * 1024; // 500 MiB por archivo
export const LIMITE_SYNC_AUTOMATICA = 2 * 1024 * 1024 * 1024; // 2 GiB por sincronización automática
export const TAMANO_BLOQUE_MAX = 4 * 1024 * 1024;
// La clave NUNCA viaja: cada petición lleva una firma HMAC con un nonce de un solo uso emitido por el PC.
export const CABECERA_NONCE = 'x-ms-nonce';
export const CABECERA_MARCA = 'x-ms-ts';
export const CABECERA_FIRMA = 'x-ms-firma';
const VENTANA_MARCA_MS = 2 * 60 * 1000;
const VIDA_NONCE_MS = 60 * 1000;
const MAX_NONCES = 256;
const VIDA_TOKEN_MS = 10 * 60 * 1000;
const MARGEN_DISCO = 256 * 1024 * 1024;
const REGEX_SHA256 = /^[0-9a-f]{64}$/;
const REGEX_MIME = /^audio\/[a-z0-9.+-]{1,40}$/;
const EXTENSION_POR_MIME = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
  'audio/flac': 'flac', 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
};
const MIME_POR_EXTENSION = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/opus', wav: 'audio/wav' };

/** ¿Dirección IPv4 de la LAN privada (o este mismo equipo)? Acepta la forma ::ffff:a.b.c.d. */
export function esHostPrivado(direccion) {
  const ip = String(direccion ?? '').replace(/^::ffff:/i, '');
  if (ip === '::1' || ip === 'localhost') return true;
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

const err = (status, error, extra = {}) => ({ ok: false, status, cuerpo: { error, ...extra } });

function clavesIguales(recibida, esperada) {
  const a = Buffer.from(String(recibida ?? ''));
  const b = Buffer.from(String(esperada ?? ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * Autoriza una transferencia ANTES de tocar el sistema de archivos: clave de emparejamiento,
 * origen en la LAN privada, hash, MIME y tamaño. Devuelve {ok:true} o {ok:false, status, cuerpo}.
 */
export function validarTransferencia({ clave, claveEsperada, host, trackId, sha256, tamano, mime, direccion }) {
  if (!clavesIguales(clave, claveEsperada)) return err(401, 'clave_invalida');
  if (!esHostPrivado(host)) return err(403, 'red_no_permitida');
  if (typeof trackId !== 'string' || !trackId || trackId.length > 300) return err(400, 'track_invalido');
  if (!REGEX_SHA256.test(String(sha256 ?? ''))) return err(400, 'sha256_invalido');
  if (!Number.isInteger(tamano) || tamano <= 0) return err(400, 'tamano_invalido');
  if (tamano > LIMITE_ARCHIVO) return err(413, 'archivo_demasiado_grande', { limite: LIMITE_ARCHIVO });
  if (direccion === 'subida' && !REGEX_MIME.test(String(mime ?? ''))) return err(415, 'mime_no_permitido');
  return { ok: true };
}

/** Manifiesto para el móvil: qué tiene el PC, sin rutas. Solo entradas con hash ya calculado. */
export function crearManifiestoArchivos(indicePC) {
  return Object.entries(indicePC ?? {})
    .filter(([, f]) => REGEX_SHA256.test(f?.sha256 ?? ''))
    .map(([trackId, f]) => ({ trackId, sha256: f.sha256, tamano: f.tamano, mime: f.mime, dispositivo: 'pc' }));
}

function sha256DeArchivo(ruta) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(ruta).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

const hmacHex = (clave, texto) => createHmac('sha256', clave).update(texto).digest('hex');
export const sha256Hex = (datos) => createHash('sha256').update(datos).digest('hex');

/** Texto que firma el móvil en cada petición. `ruta` es la ruta de la API con su query, sin /api. */
export const textoAFirmar = ({ metodo, ruta, cuerpo, nonce, ts }) => `${metodo}|${ruta}|${sha256Hex(cuerpo ?? '')}|${nonce}|${ts}`;
export const firmarPeticion = (clave, datos) => hmacHex(clave, textoAFirmar(datos));

/** Prueba del PC en el saludo: liga el reto del móvil, su propio nonce y la dirección real a la que se conectó el móvil. */
export const pruebaDelPC = (clave, { reto, nonce, direccionPC }) => hmacHex(clave, `pc|${reto}|${nonce}|${direccionPC}`);

/**
 * Servicio con estado: índice persistente (`archivos-locales.json`), clave de emparejamiento
 * (`emparejamiento.json`), tokens efímeros en memoria y carpeta `archivos-locales/` para lo recibido.
 */
export function crearServicioArchivos({ dataDir, ahora = Date.now, espacioLibre, aleatorio = randomBytes }) {
  const rutaIndice = join(dataDir, 'archivos-locales.json');
  const rutaClave = join(dataDir, 'emparejamiento.json');
  const carpeta = join(dataDir, 'archivos-locales');
  const parciales = join(carpeta, '.parciales');
  const tokens = new Map();
  const bytesAutomaticos = new Map(); // host -> {desde, total}
  const libre = espacioLibre ?? ((dir) => { const s = statfsSync(dir); return Number(s.bavail) * Number(s.bsize); });

  const leerIndice = () => (existsSync(rutaIndice) ? JSON.parse(readFileSync(rutaIndice, 'utf8')) : { version: 1, pc: {} });
  const guardarIndice = (i) => escribirAtomico(rutaIndice, i);

  function claveEmparejamiento() {
    if (existsSync(rutaClave)) {
      const c = JSON.parse(readFileSync(rutaClave, 'utf8')).clave;
      if (typeof c === 'string' && c.length >= 32) return c;
    }
    const clave = aleatorio(24).toString('hex');
    escribirAtomico(rutaClave, { clave });
    return clave;
  }

  /** Anota el archivo que el PC tiene para una canción (el hash se calcula luego en segundo plano). */
  function registrarArchivoPC(trackId, ruta, sha256 = null) {
    const st = statSync(ruta);
    const ext = extname(ruta).slice(1).toLowerCase();
    const indice = leerIndice();
    const previo = indice.pc[trackId];
    const mismo = previo && previo.ruta === ruta && previo.tamano === st.size && previo.mtimeMs === st.mtimeMs;
    indice.pc[trackId] = {
      ruta, tamano: st.size, mtimeMs: st.mtimeMs, mime: MIME_POR_EXTENSION[ext] ?? 'audio/mpeg',
      sha256: sha256 ?? (mismo ? previo.sha256 : null),
    };
    guardarIndice(indice);
  }

  let hasheando = null;
  /** Calcula, de uno en uno, los hashes que faltan (un mp3 grande tarda: nunca dentro de una petición). */
  function completarHashes() {
    if (hasheando) return hasheando;
    hasheando = (async () => {
      try {
        for (const [trackId, f] of Object.entries(leerIndice().pc)) {
          if (f.sha256 || !existsSync(f.ruta)) continue;
          const sha256 = await sha256DeArchivo(f.ruta);
          const indice = leerIndice();
          if (indice.pc[trackId]?.ruta === f.ruta) { indice.pc[trackId].sha256 = sha256; guardarIndice(indice); }
        }
      } finally {
        hasheando = null;
      }
    })();
    return hasheando;
  }

  const nonces = new Map(); // nonce -> {host, expira}

  /** Nonce de un solo uso para firmar la próxima petición de `host`. */
  function emitirNonce(host) {
    const t = ahora();
    for (const [n, v] of nonces) if (v.expira < t) nonces.delete(n);
    if (nonces.size >= MAX_NONCES) nonces.delete(nonces.keys().next().value);
    const nonce = aleatorio(16).toString('hex');
    nonces.set(nonce, { host, expira: t + VIDA_NONCE_MS });
    return nonce;
  }

  /**
   * Comprueba la firma de una petición: nonce emitido a ese host y aún sin usar (se consume aunque la
   * firma falle), marca de tiempo reciente y HMAC correcto, comparado en tiempo constante.
   * `auth` = {metodo, ruta, cuerpo (Buffer o texto crudo), nonce, ts, firma}.
   */
  function autenticar(auth, host) {
    if (!esHostPrivado(host)) return err(403, 'red_no_permitida');
    const n = nonces.get(auth?.nonce);
    nonces.delete(auth?.nonce);
    if (!n || n.expira < ahora() || n.host !== host) return err(401, 'nonce_invalido');
    if (!(Math.abs(ahora() - Number(auth.ts)) <= VENTANA_MARCA_MS)) return err(401, 'marca_de_tiempo_invalida');
    if (!clavesIguales(auth.firma, firmarPeticion(claveEmparejamiento(), auth))) return err(401, 'firma_invalida');
    return { ok: true };
  }

  function manifiesto({ auth, host }) {
    const a = autenticar(auth, host);
    if (!a.ok) return a;
    completarHashes().catch(() => {});
    return { ok: true, status: 200, cuerpo: { archivos: crearManifiestoArchivos(leerIndice().pc) } };
  }

  /**
   * Saludo con prueba mutua. El PC no firma el reto del móvil sin añadir su propio nonce y la
   * dirección con la que escucha de verdad (`direccionPC`, tomada del socket, nunca de la petición).
   */
  function hola({ reto, host, direccionPC }) {
    if (!esHostPrivado(host)) return err(403, 'red_no_permitida');
    if (!/^[0-9a-f]{32,128}$/.test(String(reto ?? ''))) return err(400, 'reto_invalido');
    const nonce = aleatorio(16).toString('hex');
    const prueba = pruebaDelPC(claveEmparejamiento(), { reto, nonce, direccionPC });
    return { ok: true, status: 200, cuerpo: { app: 'musicsippi', nonce, direccionPC, prueba } };
  }

  function sesion(token, host) {
    const s = tokens.get(token);
    if (!s || s.expira < ahora()) { tokens.delete(token); return err(401, 'token_invalido'); }
    if (s.host !== host) return err(403, 'token_de_otro_equipo');
    return { ok: true, s };
  }

  function iniciar({ auth, host, cuerpo }) {
    const a = autenticar(auth, host);
    if (!a.ok) return a;
    const { trackId, sha256, tamano, mime, direccion, automatica } = cuerpo ?? {};
    if (direccion !== 'subida' && direccion !== 'descarga') return err(400, 'direccion_invalida');
    // La clave ya se probó con la firma: aquí solo se validan host, hash, MIME y tamaño.
    const v = validarTransferencia({ clave: claveEmparejamiento(), claveEsperada: claveEmparejamiento(), host, trackId, sha256, tamano, mime: mime ?? 'audio/mpeg', direccion });
    if (!v.ok) return v;
    if (automatica) {
      const e = bytesAutomaticos.get(host);
      const vigente = e && ahora() - e.desde < 3600_000;
      const total = vigente ? e.total : 0;
      if (total + tamano > LIMITE_SYNC_AUTOMATICA) return err(429, 'limite_automatico', { limite: LIMITE_SYNC_AUTOMATICA });
      bytesAutomaticos.set(host, { desde: vigente ? e.desde : ahora(), total: total + tamano });
    }
    let reanudableDesde = 0;
    let destino = null;
    if (direccion === 'descarga') {
      const f = leerIndice().pc[trackId];
      if (!f || f.sha256 !== sha256 || f.tamano !== tamano || !existsSync(f.ruta)) return err(404, 'no_disponible');
      destino = f.ruta;
    } else {
      mkdirSync(parciales, { recursive: true });
      if (libre(carpeta) < tamano + MARGEN_DISCO) return err(507, 'sin_espacio');
      const parcial = join(parciales, `${sha256}.part`);
      if (existsSync(parcial)) reanudableDesde = Math.min(statSync(parcial).size, tamano);
      destino = parcial;
    }
    const token = aleatorio(24).toString('hex');
    tokens.set(token, { trackId, sha256, tamano, mime, direccion, host, destino, expira: ahora() + VIDA_TOKEN_MS });
    return { ok: true, status: 200, cuerpo: { token, reanudableDesde, tamano } };
  }

  /** Recibe un bloque del móvil. `rango` = {inicio, fin} con fin exclusivo, como Content-Range. */
  function recibirBloque({ auth, host, token, rango, datos }) {
    const a = autenticar(auth, host);
    if (!a.ok) return a;
    const r = sesion(token, host);
    if (!r.ok) return r;
    const { s } = r;
    if (s.direccion !== 'subida') return err(400, 'direccion_invalida');
    if (!Buffer.isBuffer(datos) || datos.length === 0 || datos.length > TAMANO_BLOQUE_MAX) return err(413, 'bloque_invalido');
    const actual = existsSync(s.destino) ? statSync(s.destino).size : 0;
    if (!rango || rango.inicio !== actual || rango.fin !== actual + datos.length || rango.fin > s.tamano) {
      return err(416, 'rango_fuera_de_lugar', { reanudableDesde: actual });
    }
    appendFileSync(s.destino, datos);
    return { ok: true, status: 200, cuerpo: { reanudableDesde: actual + datos.length } };
  }

  /** Entrega un trozo del archivo del PC. */
  function leerBloque({ auth, host, token, inicio, fin }) {
    const a = autenticar(auth, host);
    if (!a.ok) return a;
    const r = sesion(token, host);
    if (!r.ok) return r;
    const { s } = r;
    if (s.direccion !== 'descarga') return err(400, 'direccion_invalida');
    if (!Number.isInteger(inicio) || !Number.isInteger(fin) || inicio < 0 || fin <= inicio || fin > s.tamano || fin - inicio > TAMANO_BLOQUE_MAX) {
      return err(416, 'rango_invalido');
    }
    const buf = Buffer.alloc(fin - inicio);
    const fd = openSync(s.destino, 'r');
    try { readSync(fd, buf, 0, buf.length, inicio); } finally { closeSync(fd); }
    return { ok: true, status: 206, cuerpo: { inicio, fin, total: s.tamano, base64: buf.toString('base64') } };
  }

  /** Cierra la sesión. En una subida valida el SHA-256 y promueve el temporal con un rename atómico. */
  async function finalizar({ auth, host, token }) {
    const a = autenticar(auth, host);
    if (!a.ok) return a;
    const r = sesion(token, host);
    if (!r.ok) return r;
    const { s } = r;
    tokens.delete(token);
    if (s.direccion === 'descarga') return { ok: true, status: 200, cuerpo: { ok: true } };
    const tamanoActual = existsSync(s.destino) ? statSync(s.destino).size : 0;
    if (tamanoActual !== s.tamano) return err(409, 'incompleto', { reanudableDesde: tamanoActual });
    if ((await sha256DeArchivo(s.destino)) !== s.sha256) {
      rmSync(s.destino, { force: true });
      return err(409, 'checksum', { reanudableDesde: 0 });
    }
    mkdirSync(carpeta, { recursive: true });
    const final = join(carpeta, `${s.sha256}.${EXTENSION_POR_MIME[s.mime] ?? 'mp3'}`);
    renameSync(s.destino, final);
    registrarArchivoPC(s.trackId, final, s.sha256);
    return { ok: true, status: 200, cuerpo: { ok: true } };
  }

  return { claveEmparejamiento, emitirNonce, registrarArchivoPC, completarHashes, manifiesto, hola, iniciar, recibirBloque, leerBloque, finalizar, indice: () => leerIndice().pc };
}
