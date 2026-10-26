// videoId que trae el build (cache-youtube.json del PC) que aún no están en el
// store cacheYoutube. Se siembra por entradas que faltan (no «si está vacío»):
// una importación de YouTube puede escribir videoIds antes del primer play, y
// con la regla antigua la semilla del build ya no se aplicaría nunca.
export function entradasSemillaQueFaltan(semilla, existentes) {
  return Object.entries(semilla ?? {})
    .filter(([trackId]) => trackId !== 'version' && !existentes.has(trackId))
    .map(([trackId, v]) => ({ trackId, videoId: typeof v === 'string' ? v : v?.videoId }))
    .filter((e) => e.videoId);
}
