// src/data/alta.js
// Alta manual de canciones y álbumes (＋ de Buscar, Álbum y Artista). En el
// build móvil va a IndexedDB (alta-local.js), que lo anota para el PC; en
// escritorio, a /api/* — ver docs/superpowers/plans/2026-08-26-fase-0-capa-de-datos.md
import { MODO_LOCAL } from '../config/modo.js';
import { envolverMutador } from './respuesta-local.js';
import { agregarTrackLocal, agregarAlbumLocal } from './alta-local.js';

function porServidor(ruta) {
  return (payload) =>
    fetch(`/api/${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
}

// `(p) => …(p)`: que un segundo argumento nunca llegue como almacén.
export const agregarTrack = MODO_LOCAL ? envolverMutador((p) => agregarTrackLocal(p)) : porServidor('agregar-track');
export const agregarAlbum = MODO_LOCAL ? envolverMutador((p) => agregarAlbumLocal(p)) : porServidor('agregar-album');
