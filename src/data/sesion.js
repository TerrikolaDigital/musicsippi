// src/data/sesion.js
import { MODO_LOCAL } from '../config/modo.js';
import * as servidor from './sesion-servidor.js';
import * as local from './sesion-local.js';

const impl = MODO_LOCAL ? local : servidor;

export const migrarHistorial = impl.migrarHistorial;
export const migrarUltimosModos = impl.migrarUltimosModos;
export const registrarReproduccion = impl.registrarReproduccion;
export const obtenerHistorial = impl.obtenerHistorial;
export const obtenerUltimosModos = impl.obtenerUltimosModos;
export const guardarUltimoModoUsado = impl.guardarUltimoModoUsado;
