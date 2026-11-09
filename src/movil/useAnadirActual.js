// src/movil/useAnadirActual.js
// «+ Añadir» de la canción de fuera que está sonando: la guarda en la biblioteca sin cortarla
// (y, con ♥, también en Favoritas). Un único estado para el mini y el reproductor completo.
// `real` es su copia de la biblioteca (por id, vídeo o título), o null mientras no esté guardada.
import { useCallback, useMemo, useState } from 'react';
import { buscarEnBiblioteca } from './anadirActual.js';

export function useAnadirActual(ctx) {
  const [hechas, setHechas] = useState({}); // id de la canción que sonaba -> { estado, favorita }
  const t = ctx.trackActual;
  const real = useMemo(() => buscarEnBiblioteca(t, ctx.tracks, ctx.videoIdDe), [t, ctx.tracks, ctx.videoIdDe]);
  const info = (t && hechas[t.id]) || {};
  // El botón sigue a la vista un momento tras guardar, con su «✓ En tu biblioteca».
  const externa = (!!t?.titulo && !!t?.artista && !real) || info.estado === 'ok';

  const anadir = useCallback(
    async ({ favorita = false } = {}) => {
      if (!t || real || info.estado === 'cargando') return;
      const id = t.id;
      const poner = (v) => setHechas((s) => ({ ...s, [id]: v }));
      poner({ estado: 'cargando', favorita });
      try {
        const guardada = await ctx.asegurarEnBiblioteca(t);
        if (favorita && guardada?.id) await ctx.alternarFavorito(guardada.id, true);
        poner({ estado: 'ok', favorita });
        ctx.avisar?.(favorita ? 'Añadida a Favoritas' : 'Añadida a tu biblioteca');
      } catch {
        poner({ estado: 'error', favorita });
        ctx.avisar?.('No se pudo añadir esa canción');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, real, info.estado, ctx.asegurarEnBiblioteca, ctx.alternarFavorito, ctx.avisar],
  );

  return { externa, real, estado: info.estado, favorita: !!info.favorita && info.estado === 'ok', anadir };
}
