/**
 * Repara ejes duplicados que la propia app generó, en bibliotecas que YA
 * quedaron con el problema. Los dos arreglos de raíz (aplicar-modos.mjs para
 * los modos, importar-tunemymusic.mjs para las favoritas) evitan que vuelva a
 * pasar, pero no deshacen lo que está en disco: sin esto, cualquiera que ya
 * haya corrido el enriquecimiento se queda con los duplicados para siempre.
 *
 * Dos casos, los dos medidos en una biblioteca real antes de escribir esto:
 *
 *  1. Modos descubiertos con el MISMO nombre ("Electronic" y "Electronic",
 *     "Latin" y "Latin", "House" y "House"). El descubrimiento re-corría en
 *     cada ciclo de enriquecimiento y volvía a crear el modo con sufijo -2,
 *     -3... Los conjuntos de canciones eran DISJUNTOS (0 en común), o sea que
 *     era el mismo modo partido en dos, no dos cosas parecidas.
 *
 *  2. Una lista importada que es la colección de "me gusta" con otro nombre
 *     ("Mis favoritas" junto a "Favoritas"). Las 83 canciones de la lista
 *     estaban las 83 en Favoritas, ninguna exclusiva.
 *
 * Lo que NO toca, a propósito: una lista que armó el usuario y un modo
 * automático con el mismo nombre (la playlist "Rock" y el modo "Rock"). Se
 * solapaban 33 de 263: son cosas distintas, y volcar 230 canciones
 * automáticas dentro de una lista de una persona la destruye. Eso se resuelve
 * mostrando bien las dos, no fusionándolas.
 *
 * Idempotente: correrlo sobre una biblioteca sana no cambia nada y devuelve
 * `huboCambios: false`, así puede correr en cada arranque sin condicionarlo a
 * ninguna marca de "ya migré" que después haya que mantener.
 */
import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizar } from './clasificar.mjs';
import { esNombreDeFavoritos } from './nombres-favoritos.mjs';
import { escribirAtomico } from './escribir-atomico.mjs';

