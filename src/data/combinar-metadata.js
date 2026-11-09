// Metadata del móvil sobre la semilla del escritorio, campo a campo: un registro
// local que solo trae la portada no debe borrar el álbum, el año ni la duración.
export function combinarMetadataLocal(semilla, registros) {
  const tracks = { ...(semilla?.tracks ?? {}) };
  for (const r of registros) {
    const base = tracks[r.trackId];
    tracks[r.trackId] = {
      album: r.album ?? base?.album ?? null,
      anio: r.anio ?? base?.anio ?? null,
      duracionMs: r.duracionMs ?? base?.duracionMs ?? null,
      artistaMbid: base?.artistaMbid ?? null,
      coverUrl: r.coverUrl ?? base?.coverUrl ?? null,
      fotoArtista: r.fotoArtista ?? base?.fotoArtista ?? null,
    };
  }
  return tracks;
}
