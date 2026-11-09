// src/movil/fotoUtil.js
// Foto de artista utilizable: Deezer devuelve una silueta genérica (hash de «vacío») cuando el artista no tiene
// foto; no sirve como imagen, así que se descarta (null) y las pantallas usan otra fuente (p. ej. una portada).
const GENERICA = 'd41d8cd98f00b204e9800998ecf8427e';

export const fotoUtil = (url) => (typeof url === 'string' && url && !url.includes(GENERICA) ? url : null);
