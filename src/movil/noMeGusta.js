// src/movil/noMeGusta.js
// «No me gusta»: canciones y artistas que el usuario no quiere que se le recomienden.
// Un único filtro (`filtrarNoMeGusta`) que usan todos los generadores (descubrimiento,
// tendencias, mezclas, continuación automática, radio, Infinito…). Puro.
import { artistasDe, claveCancion, norm } from './inicio/claves.js';

/** Clave de configuración (IndexedDB) donde se guarda la lista de marcas. */
export const CLAVE_CONFIG = 'noMeGusta';

const nombreArtista = (a) => norm(artistasDe(a)[0] ?? a);

/** Entrada para una canción (de la biblioteca o de fuera): se identifica por artista y título. */
export function entradaCancion(t) {
  return { tipo: 'cancion', clave: claveCancion(t.artista, t.titulo), etiqueta: `${t.titulo} · ${t.artista}` };
}

export function entradaArtista(nombre) {
  return { tipo: 'artista', clave: nombreArtista(nombre), etiqueta: String(nombre) };
}

/** Añade la marca (con `fecha`) si no estaba; devuelve una lista nueva. */
export function agregarMarca(marcas, entrada, ahora = Date.now()) {
  if ((marcas ?? []).some((m) => m.tipo === entrada.tipo && m.clave === entrada.clave)) return marcas;
  return [...(marcas ?? []), { tipo: entrada.tipo, clave: entrada.clave, etiqueta: entrada.etiqueta, fecha: ahora }];
}

export function quitarMarca(marcas, tipo, clave) {
  return (marcas ?? []).filter((m) => !(m.tipo === tipo && m.clave === clave));
}

function indices(marcas) {
  const canciones = new Set();
  const artistas = new Set();
  for (const m of marcas) (m.tipo === 'artista' ? artistas : canciones).add(m.clave);
  return { canciones, artistas };
}

function descarta(item, { canciones, artistas }) {
  if (item?.artista != null) {
    if (item.titulo != null && canciones.has(claveCancion(item.artista, item.titulo))) return true;
    return artistasDe(item.artista).some((a) => artistas.has(norm(a)));
  }
  return item?.nombre != null && artistas.has(nombreArtista(item.nombre));
}

export function esNoMeGusta(item, marcas) {
  return Array.isArray(marcas) && marcas.length > 0 && descarta(item, indices(marcas));
}

/**
 * Quita de `lista` lo marcado con «No me gusta». Sirve para canciones ({ artista, titulo }),
 * álbumes (por su artista) y artistas ({ nombre }). Sin marcas devuelve la misma lista.
 */
export function filtrarNoMeGusta(lista, marcas) {
  if (!Array.isArray(marcas) || !marcas.length || !lista?.length) return lista;
  const ind = indices(marcas);
  return lista.filter((x) => !descarta(x, ind));
}

/** ¿Esta canción es justo lo que se acaba de marcar (o de un artista marcado)? */
export function coincideEntrada(track, entrada) {
  if (!track || !entrada) return false;
  return descarta(track, indices([entrada]));
}
