// Wrappers de /api/* para la biblioteca del usuario — ejes, favoritos, overrides — ver docs/superpowers/plans/2026-08-26-fase-0-capa-de-datos.md
export function asignarEje(trackId, ejeId) {
  return fetch('/api/asignar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, ejeId }),
  });
}

export function quitarModo(trackId, ejeId) {
  return fetch('/api/quitar-modo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, ejeId }),
  });
}

export function unirModos(origenId, destinoId) {
  return fetch('/api/unir-modos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origenId, destinoId }),
  });
}

export async function obtenerMetadata() {
  const r = await fetch('/api/metadata');
  return r.json();
}

export async function obtenerOverrides() {
  const r = await fetch('/api/overrides');
  return r.json();
}

export async function obtenerFavoritos() {
  const r = await fetch('/api/favoritos');
  return r.json();
}

export function guardarFavoritoArtista(nombre, activo) {
  return fetch('/api/favorito', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'artista', nombre, activo }),
  });
}

export function guardarFavoritoAlbum(artista, titulo, activo) {
  return fetch('/api/favorito', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'album', artista, titulo, activo }),
  });
}

export function guardarOverride(trackId, cambios) {
  return fetch('/api/override', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, cambios }),
  });
}

export function quitarTrack(trackId) {
  return fetch('/api/quitar-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId }),
  });
}

export function guardarColeccion(trackId, ejeId, activo) {
  return fetch('/api/coleccion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, ejeId, activo }),
  });
}

export function guardarEjes(payload) {
  return fetch('/api/ejes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
