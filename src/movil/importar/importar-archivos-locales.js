// src/movil/importar/importar-archivos-locales.js
// Importa al móvil audio local (ya leído por el plugin) y listas M3U/M3U8/PLS. Las canciones
// entran por importarFilasLocal (ids, registro de cambios para el PC); aquí solo se persiste
// dónde está cada archivo en este móvil. Las listas son texto: nunca se abre ninguna ruta.
import * as db from '../../data/lib/db.js';
import { importarFilasLocal, idsDeFilas } from '../../data/alta-local.js';
import { guardarArchivoLocal } from '../../data/archivos-locales.js';

const EXTENSION_LISTA = /\.(m3u8?|pls)$/i;
const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** «carpeta\Mi_tema.MP3» o «file:///x/Mi%20tema.mp3» → «mi_tema.mp3» (clave de emparejamiento). */
export function claveDeRuta(ruta) {
  let nombre = String(ruta ?? '').trim().split(/[\\/]/).pop() ?? '';
  try {
    nombre = decodeURIComponent(nombre);
  } catch {
    // nombre con % suelto: se deja como está
  }
  return nombre.normalize('NFC').toLowerCase();
}

export const nombreDeLista = (archivo) =>
  limpio(String(archivo ?? '').replace(EXTENSION_LISTA, '').replace(/_/g, ' ')) || 'Lista importada';

/** Texto de una lista → entradas {ruta, titulo?, artista?}. Formato según el nombre del archivo. */
export function parsearPlaylist(texto, nombreArchivo = '') {
  const lineas = String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const esPls = /\.pls$/i.test(nombreArchivo) || /^\[playlist\]$/i.test(lineas[0] ?? '');
  const entradas = [];
  if (esPls) {
    const porNumero = new Map();
    for (const l of lineas) {
      const m = /^(File|Title)(\d+)\s*=\s*(.*)$/i.exec(l);
      if (!m) continue;
      const e = porNumero.get(Number(m[2])) ?? {};
      if (m[1].toLowerCase() === 'file') e.ruta = m[3].trim();
      else e.titulo = m[3].trim();
      porNumero.set(Number(m[2]), e);
    }
    for (const n of [...porNumero.keys()].sort((a, b) => a - b)) if (porNumero.get(n).ruta) entradas.push(porNumero.get(n));
    return entradas;
  }
  let info = null;
  for (const l of lineas) {
    if (l.startsWith('#')) {
      const m = /^#EXTINF:[^,]*,(.*)$/i.exec(l);
      if (m) {
        const [artista, ...resto] = m[1].split(' - ');
        info = resto.length ? { artista: limpio(artista), titulo: limpio(resto.join(' - ')) } : { titulo: limpio(m[1]) };
      }
      continue;
    }
    entradas.push({ ruta: l, ...(info ?? {}) });
    info = null;
  }
  return entradas;
}

/** Empareja las entradas con los archivos elegidos por nombre de archivo (las URL remotas no cuentan). */
export function emparejarEntradas(entradas, archivos) {
  const porClave = new Map();
  for (const a of archivos) {
    const k = claveDeRuta(a.nombre);
    if (k && !porClave.has(k)) porClave.set(k, a);
  }
  const encontradas = [];
  const ausentes = [];
  for (const e of entradas) {
    const remota = /^https?:\/\//i.test(e.ruta);
    const a = remota ? null : porClave.get(claveDeRuta(e.ruta));
    if (a) encontradas.push(a);
    else ausentes.push(e);
  }
  return { encontradas, ausentes };
}

const filaDe = (a, playlist = '') => ({ titulo: a.titulo, artista: a.artista, album: a.album ?? '', playlist, tipo: 'Track' });

/**
 * @param {{archivos: object[], listas?: {nombre: string, texto: string}[], dispositivo?: string}} entrada
 *   archivos = salida normalizada de archivos-locales-movil.js.
 * @returns tracks, ejes, ejeLista (de la última lista creada), listas [{nombre, ejeId, anadidas, ausentes}],
 *   importados, tracksNuevos, omitidos [{nombre, motivo}].
 */
export async function importarArchivosLocales({ archivos, listas = [], dispositivo = 'movil' }, almacen = db) {
  const omitidos = [];
  const validos = [];
  const vistos = new Set();
  for (const a of archivos) {
    if (!a?.titulo || !a?.artista || !a?.uri) {
      omitidos.push({ nombre: a?.nombre ?? '', motivo: 'sin_datos' });
      continue;
    }
    if (vistos.has(a.uri)) {
      omitidos.push({ nombre: a.nombre, motivo: 'repetido' });
      continue;
    }
    vistos.add(a.uri);
    validos.push(a);
  }
  // Dos archivos con la misma canción (mismo id): solo se queda el primero.
  const ids = await idsDeFilas(validos.map((a) => filaDe(a)));
  const porId = new Map();
  validos.forEach((a, i) => {
    if (porId.has(ids[i])) omitidos.push({ nombre: a.nombre, motivo: 'repetido' });
    else porId.set(ids[i], a);
  });
  const unicos = [...porId.values()];

  let r = unicos.length
    ? await importarFilasLocal(unicos.map((a) => filaDe(a)), { nombrePlaylist: '', origen: 'local' }, almacen)
    : { tracksNuevos: 0, ejeLista: null };
  const tracksNuevos = r.tracksNuevos;

  for (const [id, a] of porId) {
    await guardarArchivoLocal(
      { trackId: id, dispositivo, uri: a.uri, nombre: a.nombre, tamano: a.tamano, mime: a.mime, portada: a.portada, persistente: true },
      almacen
    );
    if (a.duracionMs > 0) {
      const previa = await almacen.obtenerPorClave('metadataLocal', id);
      if (previa?.duracionMs == null) await almacen.guardarRegistro('metadataLocal', { ...previa, trackId: id, duracionMs: a.duracionMs });
    }
  }

  const resumenListas = [];
  let ejeLista = null;
  for (const lista of listas) {
    const nombre = nombreDeLista(lista.nombre);
    const { encontradas, ausentes } = emparejarEntradas(parsearPlaylist(lista.texto, lista.nombre), unicos);
    if (encontradas.length === 0) {
      resumenListas.push({ nombre, ejeId: null, anadidas: 0, ausentes: ausentes.length });
      continue;
    }
    const unicas = [...new Set(encontradas)];
    r = await importarFilasLocal(unicas.map((a) => filaDe(a, nombre)), { nombrePlaylist: nombre, origen: 'local' }, almacen);
    ejeLista = r.ejeLista ?? ejeLista;
    resumenListas.push({ nombre, ejeId: r.ejeLista, anadidas: unicas.length, ausentes: ausentes.length });
  }

  return {
    ok: true,
    tracksNuevos,
    importados: porId.size,
    omitidos,
    listas: resumenListas,
    ejeLista,
    tracks: await almacen.obtenerTodos('biblioteca'),
    ejes: await almacen.obtenerTodos('ejes'),
  };
}
