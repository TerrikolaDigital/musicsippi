// scripts/lib/id-track.mjs
// Separado de clasificar.mjs porque es la ÚNICA función de ese archivo con
// dependencia de Node (node:crypto) — así clasificar.mjs queda 100%
// reutilizable desde el navegador (ver src/data/lib/id-track-navegador.js
// para el equivalente Web Crypto que usa local-store).
import { createHash } from 'node:crypto';
import { normalizar } from './clasificar.mjs';

export function idTrack(artista, titulo) {
  return createHash('sha1')
    .update(`${normalizar(artista)}|${normalizar(titulo)}`)
    .digest('hex')
    .slice(0, 12);
}
