// src/movil/inicio/deezer.js
// Cliente mínimo de la API pública de Deezer (sin clave) para las secciones externas de Inicio.
// Deezer no manda CORS: en la app sale por la red nativa (crearFetchNativo) y en el navegador por JSONP.
// Tiempo límite por petición, hasta 3 a la vez (Deezer limita por IP) y un reintento si responde «cuota».
import { norm } from './claves.js';

const BASE = 'https://api.deezer.com';
const LIMITE_MS = 8000;
const CONCURRENCIA = 3;

/** Función `(url) => Promise<json>` según la plataforma. */
export async function lectorPorDefecto() {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const { crearFetchNativo } = await import('../../data/audio-nativo.js');
    const f = crearFetchNativo();
    return async (url) => {
      const r = await f(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`Deezer HTTP ${r.status}`);
      return r.json();
    };
  }
  const { pedidoJsonp } = await import('../../data/lib/jsonp.js');
  return (url) => pedidoJsonp(url, LIMITE_MS);
}

export const parsearArtista = (a) =>
  a?.id && a?.name ? { id: a.id, nombre: a.name, foto: a.picture_medium ?? a.picture_big ?? null, fans: a.nb_fan ?? 0 } : null;

export const parsearCancion = (t) =>
  t?.id && t?.title && t?.artist?.name
    ? {
        id: `deezer-${t.id}`,
        titulo: t.title,
        artista: t.artist.name,
        cover: t.album?.cover_medium ?? t.album?.cover_big ?? null,
      }
    : null;

export const parsearAlbum = (a, artista) =>
  a?.id && a?.title
    ? {
        id: `deezer-album-${a.id}`,
        titulo: a.title,
        artista,
        cover: a.cover_medium ?? a.cover_big ?? null,
        fecha: a.release_date ?? null,
        tipo: a.record_type ?? 'album',
      }
    : null;

/**
 * @param {{ get?: (url: string) => Promise<any>, limiteMs?: number, concurrencia?: number, esperar?: (ms: number) => Promise<void> }} [o]
 */
export function crearDeezer({ get, limiteMs = LIMITE_MS, concurrencia = CONCURRENCIA, esperar = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lector = get ?? null;
  let libres = concurrencia;
  const cola = [];
  const soltar = () => {
    libres++;
    const sig = cola.shift();
    if (sig) sig();
  };
  const turno = () => {
    if (libres > 0) {
      libres--;
      return Promise.resolve();
    }
    return new Promise((ok) =>
      cola.push(() => {
        libres--;
        ok();
      }),
    );
  };

  async function unaVez(url) {
    lector ??= await lectorPorDefecto();
    let timer;
    const limite = new Promise((_, no) => {
      timer = setTimeout(() => no(new Error(`Deezer: tiempo agotado (${limiteMs} ms)`)), limiteMs);
    });
    try {
      return await Promise.race([lector(url), limite]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function pedir(ruta, reintentos = 1) {
    await turno();
    try {
      const json = await unaVez(`${BASE}${ruta}`);
      if (json?.error) {
        // Código 4: «Quota limit exceeded».
        if (json.error.code === 4 && reintentos > 0) {
          await esperar(1200);
          return pedir(ruta, reintentos - 1);
        }
        throw new Error(`Deezer: ${json.error.message ?? json.error.code}`);
      }
      return json;
    } finally {
      soltar();
    }
  }

  const lista = (json, parsear) => (json?.data ?? []).map(parsear).filter(Boolean);

  return {
    /** JSON crudo de una ruta de Deezer (con cola, tiempo límite y reintento por cuota): Buscar > Explorar. */
    crudo: (ruta) => pedir(ruta),
    /** El artista con ese nombre exacto (el de más fans); null si Deezer no lo conoce igual. */
    async buscarArtista(nombre) {
      const json = await pedir(`/search/artist?q=${encodeURIComponent(nombre)}&limit=5`);
      const n = norm(nombre);
      const iguales = lista(json, parsearArtista).filter((a) => norm(a.nombre) === n);
      return iguales.sort((a, b) => b.fans - a.fans)[0] ?? null;
    },
    async relacionados(id, limite = 10) {
      return lista(await pedir(`/artist/${id}/related?limit=${limite}`), parsearArtista);
    },
    async top(id, limite = 5) {
      return lista(await pedir(`/artist/${id}/top?limit=${limite}`), parsearCancion);
    },
    async albumes(id, nombreArtista) {
      const json = await pedir(`/artist/${id}/albums?limit=50`);
      return (json?.data ?? []).map((a) => parsearAlbum(a, nombreArtista)).filter(Boolean);
    },
    async chart(genero = '0', limite = 30) {
      return lista(await pedir(`/chart/${genero}/tracks?limit=${limite}`), parsearCancion);
    },
  };
}
