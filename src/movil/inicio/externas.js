// src/movil/inicio/externas.js
// Escuchar o añadir una canción que viene de fuera (Deezer) sin tenerla en la biblioteca:
// se busca su vídeo en YouTube Music (ctx.buscarExterno, como hace Buscar) y se sigue el mismo
// camino que las canciones de fuera de Buscar (previewDe para escuchar, ctx.agregarExterno para añadir).
import { useCallback, useEffect, useRef, useState } from 'react';
import { previewDe } from '../busqueda.js';
import { cargarConCache, almacenPorDefecto, HORA_MS } from './cache.js';
import { crearDeezer } from './deezer.js';
import { norm } from './claves.js';

/** El resultado de búsqueda que mejor encaja con el título (si ninguno coincide, el primero). */
export function elegirResultado(resultados, { titulo }) {
  const lista = (resultados ?? []).filter((r) => r?.videoId);
  const t = norm(titulo);
  return lista.find((r) => norm(r.tituloSugerido) === t) ?? lista.find((r) => norm(r.tituloSugerido).includes(t)) ?? lista[0] ?? null;
}

/** videoId de una canción de Deezer; lanza si no se encuentra. */
export async function resolverVideo(buscarExterno, cancion) {
  const json = await buscarExterno(`${cancion.artista} ${cancion.titulo}`);
  if (json?.error) throw new Error(json.mensaje ?? json.error);
  const r = elegirResultado(json?.resultados, cancion);
  if (!r) throw new Error('sin resultados');
  return r.videoId;
}

export const previewDeCancion = (cancion, videoId) =>
  previewDe({ videoId, tituloSugerido: cancion.titulo, artistaSugerido: cancion.artista });

/**
 * Acciones de las tarjetas externas. Estado por id: 'cargando' | 'ok' | 'error'.
 * `escuchar` y `agregar` son independientes: añadir no interrumpe lo que suena.
 */
export function useAccionesExternas(ctx, etiqueta) {
  const [estados, setEstados] = useState({});
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const poner = useCallback((id, v) => setEstados((s) => ({ ...s, [`${id}`]: v })), []);

  const escuchar = useCallback(
    async (c) => {
      poner(`${c.id}:play`, 'cargando');
      try {
        const p = previewDeCancion(c, await resolverVideo(ctxRef.current.buscarExterno, c));
        ctxRef.current.reproducirLista(p, [p], etiqueta);
        poner(`${c.id}:play`, undefined);
      } catch {
        poner(`${c.id}:play`, 'error');
        ctxRef.current.avisar?.('No se pudo reproducir esa canción');
      }
    },
    [etiqueta, poner],
  );

  const agregar = useCallback(
    async (c) => {
      poner(c.id, 'cargando');
      try {
        const videoId = await resolverVideo(ctxRef.current.buscarExterno, c);
        await ctxRef.current.agregarExterno({ titulo: c.titulo, artista: c.artista, videoId });
        poner(c.id, 'ok');
        return true;
      } catch {
        poner(c.id, 'error');
        ctxRef.current.avisar?.('No se pudo añadir esa canción');
        return false;
      }
    },
    [poner],
  );

  return { estados, escuchar, agregar, poner };
}

// ---- Carga en segundo plano, con caché ---------------------------------------------

let dzCompartido = null;
export const dzUnico = () => (dzCompartido ??= crearDeezer());

/** Deezer con la búsqueda de artistas cacheada (el id de un artista no cambia): 30 días. */
export function deezerConIds(dz = dzUnico(), almacen = almacenPorDefecto(), ahora = Date.now) {
  return {
    ...dz,
    buscarArtista: async (nombre) => {
      const { datos } = await cargarConCache(`artista:${norm(nombre)}`, {
        ttlMs: 30 * 24 * HORA_MS,
        almacen,
        ahora,
        cargar: async () => (await dz.buscarArtista(nombre)) ?? { id: null },
      });
      return datos?.id ? datos : null;
    },
  };
}

/**
 * Calcula una sección sin bloquear Inicio: espera `retrasoMs`, mira la caché y, si hace falta,
 * pregunta a la red. Devuelve null hasta tener datos; los errores se tragan (la sección no sale).
 * `firma` es lo que, al cambiar, lo recalcula; `cargar(dz)` lee lo último del contexto por ref.
 */
export function useSeccionExterna({ clave, ttlMs, firma, activa = true, retrasoMs = 1500, valida, cargar }) {
  const [datos, setDatos] = useState(null);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;
  useEffect(() => {
    if (!activa) return undefined;
    let vivo = true;
    const t = setTimeout(() => {
      cargarConCache(clave, { ttlMs, valida, cargar: () => cargarRef.current(deezerConIds()) })
        .then((r) => vivo && setDatos(r.datos))
        .catch(() => {});
    }, retrasoMs);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, firma, activa]);
  return datos;
}
