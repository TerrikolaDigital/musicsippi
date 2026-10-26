import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const CLAVES_REQUERIDAS = ['version', 'youtube', 'deezer', 'musicbrainz', 'vocabulario', 'transversales', 'umbrales'];

export function validarFuentes(objeto) {
  const errores = [];
  if (typeof objeto !== 'object' || objeto === null) {
    return { valido: false, errores: ['no es un objeto'] };
  }
  for (const clave of CLAVES_REQUERIDAS) {
    if (!(clave in objeto)) errores.push(`falta la clave "${clave}"`);
  }
  if (typeof objeto.version !== 'number') errores.push('"version" debe ser numerico');
  if (objeto.umbrales && (typeof objeto.umbrales.masaMinima !== 'number' || typeof objeto.umbrales.masaMinimaPorcentaje !== 'number')) {
    errores.push('"umbrales" incompleto');
  }
  return { valido: errores.length === 0, errores };
}

function rutaFuentes(dataDir) { return join(dataDir, 'fuentes.json'); }

export function cargarFuentes(dataDir) {
  const ruta = rutaFuentes(dataDir);
  if (!existsSync(ruta)) return null;
  let objeto;
  try {
    objeto = JSON.parse(readFileSync(ruta, 'utf8'));
  } catch (e) {
    console.warn(`[fuentes] fuentes.json ilegible (${e.message}); se ignora`);
    return null;
  }
  const { valido } = validarFuentes(objeto);
  return valido ? objeto : null;
}

/** Aplica `fuentesNuevas` solo si son validas y su version es mayor a
 *  la actual. Guarda una copia de la version anterior para poder
 *  revertir. Nunca ejecuta ni interpreta nada de adentro de este
 *  archivo — es dato puro (spec §4.7). */
export function guardarSiValido(dataDir, fuentesNuevas) {
  const { valido, errores } = validarFuentes(fuentesNuevas);
  if (!valido) return { aplicado: false, errores };

  const ruta = rutaFuentes(dataDir);
  const actuales = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null;
  if (actuales && fuentesNuevas.version <= actuales.version) {
    return { aplicado: false, errores: [`version ${fuentesNuevas.version} no es mayor a la actual ${actuales.version}`] };
  }

  if (actuales) copyFileSync(ruta, `${ruta}.bak`);
  // Atómico (escribir a un .tmp y renombrar) por el mismo motivo que
  // escribirAtomico() en vite.config.js: fuentes.json se lee en caliente
  // durante /api/descubrir-modos — un archivo a medio escribir ahí (p. ej. si
  // se corta la actualización automática a mitad de camino) dejaría el
  // descubrimiento de modos leyendo JSON corrupto, no solo esta llamada.
  const tmp = `${ruta}.tmp`;
  writeFileSync(tmp, JSON.stringify(fuentesNuevas, null, 2));
  renameSync(tmp, ruta);
  return { aplicado: true, version: fuentesNuevas.version };
}

export async function verificarActualizacion(dataDir, urlRemota) {
  const r = await fetch(urlRemota);
  if (!r.ok) return { aplicado: false, errores: [`HTTP ${r.status}`] };
  const remoto = await r.json();
  return guardarSiValido(dataDir, remoto);
}
