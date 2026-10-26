// src/data/sincronizar-movil.js
// "Sincronizar con el PC" (app Android): pide a la app de escritorio, por la
// WiFi de casa, la biblioteca completa (/api/exportar-movil) y la fusiona en
// IndexedDB conservando lo hecho en el móvil (fusionarDatosDelPC).
// Va por HTTP nativo de Capacitor: el WebView (https://localhost) bloquearía
// una petición http:// a otra máquina (contenido mixto + CORS).
import { CapacitorHttp } from '@capacitor/core';
import {
  fusionarDatosDelPC,
  obtenerCambiosPendientes,
  descartarCambiosAplicados,
  obtenerBibliotecaLocal,
} from './biblioteca-local.js';
import { guardarValorConfig, obtenerValorConfig } from './lib/db.js';
import { subirCambiosAlPC } from './subir-cambios.js';
import { transferirPendientes } from './transferir-archivos-locales.js';
import { descubrirPC } from './descubrir-pc.js';
import * as db from './lib/db.js';
import { esquemaDeEjes, esquemasCompatibles } from '../organizador/migrar-moods.js';
import { esquemaLocal } from './migrar-moods-movil.js';

const CLAVE_DIRECCION = 'direccionPC';
const CLAVE_EMPAREJAMIENTO = 'claveEmparejamientoPC';

export function obtenerDireccionPC() {
  return obtenerValorConfig(CLAVE_DIRECCION, '');
}

const ERROR_CONEXION = '¿Está abierta la app de escritorio y en la misma WiFi?';

async function pedir(base, metodo, ruta, cuerpo) {
  try {
    const r = await CapacitorHttp.request({
      url: `${base}/api/${ruta}`,
      method: metodo,
      headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
      data: cuerpo,
      responseType: 'json',
      connectTimeout: 8000,
      readTimeout: 60000,
    });
    const datos = typeof r.data === 'string' && r.data ? JSON.parse(r.data) : r.data;
    return { status: r.status, datos };
  } catch (e) {
    const err = new Error(`No se pudo conectar con el PC (${e?.message ?? e}). ${ERROR_CONEXION}`);
    err.red = true;
    throw err;
  }
}

async function exportarDelPC(base) {
  const { status, datos } = await pedir(base, 'GET', 'exportar-movil');
  if (status !== 200) throw new Error(`El PC respondió ${status}.`);
  if (!Array.isArray(datos?.tracks) || !Array.isArray(datos?.ejes)) throw new Error('El PC no devolvió una biblioteca válida.');
  return datos;
}

/**
 * PC y móvil no se mezclan si uno está reorganizado en moods y el otro no: se comprueba ANTES de subir nada.
 * Un PC antiguo sin el endpoint cuenta como esquema 0.
 */
async function comprobarEsquema(base) {
  const { status, datos } = await pedir(base, 'GET', 'esquema-moods');
  const remoto = status === 200 ? Number(datos?.esquema) || 0 : 0;
  const v = esquemasCompatibles(await esquemaLocal(db), remoto);
  if (!v.ok) {
    const err = new Error(v.motivo);
    err.esquema = true;
    throw err;
  }
}

const subirCambios = (base) => subirCambiosAlPC(base, { enviar: pedir, obtener: obtenerCambiosPendientes, descartar: descartarCambiosAplicados });

/**
 * Lo puesto a mano en el móvil ANTES de que existiera el registro de cambios
 * (o por cualquier hueco): modos/colecciones manuales que el PC no tiene.
 */
async function subirManualesQueFaltan(base, delPC) {
  const enPC = new Map(delPC.tracks.map((t) => [t.id, new Set(t.ejes.map((a) => a.ejeId))]));
  const tipos = new Map(delPC.ejes.map((e) => [e.id, e.tipo]));
  let subidos = 0;
  for (const t of await obtenerBibliotecaLocal()) {
    const ejesPC = enPC.get(t.id);
    if (!ejesPC) continue;
    for (const a of t.ejes) {
      if (a.origen !== 'manual' || ejesPC.has(a.ejeId) || !tipos.has(a.ejeId)) continue;
      const tipo = tipos.get(a.ejeId);
      const { status } =
        tipo === 'gusto' || tipo === 'funcional'
          ? await pedir(base, 'POST', 'asignar', { trackId: t.id, ejeId: a.ejeId })
          : await pedir(base, 'POST', 'coleccion', { trackId: t.id, ejeId: a.ejeId, activo: true });
      if (status >= 200 && status < 300) subidos += 1;
    }
  }
  return subidos;
}

/**
 * Sincronización en los dos sentidos con la app de escritorio:
 *  1. sube los cambios hechos en el móvil (registro de cambios),
 *  2. sube los modos manuales que el PC no tenga,
 *  3. baja la biblioteca ya combinada y la fusiona en el móvil.
 * El PC queda como copia principal; ante el mismo dato tocado en los dos
 * lados gana el último que llega (lo del móvil se aplica justo antes de bajar).
 * @param {string} direccion "192.168.0.10:51234" (con o sin http://)
 */
