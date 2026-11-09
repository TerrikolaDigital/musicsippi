// src/movil/discografia.js
// Las canciones de un artista en Deezer, para el aleatorio de su ficha: sus álbumes (y con ellos
// EP y singles) y sus éxitos. Pide una lista por álbum, así que solo se lee al tocar aleatorio.
import { cargarConCache, HORA_MS } from './inicio/cache.js';
import { norm } from './inicio/claves.js';
import { parsearCancion } from './inicio/deezer.js';

const MAX_ALBUMES = 40;
const MAX_EXITOS = 20;
const ORDEN_TIPO = { album: 0, ep: 1 };
// Los de remixes, al final: al quitar repetidas tiene que quedar la versión original.
const orden = (al) => (/remix/i.test(al.titulo) ? 3 : (ORDEN_TIPO[al.tipo] ?? 2));

async function cancionesDeAlbum(dz, al) {
  const json = await dz.crudo(`/album/${al.id.replace('deezer-album-', '')}/tracks?limit=100`);
  return (json?.data ?? [])
    .map(parsearCancion)
    .filter(Boolean)
    .map((c) => ({ ...c, cover: c.cover ?? al.cover ?? null, album: al.titulo }));
}

/** @returns {Promise<{canciones: Array, completa: boolean}>} `completa` es false si no se pudo leer algún álbum. */
export async function leerDiscografia(dz, nombre) {
  const artista = await dz.buscarArtista(nombre);
  if (!artista) return { canciones: [], completa: true };
  const [exitos, albumes] = await Promise.all([dz.top(artista.id, MAX_EXITOS), dz.albumes(artista.id, artista.nombre)]);
  const elegidos = [...albumes].sort((a, b) => orden(a) - orden(b)).slice(0, MAX_ALBUMES);
  let completa = true;
  const listas = await Promise.all(
    elegidos.map((al) =>
      cancionesDeAlbum(dz, al).catch(() => {
        completa = false;
        return [];
      }),
    ),
  );
  // Primero las de los álbumes: traen álbum y portada, y al quitar repetidas gana la primera.
  return { canciones: [...listas.flat(), ...exitos], completa };
}

/** Canciones del artista. Una lectura incompleta sirve para esta vez, pero no se reutiliza. */
export async function cargarDiscografia(dz, nombre, almacen) {
  const { datos } = await cargarConCache(`discografia:${norm(nombre)}`, {
    ttlMs: 7 * 24 * HORA_MS,
    almacen,
    valida: (entrada) => !!entrada.datos?.completa,
    cargar: () => leerDiscografia(dz, nombre),
  });
  return datos.canciones;
}
