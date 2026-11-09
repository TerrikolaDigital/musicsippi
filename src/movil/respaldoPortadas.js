// src/movil/respaldoPortadas.js
// Registro central «dirección de carátula → dirección de respaldo» (la miniatura del vídeo de YouTube).
// `metadataDe` lo rellena cada vez que da una carátula; `PortadaImg` y `useCruce` lo consultan solos, así
// TODAS las pantallas que dibujan una portada caen al respaldo si la principal no carga, sin tocar cada una.
const respaldos = new Map();

export function registrarRespaldo(url, respaldo) {
  if (typeof url === 'string' && typeof respaldo === 'string' && url && respaldo && url !== respaldo) respaldos.set(url, respaldo);
}

export const respaldoDeUrl = (url) => (typeof url === 'string' ? respaldos.get(url) ?? null : null);
