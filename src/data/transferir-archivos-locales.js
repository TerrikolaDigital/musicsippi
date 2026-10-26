// Descarga autenticada de las copias que el PC ya tiene. El audio no pasa por
// el WebView: se escribe en MediaStore mediante el plugin y se conserva la URI
// temporal para poder reanudar tras un corte.
import { CapacitorHttp } from '@capacitor/core';
import { ReproductorNativo } from './nativo-movil.js';
import { anotarParaCopiar, confirmarCopia, guardarArchivoLocal, pendientesDeCopia } from './archivos-locales.js';

export const BLOQUE = 1024 * 1024;
const LIMITE_ARCHIVO = 500 * 1024 * 1024;

const bytes = (texto) => new TextEncoder().encode(texto);
const hex = (datos) => [...new Uint8Array(datos)].map((n) => n.toString(16).padStart(2, '0')).join('');
const base64ABuffer = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
const aleatorio = () => hex(crypto.getRandomValues(new Uint8Array(16)));

async function sha256(texto) { return hex(await crypto.subtle.digest('SHA-256', bytes(texto))); }
async function hmac(clave, texto) {
  const llave = await crypto.subtle.importKey('raw', bytes(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', llave, bytes(texto)));
}

export async function pruebaPC(clave, reto, nonce, direccionPC) {
  return hmac(clave, `pc|${reto}|${nonce}|${direccionPC}`);
}

/** Cliente con firma de un uso. `enviar` se inyecta en tests. */
export function crearClienteArchivos(base, clave, enviar = async (metodo, ruta, datos, headers) => {
  const r = await CapacitorHttp.request({
    url: `${base}/api/${ruta}`, method: metodo, data: datos,
    headers, responseType: 'json', connectTimeout: 8000, readTimeout: 60000,
  });
  return { status: r.status, datos: typeof r.data === 'string' ? JSON.parse(r.data) : r.data };
}) {
  async function firmada(metodo, ruta, cuerpo, extras = {}) {
    const nonce = await enviar('GET', 'archivos-locales/nonce', null, {});
    if (nonce.status !== 200 || !nonce.datos?.nonce) throw new Error('El PC no pudo autorizar la transferencia.');
    const crudo = cuerpo == null ? '' : JSON.stringify(cuerpo);
    const ts = Date.now().toString();
    const texto = `${metodo}|${ruta}|${await sha256(crudo)}|${nonce.datos.nonce}|${ts}`;
    const headers = { ...extras, 'X-MS-Nonce': nonce.datos.nonce, 'X-MS-TS': ts, 'X-MS-Firma': await hmac(clave, texto) };
    const r = await enviar(metodo, ruta, cuerpo, headers);
    if (r.status < 200 || r.status >= 300) throw new Error(r.datos?.error ?? `El PC respondió ${r.status}.`);
    return r.datos;
  }
  return {
    async saludar(direccion) {
      const reto = aleatorio();
      const r = await enviar('GET', `archivos-locales/hola?r=${reto}`, null, {});
      if (r.status !== 200 || r.datos?.direccionPC !== direccion || r.datos?.prueba !== await pruebaPC(clave, reto, r.datos?.nonce, direccion)) {
        throw new Error('No se pudo verificar la identidad del PC.');
      }
    },
    manifiesto: () => firmada('GET', 'archivos-locales/manifiesto'),
    iniciar: (cuerpo) => firmada('POST', 'archivos-locales/iniciar', cuerpo, { 'Content-Type': 'application/json' }),
    bloque: (token, inicio, fin) => firmada('GET', `archivos-locales/bloque?token=${encodeURIComponent(token)}`, null, { Range: `bytes=${inicio}-${fin - 1}` }),
    finalizar: (token) => firmada('POST', 'archivos-locales/finalizar', { token }, { 'Content-Type': 'application/json' }),
  };
}

/** Copia las pendientes PC → móvil, en serie. Un fallo deja la cola intacta. */
export async function transferirPendientes({ base, direccion, clave, automatica = false, cliente, plugin = ReproductorNativo, almacen } = {}) {
  if (!clave) return { copiados: 0, pendientes: 0, bytes: 0 };
  const api = cliente ?? crearClienteArchivos(base, clave);
  await api.saludar(direccion);
  const disponibles = new Map((await api.manifiesto()).archivos.map((a) => [a.trackId, a]));
  let copiados = 0; let bytes = 0;
  for (const pendiente of await pendientesDeCopia(almacen)) {
    if (pendiente.origen !== 'pc' || pendiente.destino !== 'movil') continue;
    const f = disponibles.get(pendiente.trackId);
    if (!f || f.sha256 !== pendiente.sha256 || f.tamano !== pendiente.tamano || f.tamano > LIMITE_ARCHIVO) continue;
    let temporal;
    try {
      temporal = await plugin.prepararCopiaMusica({ uri: pendiente.temporalUri, nombre: pendiente.nombre ?? `${f.trackId}.mp3`, mime: f.mime });
      const inicioServidor = await api.iniciar({ ...f, direccion: 'descarga', automatica });
      let desde = Math.min(Number(temporal.reanudableDesde) || 0, Number(inicioServidor.reanudableDesde) || 0);
      while (desde < f.tamano) {
        const fin = Math.min(f.tamano, desde + BLOQUE);
        const bloque = await api.bloque(inicioServidor.token, desde, fin);
        if (bloque.inicio !== desde || bloque.fin !== fin) throw new Error('El PC devolvió un bloque inválido.');
        await plugin.escribirBloqueMusica({ uri: temporal.uri, inicio: desde, base64: bloque.base64 });
        desde = fin;
        await anotarParaCopiar({ ...pendiente, temporalUri: temporal.uri, reanudableDesde: desde }, almacen);
      }
      await api.finalizar(inicioServidor.token);
      const final = await plugin.finalizarCopiaMusica({ uri: temporal.uri, sha256: f.sha256, nombre: pendiente.nombre ?? `${f.trackId}.mp3` });
      if (!final.valido) throw new Error('El checksum de la copia no coincide.');
      await guardarArchivoLocal({ trackId: f.trackId, dispositivo: 'movil', uri: final.uri, nombre: pendiente.nombre ?? `${f.trackId}.mp3`, tamano: f.tamano, sha256: f.sha256, mime: f.mime }, almacen);
      await confirmarCopia(f.trackId, 'movil', almacen);
      copiados += 1; bytes += f.tamano;
    } catch (e) {
      // Solo se borra un temporal cuyo checksum fue malo; en cualquier corte se conserva para reanudar.
      if (/checksum/i.test(e.message) && temporal?.uri) await plugin.descartarCopiaMusica({ uri: temporal.uri }).catch(() => {});
    }
  }
  return { copiados, pendientes: (await pendientesDeCopia(almacen)).length, bytes };
}
