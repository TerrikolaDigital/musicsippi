// src/movil/inicio/estadosAnimo.js
// Los estados de «¿Cómo te sientes?» que el usuario elige, ordena y edita. Cada uno es un mood de familia
// «estado» con `chipId`; lo que se puede editar viaja en el propio mood (así sale por ctx.guardarEjes al PC):
//   nombre, color, icono (id de CATALOGO_ICONOS), palabras (para afinar), animoVisible, animoOrden.
// Catálogo inicial: los 6 de siempre (visibles) y 4 sugerencias (ocultas hasta que se activan). Todo puro.
import { ANIMOS, animoDisponible } from './animo.js';
import { familiaDe } from '../modos.js';
import { sinTildes } from './comun.js';

export const MAX_ANIMOS = 10;
export const MAX_PALABRAS = 20;
export const CLAVE_RECIENTES = 'musicsippi-animo-recientes';

/** Sugerencias que no salen hasta que el usuario las activa. */
export const SUGERIDOS = [
  { id: 'lover', emoji: '💞', nombre: 'Lover', frase: 'Romance e intimidad', color: '#ff5d8f', icono: 'corazon', palabras: ['romantic', 'romantico', 'amor', 'love', 'balada', 'ballad', 'bachata', 'bolero'] },
  { id: 'retro', emoji: '📼', nombre: 'Retro', frase: 'Nostalgia y recuerdos', color: '#ffb454', icono: 'casete', palabras: ['retro', '80s', '90s', 'oldies', 'vintage', 'nostalg', 'clasico', 'classic'] },
  { id: 'free', emoji: '🕊️', nombre: 'Free', frase: 'Libertad y rebeldía', color: '#4fc3ff', icono: 'alas', palabras: ['free', 'libre', 'libertad', 'road', 'viaje', 'indie', 'folk'] },
  { id: 'chill', emoji: '☕', nombre: 'Chill', frase: 'Desconexión y relax', color: '#5fd8a4', icono: 'taza', palabras: ['chill', 'lofi', 'lo-fi', 'lounge', 'cafe', 'coffee', 'sunday', 'domingo'] },
];

/** Nombres por defecto anteriores: un mood que aún los lleva (no renombrado por el usuario) se muestra con el nuevo. */
const NOMBRES_ANTIGUOS = { tranquilo: 'Tranquilo', energia: 'Con energía', melancolico: 'Melancólico', fiesta: 'De fiesta', feliz: 'Feliz', inspirado: 'Inspirado' };

/** Id del mood-estado que corresponde a cada chip de siempre (el resto usa el mismo id). */
const ID_MOOD = { energia: 'con-energia', fiesta: 'de-fiesta' };
export const idMoodDe = (chipId) => ID_MOOD[chipId] ?? chipId;

const BASE = [
  ...ANIMOS.map((a) => ({ ...a, icono: a.id, visibleInicial: true })),
  ...SUGERIDOS.map((a) => ({ ...a, visibleInicial: false })),
];
const esEstadoEje = (e) => !!e && !e.sistema && familiaDe(e) === 'estado';

