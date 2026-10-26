// GET de texto. En Android va por CapacitorHttp (sin CORS y con User-Agent
// propio, como sincronizar-movil.js); en el navegador, fetch (para probar en
// escritorio: Spotify y Deezer no mandan CORS, así que ahí fallará como sin-red).
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { ErrorImportar } from './errores.js';

export function crearHttp({
  nativo = Capacitor.isNativePlatform(),
  peticionNativa = (opciones) => CapacitorHttp.request(opciones),
  fetchFn = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async get(url, { headers = {} } = {}) {
      try {
        if (nativo) {
          const r = await peticionNativa({
            url,
            method: 'GET',
            headers,
            responseType: 'text',
            connectTimeout: 15000,
            readTimeout: 30000,
          });
          const texto = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? null);
          return { status: r.status, texto, url: r.url ?? url };
        }
        const r = await fetchFn(url, { headers });
        return { status: r.status, texto: await r.text(), url: r.url || url };
      } catch (e) {
        throw new ErrorImportar('sin-red', e?.message ?? String(e));
      }
    },
  };
}