/** Misma clave que usa aplicar-modos.mjs para decidir si dos modos son el mismo. */
function claveNombre(nombre) {
  return normalizar(nombre ?? '')
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Arma el mapa viejoId -> idQueSobrevive. Solo lee; no cambia nada.
 */
function planificar(ejes) {
  const remap = new Map();
  const modosFusionados = [];
  const listasAbsorbidas = [];

  // Caso 1: modos descubiertos que comparten nombre.
  const porNombre = new Map();
  for (const e of ejes) {
    if (e?.origen !== 'descubierto' || !e.nombre) continue;
    const clave = claveNombre(e.nombre);
    if (!clave) continue;
    if (!porNombre.has(clave)) porNombre.set(clave, []);
    porNombre.get(clave).push(e);
  }
  for (const grupo of porNombre.values()) {
    if (grupo.length < 2) continue;
    // Gana el más viejo (orden más bajo): es el que ya tiene historial,
    // "últimos modos" y, si alguien lo renombró a mano, ese nombre.
    const [sobrevive, ...clones] = [...grupo].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    for (const clon of clones) remap.set(clon.id, sobrevive.id);
    modosFusionados.push({ nombre: sobrevive.nombre, hacia: sobrevive.id, desde: clones.map((c) => c.id) });
  }

  // Caso 2: listas importadas que son "tus me gusta" con otro nombre. Requiere
  // que el eje del sistema exista: si no, la lista es lo único que tiene esas
  // canciones marcadas y sacarla perdería el dato.
  const hayFavoritos = ejes.some((e) => e?.id === 'favoritos');
  if (hayFavoritos) {
    for (const e of ejes) {
      if (e?.id === 'favoritos' || e?.tipo !== 'playlist') continue;
      if (!esNombreDeFavoritos(e.nombre)) continue;
      remap.set(e.id, 'favoritos');
      listasAbsorbidas.push({ nombre: e.nombre, id: e.id });
    }
  }

  return { remap, modosFusionados, listasAbsorbidas };
}

/**
 * Aplica la reparación mutando en el lugar `ejesData`, `biblioteca`,
 * `historial` y `ultimosModos` (los dos últimos opcionales). No escribe a
 * disco: eso lo decide el llamador, igual que aplicarModosConfirmados.
 *
 * Devuelve `{ huboCambios, modosFusionados, listasAbsorbidas, tracksTocados }`.
 */
export function repararDuplicados({ ejesData, biblioteca, historial = [], ultimosModos = [] }) {
  const { remap, modosFusionados, listasAbsorbidas } = planificar(ejesData.ejes ?? []);
  if (remap.size === 0) {
    return { huboCambios: false, modosFusionados: [], listasAbsorbidas: [], tracksTocados: 0 };
  }

  ejesData.ejes = (ejesData.ejes ?? []).filter((e) => !remap.has(e?.id));
  const nombrePorId = new Map(ejesData.ejes.map((e) => [e.id, e.nombre]));
  const destino = (id) => remap.get(id) ?? id;

  let tracksTocados = 0;
  for (const track of biblioteca.tracks ?? []) {
    if (!(track.ejes ?? []).some((a) => remap.has(a?.ejeId))) continue;
    tracksTocados++;
    // Un track podía estar en los dos ejes a la vez (el caso de "Mis
    // favoritas", que era subconjunto de "Favoritas"): tras reapuntar quedan
    // dos pertenencias al mismo eje. Se conserva la primera, que es la del
    // eje que sobrevive cuando ya estaba ahí.
    const vistos = new Set();
    track.ejes = track.ejes
      .map((a) => ({ ...a, ejeId: destino(a.ejeId) }))
      .filter((a) => !vistos.has(a.ejeId) && vistos.add(a.ejeId));
  }

  // El historial guarda ejeId y ejeNombre: sin reapuntarlo, las
  // reproducciones del clon dejan de contar para el modo que sobrevive y el
  // Home reordena mal ("lo que más escuchás").
  for (const entrada of historial) {
    if (!remap.has(entrada?.ejeId)) continue;
    entrada.ejeId = destino(entrada.ejeId);
    entrada.ejeNombre = nombrePorId.get(entrada.ejeId) ?? entrada.ejeNombre;
  }

  // "Seguí escuchando" llegó a mostrar el clon Y el original como dos
  // tarjetas idénticas; tras reapuntar hay que deduplicar, sin perder el orden.
  if (Array.isArray(ultimosModos)) {
    const vistos = new Set();
    const deduplicados = ultimosModos.map(destino).filter((id) => !vistos.has(id) && vistos.add(id));
    ultimosModos.length = 0;
    ultimosModos.push(...deduplicados);
  }

  return { huboCambios: true, modosFusionados, listasAbsorbidas, tracksTocados };
}

function leerJson(ruta, porDefecto) {
  if (!existsSync(ruta)) return porDefecto;
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    return porDefecto;
  }
}

/**
 * Versión que lee y escribe `dataDir`. Solo escribe si hubo algo que reparar.
 *
 * Antes de la primera escritura deja una copia de biblioteca.json y ejes.json
 * (sufijo `.antes-de-reparar.bak`, nunca se pisa): esta reparación es la única
 * cosa que borra ejes enteros sin que nadie lo pida, así que conviene que haya
 * de dónde volver. Devuelve el resumen, o null si no hizo falta tocar nada.
 */
export function repararDuplicadosEnDisco(dataDir) {
  const rutaEjes = join(dataDir, 'ejes.json');
  const rutaBib = join(dataDir, 'biblioteca.json');
  const rutaHist = join(dataDir, 'historial.json');
  const rutaUltimos = join(dataDir, 'ultimos-modos.json');

  const ejesData = leerJson(rutaEjes, null);
  const biblioteca = leerJson(rutaBib, null);
  if (!ejesData?.ejes || !Array.isArray(biblioteca?.tracks)) return null;

  const historial = leerJson(rutaHist, []);
  const ultimosModos = leerJson(rutaUltimos, []);
  const resumen = repararDuplicados({
    ejesData,
    biblioteca,
    historial: Array.isArray(historial) ? historial : [],
    ultimosModos: Array.isArray(ultimosModos) ? ultimosModos : [],
  });
  if (!resumen.huboCambios) return null;

  for (const ruta of [rutaBib, rutaEjes]) {
    const respaldo = `${ruta}.antes-de-reparar.bak`;
    if (!existsSync(respaldo)) copyFileSync(ruta, respaldo);
  }

  escribirAtomico(rutaEjes, ejesData);
  escribirAtomico(rutaBib, biblioteca);
  if (existsSync(rutaHist) && Array.isArray(historial)) escribirAtomico(rutaHist, historial);
  if (existsSync(rutaUltimos) && Array.isArray(ultimosModos)) escribirAtomico(rutaUltimos, ultimosModos);
  return resumen;
}