/** Texto de «Palabras para afinar» → lista limpia (separa por comas, saltos de línea o punto y coma). */
export function parsearPalabras(texto) {
  const vistas = new Set();
  const salida = [];
  for (const crudo of String(texto ?? '').split(/[,;\n]+/)) {
    const p = crudo.replace(/\s+/g, ' ').trim().toLowerCase();
    const clave = sinTildes(p);
    if (clave.length < 2 || vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(p);
    if (salida.length >= MAX_PALABRAS) break;
  }
  return salida;
}

export const palabrasATexto = (palabras) => (palabras ?? []).join(', ');

const ejeDeChip = (ejes, chipId) =>
  (ejes ?? []).find((e) => e.chipId === chipId && esEstadoEje(e)) ??
  (ejes ?? []).find((e) => e.id === idMoodDe(chipId) && esEstadoEje(e) && !e.chipId) ??
  null;

/**
 * Todos los estados de ánimo (visibles u ocultos) con sus valores efectivos. `visible` y `orden` salen del mood
 * (`animoVisible`, `animoOrden`); sin ellos, los de siempre están visibles en su orden y las sugerencias ocultas.
 * `animo.palabras` (las del emparejado por nombre de animo.js) suma las del usuario (`palabrasUsuario`).
 */
export function estadosAnimo(ejes) {
  const items = BASE.map((b, i) => {
    const eje = ejeDeChip(ejes, b.id);
    const propias = Array.isArray(eje?.palabras) ? eje.palabras : [];
    return {
      id: b.id,
      ejeId: eje?.id ?? null,
      eje,
      propio: false,
      sugerido: !b.visibleInicial,
      nombre: eje?.nombre && eje.nombre !== NOMBRES_ANTIGUOS[b.id] ? eje.nombre : b.nombre,
      frase: b.frase ?? '',
      color: eje?.color || b.color,
      icono: eje?.icono || b.icono,
      emoji: b.emoji,
      palabrasUsuario: propias,
      palabras: [...b.palabras, ...propias],
      visible: typeof eje?.animoVisible === 'boolean' ? eje.animoVisible : b.visibleInicial,
      orden: Number.isFinite(eje?.animoOrden) ? eje.animoOrden : i,
    };
  });
  const conocidos = new Set(BASE.map((b) => b.id));
  const usados = new Set(items.map((x) => x.ejeId).filter(Boolean));
  const propios = (ejes ?? [])
    .filter((e) => esEstadoEje(e) && e.chipId && !conocidos.has(e.chipId) && !usados.has(e.id) && e.activo !== false)
    .map((eje, i) => {
      const propias = Array.isArray(eje.palabras) ? eje.palabras : [];
      return {
        id: eje.chipId,
        ejeId: eje.id,
        eje,
        propio: true,
        sugerido: false,
        nombre: eje.nombre,
        frase: '',
        color: eje.color || '#7c8cff',
        icono: eje.icono || 'corazon',
        emoji: '🎵',
        palabrasUsuario: propias,
        palabras: propias,
        visible: eje.animoVisible !== false,
        orden: Number.isFinite(eje.animoOrden) ? eje.animoOrden : 100 + i,
      };
    });
  return [...items, ...propios].sort((a, b) => a.orden - b.orden);
}

/** Estados que salen en el carrusel (visibles, como mucho MAX_ANIMOS), en el orden elegido. */
export const estadosVisibles = (ejes) => estadosAnimo(ejes).filter((e) => e.visible).slice(0, MAX_ANIMOS);

/** El objeto «ánimo» que entiende `resolverAnimo` / `etiquetaAnimo` (id = chipId, palabras sumadas). */
export const animoDeEstado = (e) => ({ id: e.id, emoji: e.emoji, nombre: e.nombre, color: e.color, palabras: e.palabras });

/** Ánimo de un mood-estado (para su tarjeta): el estado por su `chipId`, con sus iconos y color propios. */
export function estadoDeEje(eje, ejes = [eje]) {
  if (!eje?.chipId) return null;
  return estadosAnimo(ejes.some((e) => e.id === eje.id) ? ejes : [...ejes, eje]).find((x) => x.id === eje.chipId) ?? null;
}

/**
 * Los que se enseñan en Inicio: visibles y, salvo los propios o los que el usuario activó, con música (`animoDisponible`).
 * `recientes` (ids, el último usado primero) pasan por delante; el resto sigue el orden elegido.
 */
export function carruselAnimo(ejes, datos, recientes = []) {
  const lista = estadosVisibles(ejes).filter((e) => e.propio || e.eje?.animoVisible === true || animoDisponible(animoDeEstado(e), { ...datos, ejes }));
  return ordenarConRecientes(lista, recientes);
}

export function ordenarConRecientes(lista, recientes = []) {
  const rango = (id) => {
    const i = recientes.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  return lista
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rango(a.e.id) - rango(b.e.id) || a.i - b.i)
    .map((x) => x.e);
}

/** Lista de recientes tras usar `id`: primero él, sin repetir, como mucho MAX_ANIMOS. */
export const marcarReciente = (recientes, id) => [id, ...(recientes ?? []).filter((x) => x !== id)].slice(0, MAX_ANIMOS);

// --- Edición --------------------------------------------------------------------------------------------

const slug = (t) =>
  sinTildes(t)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Id libre para un estado nuevo (ni mood ni chip ni estado de siempre lo usan). */
export function idLibre(nombre, ejes) {
  const base = slug(nombre) || 'estado';
  const ocupados = new Set([...(ejes ?? []).flatMap((e) => [e.id, e.chipId]), ...BASE.map((b) => b.id), ...Object.values(ID_MOOD)].filter(Boolean));
  let id = base;
  for (let n = 2; ocupados.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Mood-estado nuevo: familia estado, «Se rellena sola» activado y chip propio. */
export function ejeEstadoNuevo({ id, idMood = id, nombre, color, icono, palabras }, ejes) {
  const ordenes = (ejes ?? []).filter((e) => !e.sistema).map((e) => e.orden).filter(Number.isFinite);
  return {
    id: idMood,
    nombre,
    tipo: 'funcional',
    orden: ordenes.length ? Math.max(...ordenes) + 1 : 1,
    activo: true,
    sistema: false,
    padre: null,
    descripcion: 'Estado de ánimo de Inicio.',
    anclas: { artistas: [], titulos: [] },
    tagsLastfm: [],
    origen: 'descubierto',
    familia: 'estado',
    autoRellenar: true,
    chipId: id,
    color,
    icono,
    palabras: palabras ?? [],
  };
}

/**
 * Copia de `ejes` con el estado de cada elemento de `lista` (el orden de la lista es el orden del carrusel).
 * Solo se crea el mood de los visibles, los propios y los que se han personalizado; un estado de siempre que
 * se deja como estaba sin mood no crea nada. Los visibles se numeran 0..n−1 y los ocultos conservan su valor.
 */
export function ejesConEstados(ejes, lista) {
  const resultado = [...ejes];
  let orden = 0;
  for (const it of lista) {
    const base = BASE.find((b) => b.id === it.id) ?? null;
    const campos = {
      nombre: it.nombre,
      color: it.color,
      icono: it.icono,
      palabras: it.palabrasUsuario ?? [],
      animoVisible: !!it.visible,
      ...(it.visible ? { animoOrden: orden++ } : {}),
    };
    const idx = it.ejeId ? resultado.findIndex((e) => e.id === it.ejeId) : -1;
    if (idx >= 0) {
      resultado[idx] = { ...resultado[idx], ...campos, chipId: resultado[idx].chipId ?? it.id };
      continue;
    }
    const cambiado =
      !base || it.nombre !== base.nombre || it.color !== base.color || it.icono !== base.icono || (it.palabrasUsuario ?? []).length > 0;
    if (!it.visible && !cambiado) continue;
    resultado.push({
      ...ejeEstadoNuevo(
        { id: it.id, idMood: it.ejeId ?? idMoodDe(it.id), nombre: it.nombre, color: it.color, icono: it.icono, palabras: it.palabrasUsuario },
        resultado,
      ),
      ...campos,
    });
  }
  return resultado;
}

/** Mueve el elemento `id` entre los visibles `delta` puestos (−1 sube, +1 baja). Devuelve la lista nueva. */
export function moverVisible(lista, id, delta) {
  const visibles = lista.filter((e) => e.visible);
  const i = visibles.findIndex((e) => e.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= visibles.length) return lista;
  const orden = [...visibles];
  [orden[i], orden[j]] = [orden[j], orden[i]];
  let k = 0;
  return lista.map((e) => (e.visible ? orden[k++] : e));
}

/** Muestra u oculta un estado. Al mostrar va al final de los visibles; devuelve null si ya hay MAX_ANIMOS. */
export function conVisible(lista, id, visible) {
  const it = lista.find((e) => e.id === id);
  if (!it || it.visible === visible) return lista;
  if (visible && lista.filter((e) => e.visible).length >= MAX_ANIMOS) return null;
  const resto = lista.filter((e) => e.id !== id);
  const ultimoVisible = resto.map((e) => e.visible).lastIndexOf(true);
  const nuevo = { ...it, visible };
  return [...resto.slice(0, ultimoVisible + 1), nuevo, ...resto.slice(ultimoVisible + 1)];
}

/** Copia de `ejes` sin el estado propio `ejeId` (las canciones no se tocan). Solo los propios se pueden borrar. */
export function sinEstadoPropio(ejes, ejeId) {
  const eje = ejes.find((e) => e.id === ejeId);
  if (!eje || !eje.chipId || BASE.some((b) => b.id === eje.chipId)) return ejes;
  return ejes.filter((e) => e.id !== ejeId).map((e) => (e.padre === ejeId ? { ...e, padre: null } : e));
}
