// src/data/lib/db.js
// Una base IndexedDB para todo local-store. Un store por tipo de dato real
// (los de STORES_DB, cada uno con su keyPath) + 1 store genérico "configuracion" (clave/valor) para los
// datos que hoy son un blob único en un JSON (favoritos, ultimosModos,
// onboardingVisto, la clave de YouTube Data API) — no se justifica un store
// aparte para cada uno de esos, son valores únicos, no colecciones.
export const NOMBRE_DB = 'musicsippi-local';
const VERSION_DB = 4;

// [nombre, opciones]. v2 (organizador del móvil): `generos` (evidencia de
// género por canción) y `vectores` (embeddings cacheados por texto). Al subir
// de versión solo se crean los que faltan: crearlos todos lanzaría
// ConstraintError en una base que ya tiene los de la v1. v3: `seguidas`
// (playlists importadas por enlace que se releen al abrir la app).
export const STORES_DB = [
  ['biblioteca', { keyPath: 'id' }],
  ['ejes', { keyPath: 'id' }],
  ['overrides', { keyPath: 'trackId' }],
  ['cacheYoutube', { keyPath: 'trackId' }],
  ['metadataLocal', { keyPath: 'trackId' }],
  ['historial', { keyPath: 'id', autoIncrement: true }],
  ['configuracion', { keyPath: 'clave' }],
  ['generos', { keyPath: 'trackId' }],
  ['vectores', { keyPath: 'trackId' }],
  ['seguidas', { keyPath: 'clave' }],
  ['archivosLocales', { keyPath: 'id' }],
];

export function crearStoresQueFaltan(db) {
  for (const [nombre, opciones] of STORES_DB) {
    if (!db.objectStoreNames.contains(nombre)) db.createObjectStore(nombre, opciones);
  }
}

let dbPromise = null;

function abrirDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE_DB, VERSION_DB);
    req.onupgradeneeded = () => crearStoresQueFaltan(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function pedido(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function conStore(nombreStore, modo, fn) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(nombreStore, modo);
    const store = tx.objectStore(nombreStore);
    const resultado = fn(store);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve(resultado);
  });
}

export function obtenerTodos(nombreStore) {
  return conStore(nombreStore, 'readonly', (store) => pedido(store.getAll()));
}

export function obtenerPorClave(nombreStore, clave) {
  return conStore(nombreStore, 'readonly', (store) => pedido(store.get(clave)));
}

export function guardarRegistro(nombreStore, valor) {
  return conStore(nombreStore, 'readwrite', (store) => pedido(store.put(valor)));
}

/** Varios registros en una sola transacción (importar cientos de canciones). */
export function guardarVarios(nombreStore, valores) {
  return conStore(nombreStore, 'readwrite', (store) => {
    for (const v of valores) store.put(v);
  });
}

export function borrarVarios(nombreStore, claves) {
  return conStore(nombreStore, 'readwrite', (store) => {
    for (const c of claves) store.delete(c);
  });
}

export function agregarRegistro(nombreStore, valor) {
  return conStore(nombreStore, 'readwrite', (store) => pedido(store.add(valor)));
}

export function vaciarStore(nombreStore) {
  return conStore(nombreStore, 'readwrite', (store) => pedido(store.clear()));
}

/** Cierra la conexión abierta (hace falta antes de borrar la base entera). */
export async function cerrarDB() {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  dbPromise = null;
  db?.close();
}

export function borrarRegistro(nombreStore, clave) {
  return conStore(nombreStore, 'readwrite', (store) => pedido(store.delete(clave)));
}

export async function obtenerValorConfig(clave, porDefecto) {
  const r = await obtenerPorClave('configuracion', clave);
  return r ? r.valor : porDefecto;
}

export function guardarValorConfig(clave, valor) {
  return guardarRegistro('configuracion', { clave, valor });
}