export async function sincronizarConPC(direccion, { automatica = false } = {}) {
  const limpia = String(direccion ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (!/^[\w.-]+:\d+$/.test(limpia)) throw new Error('Escribe la dirección como IP:puerto (la muestra el PC).');
  const base = `http://${limpia}`;

  await comprobarEsquema(base);
  const { aplicados: subidos, altaRechazada } = await subirCambios(base);
  let datos = await exportarDelPC(base);
  const v = esquemasCompatibles(await esquemaLocal(db), esquemaDeEjes(datos.ejes, datos.esquemaMoods));
  if (!v.ok) throw new Error(v.motivo);
  // Solo la primera vez: después el registro de cambios ya lo cubre todo, y
  // repetirlo devolvería al PC un modo que se quitó allí a propósito.
  let manuales = 0;
  if (!(await obtenerValorConfig('manualesSubidos', false))) {
    manuales = await subirManualesQueFaltan(base, datos);
    if (manuales > 0) datos = await exportarDelPC(base);
    await guardarValorConfig('manualesSubidos', true);
  }

  // Con altas sin entregar, el PC no tiene esas canciones: si mandara él, la fusión las borraría del móvil.
  await fusionarDatosDelPC(datos, { pcManda: !altaRechazada });
  await guardarValorConfig(CLAVE_DIRECCION, limpia);
  await guardarValorConfig('ultimaSincronizacion', new Date().toISOString());
  let archivos = { copiados: 0, pendientes: 0, bytes: 0 };
  try {
    const clave = await obtenerValorConfig(CLAVE_EMPAREJAMIENTO, '');
    archivos = await transferirPendientes({ base, direccion: limpia, clave, automatica });
  } catch (e) {
    // Los bytes fallidos no deshacen ni el journal ni la fusión ya confirmados.
    archivos = { copiados: 0, pendientes: -1, bytes: 0, aviso: `No se pudieron copiar los archivos: ${e?.message ?? e}` };
  }
  return {
    canciones: datos.tracks.length,
    modos: datos.ejes.length,
    subidos: subidos + manuales,
    copiados: archivos.copiados,
    pendientesArchivos: archivos.pendientes,
    bytesArchivos: archivos.bytes,
    ...(altaRechazada ? { aviso: 'No se pudo enviar todo al PC; se reintentará.' } : {}),
  };
}

/** IP privada (192.168.x, 10.x, 172.16-31.x) con puerto: la red de casa. */
export function esDireccionLocal(direccion) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+):\d+$/.exec(String(direccion ?? ''));
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * Escucha los enlaces musicsippi://sincronizar?d=IP:puerto (QR que muestra el
 * PC en Configuración → Móvil, escaneado con la cámara) y sincroniza sola.
 * `avisar(estado)` recibe {fase: 'sincronizando'|'listo'|'error', ...}.
 */
export async function escucharEnlacesDeSincronizacion(avisar) {
  const { registerPlugin } = await import('@capacitor/core');
  const ReproductorNativo = registerPlugin('ReproductorNativo');
  return ReproductorNativo.addListener('enlace', async ({ url }) => {
    // Regex y no new URL(): con esquemas propios el parseo del host varía entre WebViews.
    const m = /^musicsippi:\/\/sincronizar\?(?:.*&)?d=([^&]+)/.exec(String(url ?? ''));
    if (!m) return;
    const d = decodeURIComponent(m[1]);
    const clave = new URLSearchParams(String(url).split('?')[1] ?? '').get('k');
    // Un enlace así lo puede abrir cualquier web o QR ajeno: solo red local y
    // siempre con confirmación, para que nadie meta datos en la biblioteca.
    if (!esDireccionLocal(d)) {
      avisar({ fase: 'error', mensaje: `${d} no es una dirección de tu red local.` });
      return;
    }
    if (!window.confirm(`¿Sincronizar con el PC ${d}? Se traerá su biblioteca (se conserva lo hecho en el móvil).`)) return;
    if (clave && /^[0-9a-f]{32,128}$/i.test(clave)) await guardarValorConfig(CLAVE_EMPAREJAMIENTO, clave);
    avisar({ fase: 'sincronizando', direccion: d });
    try {
      avisar({ fase: 'listo', ...(await sincronizarConPC(d)) });
    } catch (e) {
      avisar({ fase: 'error', mensaje: e?.message ?? String(e) });
    }
  });
}

/** Cuántos cambios hechos en el móvil esperan a subir al PC. */
export async function contarCambiosPendientes() {
  return (await obtenerCambiosPendientes()).length;
}

/** ISO de la última sincronización con el PC, o null si nunca. */
export function obtenerUltimaSincronizacion() {
  return obtenerValorConfig('ultimaSincronizacion', null);
}

/** Arranque silencioso: como mucho una vez cada diez minutos. */
export async function sincronizarAlAbrir() {
  const ultima = await obtenerValorConfig('ultimoIntentoAutoSync', 0);
  if (Date.now() - Number(ultima) < 10 * 60 * 1000) return null;
  await guardarValorConfig('ultimoIntentoAutoSync', Date.now());
  const direccion = await obtenerDireccionPC();
  const clave = await obtenerValorConfig(CLAVE_EMPAREJAMIENTO, '');
  const encontrada = await descubrirPC({ direccion, clave });
  if (!encontrada) return null;
  return sincronizarConPC(encontrada, { automatica: true });
}
