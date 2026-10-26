// src/movil/inicio/useVectores.js
// Vectores de similitud (embeddings) del móvil para las secciones de Inicio. Se leen una vez
// por minuto como máximo (varias secciones los piden a la vez) y, si no hay, devuelve [].
import { useEffect, useState } from 'react';

const VIGENCIA_MS = 60_000;
let cache = null; // { cuando, canciones, promesa }

export function reiniciarCacheVectores() {
  cache = null;
}

// Si cambia el nº de canciones (sincronizar, importar) los vectores guardados ya no valen.
export function cargarVectores(ctx, ahora = Date.now()) {
  const canciones = ctx.tracks?.length ?? 0;
  if (!cache || cache.canciones !== canciones || ahora - cache.cuando > VIGENCIA_MS) {
    let promesa;
    try {
      promesa = Promise.resolve(ctx.leerVectores?.() ?? []).catch(() => []);
    } catch {
      promesa = Promise.resolve([]);
    }
    cache = { cuando: ahora, canciones, promesa };
  }
  return cache.promesa;
}

export function useVectores(ctx, activo = true) {
  const [vectores, setVectores] = useState([]);
  useEffect(() => {
    if (!activo) return undefined;
    let vivo = true;
    cargarVectores(ctx).then((v) => vivo && setVectores(v ?? []));
    return () => {
      vivo = false;
    };
    // `ctx` cambia en cada render de App; los vectores solo dependen de la biblioteca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, ctx.tracks]);
  return vectores;
}
