// Wrappers de /api/* para catálogo — álbumes, artistas, tendencias, recomendaciones — ver docs/superpowers/plans/2026-08-26-fase-0-capa-de-datos.md
export async function obtenerArtistasFotos() {
  const r = await fetch('/api/artistas-fotos');
  return r.json();
}

export async function obtenerAlbum({ artista, titulo, albumConocido }) {
  const params = new URLSearchParams({ artista, titulo });
  if (albumConocido) params.set('albumConocido', albumConocido);
  const r = await fetch(`/api/album?${params}`);
  return r.json();
}

export async function obtenerArtista(nombre) {
  const r = await fetch(`/api/artista?nombre=${encodeURIComponent(nombre)}`);
  return r.json();
}

export async function obtenerTendencias(genero) {
  const r = await fetch(`/api/tendencias?genero=${encodeURIComponent(genero)}`);
  return r.json();
}

export async function obtenerRecomendaciones(artistas) {
  const r = await fetch('/api/recomendaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artistas }),
  });
  return r.json();
}
