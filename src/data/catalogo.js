// src/data/catalogo.js
import { MODO_LOCAL } from '../config/modo.js';
import * as servidor from './catalogo-servidor.js';
import * as local from './catalogo-local.js';

const impl = MODO_LOCAL ? local : servidor;

export const obtenerArtistasFotos = impl.obtenerArtistasFotos;
export const obtenerAlbum = impl.obtenerAlbum;
export const obtenerArtista = impl.obtenerArtista;
export const obtenerTendencias = impl.obtenerTendencias;
export const obtenerRecomendaciones = impl.obtenerRecomendaciones;
