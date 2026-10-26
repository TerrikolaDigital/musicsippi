// src/data/nativo-movil.js
// Puente con el plugin nativo (Android) para batería y guardar la copia de seguridad.
// Fuera de Android no hay plugin: estadoBateria devuelve null y guardarArchivo no existe.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { decidirRedMedida } from './red-medida.js';
import { trocearTexto } from './trocear-texto.js';

export const ReproductorNativo = registerPlugin('ReproductorNativo');

export const esAndroid = () => Capacitor.isNativePlatform();

/** true / false si la app está exenta de la optimización de batería; null si no se puede saber. */
export async function estadoBateria() {
  if (!esAndroid()) return null;
  try {
    return (await ReproductorNativo.estadoBateria()).exenta === true;
  } catch {
    return null;
  }
}

export function abrirAjusteBateria() {
  return ReproductorNativo.abrirAjusteBateria();
}

/**
 * ¿La red actual es de pago por uso (datos móviles o WiFi medida)? En Android pregunta al
 * sistema; en web/escritorio usa navigator.connection si existe y, si no, false. Si el sistema falla,
 * falla cerrado (ver decidirRedMedida).
 */
export async function redMedida() {
  const connection = globalThis.navigator?.connection;
  const datos = { connection, esAndroid: esAndroid() };
  if (!datos.esAndroid) return decidirRedMedida(datos);
  try {
    return decidirRedMedida({ ...datos, nativo: await ReproductorNativo.redMedida() });
  } catch {
    return decidirRedMedida({ ...datos, errorNativo: true });
  }
}

/**
 * Abre «Guardar como» de Android; devuelve true si el usuario guardó. El contenido (varios MB) se
 * pasa por trozos a un temporal nativo: la llamada que abre la actividad solo lleva la ruta, porque
 * Capacitor la guarda en el estado de la actividad y un Bundle grande revienta el binder.
 */
export async function guardarArchivo(nombre, contenido) {
  const trozos = trocearTexto(contenido);
  let rutaTemporal = null;
  for (let i = 0; i < Math.max(trozos.length, 1); i++) {
    rutaTemporal = (await ReproductorNativo.escribirTemporal({ nombre, trozo: trozos[i] ?? '', inicio: i === 0 })).ruta;
  }
  return (await ReproductorNativo.guardarArchivo({ nombre, rutaTemporal })).guardado === true;
}

/** Base64 (sin prefijo data:) de un Blob. */
function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '');
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

/** Android: hoja de compartir con una imagen PNG (la guarda en caché y la envía por FileProvider). */
export async function compartirImagen({ titulo, blob, texto = '' }) {
  await ReproductorNativo.compartir({ titulo, texto, imagenBase64: await blobABase64(blob) });
}

/** Android: guarda un PNG en la galería (Pictures/Musicsippi vía MediaStore). Devuelve la uri; rechaza si falla. */
export async function guardarImagenGaleria({ nombre, blob }) {
  return (await ReproductorNativo.guardarImagenGaleria({ nombre, imagenBase64: await blobABase64(blob) })).uri;
}

/**
 * Comparte un texto. En Android abre la hoja de compartir del sistema; en web usa
 * navigator.share o, si no existe, copia el texto al portapapeles.
 * Devuelve 'nativo' | 'compartido' | 'copiado' | 'cancelado'.
 */
export async function compartir({ titulo, texto }) {
  if (esAndroid()) {
    await ReproductorNativo.compartir({ titulo, texto });
    return 'nativo';
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, text: texto });
      return 'compartido';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
    }
  }
  await navigator.clipboard.writeText(texto);
  return 'copiado';
}

/** Abre el selector de salida de audio del sistema; devuelve la vía usada o null (web/escritorio o fallo). */
export async function abrirSelectorSalida() {
  if (!esAndroid()) return null;
  try {
    return (await ReproductorNativo.abrirSelectorSalida()).via ?? null;
  } catch {
    return null;
  }
}

/** Texto compartido con la app (ACTION_SEND text/plain). Fuera de Android no hace nada. */
export async function escucharTextoCompartido(alRecibir) {
  if (!esAndroid()) return { remove() {} };
  return ReproductorNativo.addListener('textoCompartido', ({ texto }) => alRecibir(String(texto ?? '')));
}
