// Pegamento de la UI con la copia automática en Drive: nada de lo que se llama desde aquí lanza.
// Todas las mutaciones del estado pasan por la cola de copia-auto.js (mutarEstado / ejecutarCopiaAuto).
import { ejecutarCopiaAuto, depsReales, mutarEstado, activar, desactivar, NOMBRE_ARCHIVO } from '../data/copia-auto.js';
import { elegirDestinoCopia, liberarDestinoCopia } from '../data/nativo-movil.js';

export const TEXTO_COPIA_EN_MOVIL = 'Esta copia está en el móvil: si lo pierdes, la pierdes. Guárdala en Drive.';
export const TEXTO_ERROR_COPIA = 'No se pudo guardar la copia. Elige el destino otra vez.';

// `opts` solo se usa en los tests para inyectar deps y nativo.
const resolver = (opts = {}) => ({
  deps: opts.deps ?? depsReales(),
  nativo: opts.nativo ?? { elegirDestinoCopia, liberarDestinoCopia },
});

export const leerEstadoCopia = (opts) => resolver(opts).deps.leerEstado();

/** Ejecuta la copia si toca y devuelve el estado ya releído (o null si no se pudo leer). */
export async function copiarSinFallar(opts) {
  const { deps } = resolver(opts);
  try {
    await ejecutarCopiaAuto(deps, Date.now());
  } catch {
    // un rechazo no debe llegar a la UI: el estado guardado ya refleja el fallo
  }
  return deps.leerEstado().catch(() => null);
}

/** Elige destino (libera el anterior), lo activa, y copia al momento. null si se cancela o falla. */
export async function elegirDestinoYCopiar(opts) {
  const { deps, nativo } = resolver(opts);
  let uri;
  try {
    uri = await nativo.elegirDestinoCopia(NOMBRE_ARCHIVO);
  } catch {
    return null;
  }
  if (!uri) return null;
  // Espera a la copia en curso y relee el estado dentro de la cola: nada pisa la activación.
  await mutarEstado(deps, async (antes) => {
    if (antes.uri && antes.uri !== uri) await nativo.liberarDestinoCopia(antes.uri).catch(() => {});
    return activar(antes, uri);
  });
  return copiarSinFallar(opts);
}

export async function desactivarCopia(opts) {
  const { deps, nativo } = resolver(opts);
  return mutarEstado(deps, async (antes) => {
    if (antes.uri) await nativo.liberarDestinoCopia(antes.uri).catch(() => {});
    return desactivar(antes);
  });
}
