// src/data/copia-movil.js
// Copia de seguridad de los datos del móvil (IndexedDB) en un archivo JSON,
// como Backup.kt de BitChord: para cambiar de móvil o volver atrás.
import { NOMBRE_DB, cerrarDB, obtenerTodos, guardarRegistro, vaciarStore } from './lib/db.js';

export const FORMATO = 'musicsippi-copia-movil';
export const VERSION = 1;
export const STORES = ['biblioteca', 'ejes', 'overrides', 'cacheYoutube', 'metadataLocal', 'historial', 'configuracion', 'archivosLocales'];
// Claves de `configuracion` que nunca viajan en la copia ni se restauran desde ella.
export const CLAVES_SENSIBLES = ['youtubeApiKey', 'claveEmparejamientoPC', 'direccionPC'];
// Claves de `configuracion` propias de este dispositivo: tampoco viajan ni se restauran (copiaAuto lleva la URI del destino).
export const CLAVES_LOCALES = [...CLAVES_SENSIBLES, 'copiaAuto'];
export const MAX_TEXTO_COPIA = 50 * 1024 * 1024;
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

/** Devuelve una copia de los stores sin los registros locales del dispositivo de `configuracion`. */
export function limpiarSensibles(stores) {
  return {
    ...stores,
    configuracion: (stores.configuracion ?? []).filter((r) => !CLAVES_LOCALES.includes(r?.clave)),
  };
}

/** Registros de configuración al restaurar: los del archivo sin claves locales, más las locales actuales. */
export function combinarConfiguracion(actual, entrante) {
  return [
    ...(entrante ?? []).filter((r) => !CLAVES_LOCALES.includes(r?.clave)),
    ...(actual ?? []).filter((r) => CLAVES_LOCALES.includes(r?.clave)),
  ];
}

/** Contenido que se hashea para detectar cambios: solo los stores, sin fecha ni claves locales. */
export function contenidoParaHash(stores) {
  return JSON.stringify(limpiarSensibles(stores));
}

async function leerTodo() {
  const stores = {};
  for (const nombre of STORES) stores[nombre] = await obtenerTodos(nombre);
  return stores;
}

/** Lee todos los stores de IndexedDB y devuelve el JSON de la copia. */
export async function exportarCopia() {
  return JSON.stringify(serializarCopia(limpiarSensibles(await leerTodo())));
}

/**
 * Valida el texto y, solo si es una copia buena, guarda antes lo actual en
 * localStorage (si cabe) y reemplaza los datos. Lanza Error con el motivo si
 * no es válida: en ese caso no se toca nada.
 */
export async function restaurarCopia(texto) {
  // Tope en bytes UTF-8: solo se mide con Blob si los caracteres podrían pasarse (hasta 3 bytes por carácter).
  if (typeof texto === 'string' && (texto.length > MAX_TEXTO_COPIA
    || (texto.length * 3 > MAX_TEXTO_COPIA && new Blob([texto]).size > MAX_TEXTO_COPIA))) {
    throw new Error('La copia es demasiado grande.');
  }
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
  const sensiblesActuales = await obtenerTodos('configuracion');
  for (const nombre of STORES) {
    const registros = nombre === 'configuracion'
      ? combinarConfiguracion(sensiblesActuales, obj.stores[nombre])
      : obj.stores[nombre] ?? [];
    await vaciarStore(nombre);
    for (const registro of registros) await guardarRegistro(nombre, registro);
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
