// Puente JS del plugin Android para música local: selector SAF (archivos o carpeta con permiso
// persistente) y escaneo de MediaStore. El plugin devuelve por entrada URI, tags, tamaño, MIME y
// portada opcional (data URL reducida); aquí se normaliza y se separan los errores por entrada.
import { esAndroid, ReproductorNativo } from './nativo-movil.js';

const ESQUEMAS_LOCALES = /^(content|file):\/\//i;
const ARTISTA_DESCONOCIDO = 'Artista desconocido';

const limpiar = (v) => (typeof v === 'string' ? v.trim() : '');

function tituloDeNombre(nombre) {
  return limpiar(nombre).replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/_/g, ' ').trim();
}

/** Normaliza una entrada del plugin. Lanza si la URI no es content:// o file://. */
export function normalizarArchivoLocal(entrada) {
  const uri = limpiar(entrada?.uri);
  if (!ESQUEMAS_LOCALES.test(uri)) throw new Error('URI no válida: se esperaba content:// o file://');
  const nombre = limpiar(entrada.nombre);
  const archivo = {
    uri,
    nombre,
    titulo: limpiar(entrada.titulo) || tituloDeNombre(nombre) || 'Sin título',
    artista: limpiar(entrada.artista) || ARTISTA_DESCONOCIDO,
    tamano: Number(entrada.tamano) || 0,
    mime: limpiar(entrada.mime) || 'audio/mpeg',
  };
  const album = limpiar(entrada.album);
  if (album) archivo.album = album;
  if (Number(entrada.duracionMs) > 0) archivo.duracionMs = Math.round(Number(entrada.duracionMs));
  if (limpiar(entrada.portada)) archivo.portada = entrada.portada;
  return archivo;
}

function normalizarResultado(bruto) {
  const archivos = [];
  const errores = [...(bruto?.errores ?? [])];
  for (const entrada of bruto?.archivos ?? []) {
    try {
      archivos.push(normalizarArchivoLocal(entrada));
    } catch (e) {
      errores.push({ nombre: entrada?.nombre ?? '', error: e.message });
    }
  }
  return { archivos, errores };
}

const pluginPorDefecto = () => (esAndroid() ? ReproductorNativo : null);

/** Abre el selector SAF (archivos, o árbol con `carpeta: true`). `cancelado` si no eligió nada. */
export async function seleccionarArchivosLocales({ carpeta = false, plugin = pluginPorDefecto() } = {}) {
  if (!plugin) return { archivos: [], errores: [], cancelado: true };
  const bruto = await (carpeta ? plugin.seleccionarCarpeta() : plugin.seleccionarArchivos());
  const resultado = normalizarResultado(bruto);
  return { ...resultado, cancelado: resultado.archivos.length === 0 && resultado.errores.length === 0 };
}

/** Lista el audio indexado por MediaStore. `permiso:false` si el usuario denegó el acceso. */
export async function escanearMediaStore({ plugin = pluginPorDefecto() } = {}) {
  if (!plugin) return { archivos: [], errores: [], permiso: false };
  const bruto = await plugin.escanearMediaStore();
  return { ...normalizarResultado(bruto), permiso: bruto?.permiso !== false };
}
