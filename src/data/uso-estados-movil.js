// src/data/uso-estados-movil.js
// Guarda en IndexedDB (móvil) lo que se oyó de una canción puesta desde un chip de «¿Cómo te sientes?».
// Se carga con import() dinámico desde App.jsx: el escritorio nunca lo usa.
import { obtenerValorConfig, guardarValorConfig } from './lib/db.js';
import { registrarUsoEstado } from '../organizador/alimentar-estados.js';

export function registrarUsoEstadoMovil(trackId, estadoId, fraccion) {
  return registrarUsoEstado({ obtenerValorConfig, guardarValorConfig }, trackId, estadoId, fraccion);
}
