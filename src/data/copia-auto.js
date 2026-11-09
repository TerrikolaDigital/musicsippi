// Lógica de la copia automática en un archivo elegido por el usuario (p. ej. en Drive).
// Funciones puras + orquestación con dependencias inyectadas; sin imports de IndexedDB/nativo
// en tiempo de carga para poder probarlo con node.

export const DIAS_OFRECER = 30;
export const CANCIONES_OFRECER = 300;
export const DIAS_POSPONER = 14;
export const MAX_POSPOSICIONES = 3;
export const INTERVALO_MS = 24 * 3600 * 1000;
export const LATIDO_MS = 7 * 24 * 3600 * 1000;
export const NOMBRE_ARCHIVO = 'Musicsippi-copia.json';

const DIA_MS = 24 * 3600 * 1000;

/** true si el destino (URI SAF) está en el almacenamiento del móvil y no en la nube. */
export function destinoEnMovil(uri) {
  if (typeof uri !== 'string') return false;
  const m = /^content:\/\/([^/?#]+)/i.exec(uri);
  if (!m) return false;
  const autoridad = m[1].toLowerCase();
  return autoridad.startsWith('com.android.providers.') || autoridad.startsWith('com.android.externalstorage');
}

export function debeOfrecer(estado, { ahora, canciones }) {
  if (estado.uri) return false;
  if (estado.posposiciones >= MAX_POSPOSICIONES) return false;
  if (estado.ultimaPosposicion != null && ahora - estado.ultimaPosposicion < DIAS_POSPONER * DIA_MS) return false;
  return canciones >= CANCIONES_OFRECER || ahora - estado.primerUso >= DIAS_OFRECER * DIA_MS;
}

export function debeCopiar(estado, { ahora }) {
  if (!estado.uri || estado.error) return false;
  return estado.ultimaCopia == null || ahora - estado.ultimaCopia >= INTERVALO_MS;
}

export async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Cola única: toda mutación del estado `copiaAuto` (copiar, activar, desactivar, posponer) pasa por
// aquí, una detrás de otra, y relee el estado dentro de la sección crítica. Evita pérdidas de actualización.
let cola = Promise.resolve();
export function enCola(fn) {
  const p = cola.then(fn);
  cola = p.catch(() => {});
  return p;
}

/** Lee el estado, le aplica `cambiar` y lo guarda, todo dentro de la cola. Devuelve el estado guardado. */
export function mutarEstado(deps, cambiar) {
  return enCola(async () => {
    const nuevo = await cambiar(await deps.leerEstado());
    await deps.guardarEstado(nuevo);
    return nuevo;
  });
}

// deps = { leerEstado, guardarEstado, exportar, escribir(uri, texto) -> {bytes, sha256}, huella?(texto) }
// `huella` devuelve lo que se hashea para detectar cambios (por defecto, el propio texto).
export function ejecutarCopiaAuto(deps, ahora) {
  return enCola(() => copiar(deps, ahora));
}

async function copiar(deps, ahora) {
  const estado = await deps.leerEstado();
  if (!debeCopiar(estado, { ahora })) return 'omitida';
  let hash;
  let escribirYa;
  try {
    const texto = await deps.exportar();
    hash = await sha256Hex(deps.huella ? await deps.huella(texto) : texto);
    escribirYa = hash !== estado.hash || estado.ultimaEscritura == null || ahora - estado.ultimaEscritura >= LATIDO_MS;
    if (escribirYa) {
      const r = await deps.escribir(estado.uri, texto);
      if (r.sha256 !== await sha256Hex(texto) || r.bytes !== new TextEncoder().encode(texto).length) throw new Error('verificacion');
    }
  } catch (e) {
    const fallos = estado.fallos + 1;
    const duro = e?.message === 'sin-permiso' || e?.message === 'no-encontrado';
    const error = duro ? e.message : fallos >= 2 ? 'escritura' : estado.error;
    await deps.guardarEstado({ ...estado, fallos, error });
    return 'fallo';
  }
  if (!escribirYa) {
    await deps.guardarEstado({ ...estado, ultimaCopia: ahora });
    return 'sin-cambios';
  }
  await deps.guardarEstado({ ...estado, fallos: 0, error: null, hash, ultimaCopia: ahora, ultimaEscritura: ahora });
  return 'copiada';
}

export function iniciarEstado(estado, ahora) {
  return { ...estado, primerUso: estado.primerUso ?? ahora };
}

export function posponer(estado, ahora) {
  return { ...estado, posposiciones: (estado.posposiciones || 0) + 1, ultimaPosposicion: ahora };
}

export function activar(estado, uri) {
  return { ...estado, uri, error: null, fallos: 0, hash: null, ultimaCopia: null, ultimaEscritura: null };
}

export function desactivar(estado) {
  return { ...estado, uri: null, error: null, fallos: 0, hash: null, ultimaCopia: null, ultimaEscritura: null };
}

const ESTADO_VACIO = { primerUso: null, uri: null, ultimaCopia: null, ultimaEscritura: null, hash: null, fallos: 0, error: null, posposiciones: 0, ultimaPosposicion: null };

// Dependencias reales (IndexedDB + nativo) para la UI. Imports dinámicos: no se cargan en node.
export function depsReales() {
  return {
    leerEstado: async () => {
      const { obtenerValorConfig } = await import('./lib/db.js');
      return { ...ESTADO_VACIO, ...(await obtenerValorConfig('copiaAuto', null)) };
    },
    guardarEstado: async (e) => {
      const { guardarValorConfig } = await import('./lib/db.js');
      await guardarValorConfig('copiaAuto', e);
    },
    exportar: async () => (await import('./copia-movil.js')).exportarCopia(),
    huella: async (texto) => (await import('./copia-movil.js')).contenidoParaHash(JSON.parse(texto).stores),
    escribir: async (uri, texto) => (await import('./nativo-movil.js')).escribirEnDestino(uri, texto),
  };
}
