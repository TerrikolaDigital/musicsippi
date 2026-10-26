// Actualiza los datos que muestra la interfaz tras una sincronización sin
// reiniciar la aplicación: la cola y el reproductor siguen siendo los mismos.
export async function refrescarBibliotecaLocal({
  cargarDatos,
  obtenerMetadata,
  obtenerFavoritos,
  setTracks,
  setEjes,
  setMetadata,
  setFavoritos,
}) {
  const [datos, metadata, favoritos] = await Promise.all([cargarDatos(), obtenerMetadata(), obtenerFavoritos()]);
  if (datos) {
    setTracks(datos.tracks);
    setEjes(datos.ejes);
  }
  setMetadata(metadata);
  setFavoritos(favoritos);
  return datos;
}
