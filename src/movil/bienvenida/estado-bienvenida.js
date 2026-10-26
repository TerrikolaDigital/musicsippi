// src/movil/bienvenida/estado-bienvenida.js
import { obtenerValorConfig, guardarValorConfig } from '../../data/lib/db.js';
import { CLAVE_BIENVENIDA } from './bienvenida.js';

export function obtenerBienvenidaVista() {
  return obtenerValorConfig(CLAVE_BIENVENIDA, false);
}

export function marcarBienvenidaVista() {
  return guardarValorConfig(CLAVE_BIENVENIDA, true);
}
