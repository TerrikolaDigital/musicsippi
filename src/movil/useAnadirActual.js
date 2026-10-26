// src/movil/useAnadirActual.js
// «+ Añadir» de la canción de fuera que está sonando: la guarda en la biblioteca sin cortarla
// (y, con ♥, también en Favoritas). Un único estado para el mini y el reproductor completo.
import { useCallback, useState } from 'react';
import { esCancionExterna } from './anadirActual.js';

export function useAnadirActual(ctx) {
  const [hechas, setHechas] = useState({}); // id de la vista previa -> { estado, favorita }
  const t = ctx.trackActual;
  const externa = esCancionExterna(t, ctx.tracks);
  const info = (t && hechas[t.id]) || {};

  const anadir = useCallback(
    async ({ favorita = false } = {}) => {
      if (!t || !esCancionExterna(t, ctx.tracks) || info.estado === 'cargando') return;
      const id = t.id;
      const poner = (v) => setHechas((s) => ({ ...s, [id]: v }));
      poner({ estado: 'cargando', favorita });
      try {
        const json = await ctx.agregarExterno({ titulo: t.titulo, artista: t.artista, videoId: t.youtubeVideoId });
        if (favorita && json?.track?.id) await ctx.alternarFavorito(json.track.id, true);
        poner({ estado: 'ok', favorita });
        ctx.avisar?.(favorita ? 'Añadida a Favoritas' : 'Añadida a tu biblioteca');
      } catch {
        poner({ estado: 'error', favorita });
        ctx.avisar?.('No se pudo añadir esa canción');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, ctx.tracks, info.estado, ctx.agregarExterno, ctx.alternarFavorito, ctx.avisar],
  );

  return { externa, estado: info.estado, favorita: !!info.favorita && info.estado === 'ok', anadir };
}
