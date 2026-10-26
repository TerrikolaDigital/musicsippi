// src/data/reproduccion.js
import { MODO_LOCAL } from '../config/modo.js';
import * as servidor from './reproduccion-servidor.js';
import * as local from './reproduccion-local.js';

const impl = MODO_LOCAL ? local : servidor;

export const resolverVideoId = impl.resolverVideoId;
export const descartarVideo = impl.descartarVideo;
export const buscarExterno = impl.buscarExterno;
// En modo servidor no hay caché local: devuelve null y se comparte la búsqueda.
export const videoIdCacheado = impl.videoIdCacheado ?? (async () => null);
// Sin equivalente local — ver Interfaces arriba.
export const suscribirseACanalReproduccion = servidor.suscribirseACanalReproduccion;
export const avisarReproduciendo = servidor.avisarReproduciendo;
export const obtenerRadio = impl.obtenerRadio;
