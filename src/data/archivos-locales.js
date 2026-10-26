// Ubicaciones físicas de canciones: la identidad y sus metadatos musicales
// continúan en biblioteca; aquí nunca se almacenan bytes de audio.
import * as db from './lib/db.js';

export const CLAVE_PARA_COPIAR = 'paraCopiar';
/** Evento de window tras escribir en `archivosLocales` (la app relee los ids locales). */
export const EVENTO_ARCHIVOS_LOCALES = 'musicsippi:archivos-locales';

function avisarCambioArchivosLocales() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_ARCHIVOS_LOCALES));
}

const idArchivo = (trackId, dispositivo) => `${trackId}:${dispositivo}`;

/** Guarda únicamente metadatos de una copia física, nunca su contenido. */
export async function guardarArchivoLocal(archivo, almacen = db) {
  const {
    trackId, dispositivo, uri, nombre, tamano, sha256, mime, portada,
    persistente, actualizadoEn = new Date().toISOString(),
  } = archivo;
  const registro = {
    id: idArchivo(trackId, dispositivo), trackId, dispositivo, uri, nombre,
    tamano, sha256, mime, actualizadoEn,
  };
  if (portada != null) registro.portada = portada;
  if (persistente != null) registro.persistente = persistente;
  await almacen.guardarRegistro('archivosLocales', registro);
  avisarCambioArchivosLocales();
  return registro;
}

export function obtenerArchivoLocal(trackId, dispositivo, almacen = db) {
  return almacen.obtenerPorClave('archivosLocales', idArchivo(trackId, dispositivo));
}

function normalizarPendiente(pendiente, previo) {
  const { trackId, origen, destino, sha256, tamano, mime, nombre, temporalUri } = pendiente;
  return {
    trackId, origen, destino, sha256, tamano,
    ...(mime ? { mime } : {}),
    ...(nombre ? { nombre } : {}),
    // La URI de MediaStore sigue siendo privada; solo vive en la cola local y
    // permite continuar una descarga tras cerrar la app.
    ...(temporalUri ? { temporalUri } : {}),
    estado: pendiente.estado ?? previo?.estado ?? 'pendiente',
    reanudableDesde: pendiente.reanudableDesde ?? previo?.reanudableDesde ?? 0,
  };
}

/** Añade una transferencia pendiente, una sola vez por canción y destino. */
export async function anotarParaCopiar(pendiente, almacen = db) {
  const pendientes = await almacen.obtenerValorConfig(CLAVE_PARA_COPIAR, []);
  const indice = pendientes.findIndex((p) => p.trackId === pendiente.trackId && p.destino === pendiente.destino);
  const nuevo = normalizarPendiente(pendiente, pendientes[indice]);
  if (indice === -1) pendientes.push(nuevo);
  else pendientes[indice] = { ...pendientes[indice], ...nuevo };
  await almacen.guardarValorConfig(CLAVE_PARA_COPIAR, pendientes);
  return nuevo;
}

export async function pendientesDeCopia(almacen = db) {
  return almacen.obtenerValorConfig(CLAVE_PARA_COPIAR, []);
}

/** La transferencia ya verificó su checksum: retira solo ese destino de la cola. */
export async function confirmarCopia(trackId, destino, almacen = db) {
  const pendientes = await pendientesDeCopia(almacen);
  const restantes = pendientes.filter((p) => p.trackId !== trackId || p.destino !== destino);
  await almacen.guardarValorConfig(CLAVE_PARA_COPIAR, restantes);
}
