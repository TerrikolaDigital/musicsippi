// src/data/copia-movil.js
// Copia de seguridad de los datos del móvil (IndexedDB) en un archivo JSON,
// como Backup.kt de BitChord: para cambiar de móvil o volver atrás.
import { NOMBRE_DB, cerrarDB, obtenerTodos, guardarRegistro, vaciarStore } from './lib/db.js';

export const FORMATO = 'musicsippi-copia-movil';
export const VERSION = 1;
export const STORES = ['biblioteca', 'ejes', 'overrides', 'cacheYoutube', 'metadataLocal', 'historial', 'configuracion', 'archivosLocales'];
const CLAVE_COPIA_PREVIA = 'musicsippi.copiaPrevia';

export function serializarCopia(stores, ahora = new Date()) {
  return { formato: FORMATO, version: VERSION, fecha: ahora.toISOString(), stores };
}

export function validarCopia(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, motivo: 'El archivo no es una copia de Musicsippi.' };
  if (obj.formato !== FORMATO) return { ok: false, motivo: 'El archivo no es una copia de Musicsippi.' };
  if (obj.version !== VERSION) return { ok: false, motivo: `Copia de una versión distinta (${obj.version}).` };
  if (!obj.stores || typeof obj.stores !== 'object') return { ok: false, motivo: 'La copia está incompleta.' };
  for (const [nombre, registros] of Object.entries(obj.stores)) {
    if (!STORES.includes(nombre)) return { ok: false, motivo: `La copia trae datos desconocidos (${nombre}).` };
    if (!Array.isArray(registros)) return { ok: false, motivo: `La copia está dañada (${nombre}).` };
  }
  return { ok: true };
}

async function leerTodo() {
  const stores = {};
  for (const nombre of STORES) stores[nombre] = await obtenerTodos(nombre);
  return stores;
}

/** Lee todos los stores de IndexedDB y devuelve el JSON de la copia. */
export async function exportarCopia() {
  return JSON.stringify(serializarCopia(await leerTodo()));
}

/**
 * Valida el texto y, solo si es una copia buena, guarda antes lo actual en
 * localStorage (si cabe) y reemplaza los datos. Lanza Error con el motivo si
 * no es válida: en ese caso no se toca nada.
 */
export async function restaurarCopia(texto) {
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es una copia de Musicsippi.');
  }
  const v = validarCopia(obj);
  if (!v.ok) throw new Error(v.motivo);
  try {
    window.localStorage.setItem(CLAVE_COPIA_PREVIA, await exportarCopia());
  } catch {
    // Si la copia previa no cabe en localStorage se sigue: la restauración ya está validada.
  }
  for (const nombre of STORES) {
    await vaciarStore(nombre);
    for (const registro of obj.stores[nombre] ?? []) await guardarRegistro(nombre, registro);
  }
  return { canciones: (obj.stores.biblioteca ?? []).length };
}

/** Borra IndexedDB y localStorage: la app vuelve a sembrarse con la biblioteca del build. */
export async function borrarDatosMovil() {
  await cerrarDB();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(NOMBRE_DB);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  try {
    window.localStorage.clear();
  } catch {
    // sin acceso a localStorage: no hay nada que borrar
  }
}
