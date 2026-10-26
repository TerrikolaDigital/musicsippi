// src/data/lib/id-track-navegador.js
// Equivalente de scripts/lib/id-track.mjs para el navegador (Web Crypto en
// vez de node:crypto). MISMO algoritmo (sha1, primeros 12 hex del digest de
// "artista-normalizado|titulo-normalizado") para que los ids de track
// coincidan entre PC y móvil — ver Task 1 del plan.
import { normalizar } from '../../../scripts/lib/clasificar.mjs';

export async function idTrackNavegador(artista, titulo) {
  const texto = `${normalizar(artista)}|${normalizar(titulo)}`;
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 12);
}
