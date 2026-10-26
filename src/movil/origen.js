// src/movil/origen.js
// De dónde suena lo que suena (un modo, una lista, Favoritas, Infinito…), sin React.
// `ejeActivo` es el del estado de App: un eje real ({ id, nombre }) o uno
// sintético sin id ({ nombre: 'Infinito' }).
import { formatearTitulo } from '../ui/formato.js';

/** Nombre legible del origen, o null si no se sabe. */
export function origenSonando(ejeActivo) {
  const nombre = ejeActivo?.nombre;
  return nombre ? formatearTitulo(nombre) : null;
}

/** ¿Es este modo/lista (por id) el origen de lo que suena? */
export function esEjeSonando(ejeActivo, ejeId) {
  return !!ejeId && ejeActivo?.id === ejeId;
}

/** ¿Es el origen sintético con este nombre (p. ej. «Infinito»)? */
export function esOrigenSintetico(ejeActivo, nombre) {
  return !!ejeActivo && !ejeActivo.id && ejeActivo.nombre === nombre;
}

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Complemento de la segunda línea (tras el artista): el origen si aporta algo
 * (distinto del artista); si coincide o no hay origen, el álbum. '' si no hay nada.
 */
export function complementoSegundaLinea({ artista, origen, album }) {
  if (origen && sinTildes(origen) !== sinTildes(artista)) return origen;
  return album ? formatearTitulo(album) : '';
}
