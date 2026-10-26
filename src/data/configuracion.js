// src/data/configuracion.js
// Sin facade servidor/local: la clave de YouTube Data API solo tiene
// sentido en modo local (InnerTube, usado en modo servidor, no requiere
// clave). Vive en el mismo store "configuracion" de IndexedDB que
// favoritos/ultimosModos/onboarding (ver db.js).
import { obtenerValorConfig, guardarValorConfig } from './lib/db.js';

export function obtenerClaveYoutube() {
  return obtenerValorConfig('youtubeApiKey', '');
}

export function guardarClaveYoutube(clave) {
  return guardarValorConfig('youtubeApiKey', clave);
}
