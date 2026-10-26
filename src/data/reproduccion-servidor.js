// Wrappers de /api/* para reproducción en curso — canal SSE, aviso de sonando, resolución de video externo — ver docs/superpowers/plans/2026-08-26-fase-0-capa-de-datos.md
export function suscribirseACanalReproduccion(onPausate) {
  // Sin manejo de error explícito: EventSource reintenta la conexión solo
  // si el servidor de dev se reinicia (guardar un archivo, etc.) — no hace
  // falta lógica propia para eso.
  const es = new EventSource('/api/canal-reproduccion');
  es.addEventListener('pausate', (e) => onPausate(JSON.parse(e.data)));
  return () => es.close();
}

export function avisarReproduciendo(sesionId) {
  return fetch('/api/reproduciendo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sesionId }),
  });
}

export async function resolverVideoId(query, trackId) {
  const r = await fetch(`/api/resolver?q=${encodeURIComponent(query)}&trackId=${trackId}`);
  return r.json();
}

/**
 * Avisa que un videoId no se pudo reproducir de verdad en este dispositivo.
 *
 * Lo decide el cliente y no el servidor porque la prohibición de embebido
 * puede depender de la región: el único veredicto que vale es el del aparato
 * que tiene que reproducirlo.
 */
export async function descartarVideo(trackId, videoId) {
  const r = await fetch('/api/descartar-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, videoId }),
  });
  return r.json();
}

export async function buscarExterno(q) {
  const r = await fetch(`/api/buscar-externo?q=${encodeURIComponent(q)}`);
  return r.json();
}

/** Radio desde esta canción: [{videoId, titulo, artista, duracionS, album, portadaUrl}]. */
export async function obtenerRadio(videoId, artista) {
  const r = await fetch(`/api/radio?videoId=${encodeURIComponent(videoId)}&artista=${encodeURIComponent(artista ?? '')}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j.pistas;
}
