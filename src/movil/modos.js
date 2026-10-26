// src/movil/modos.js
const TIPOS = { gusto: ['gusto'], funcional: ['funcional'], listas: ['playlist'] };

/** Un modo es visible salvo que `activo` sea false (misma regla que Inicio, Modos y estadísticas). */
export const modoVisible = (eje) => eje?.activo !== false;

/** Copia de `ejes` con el modo `id` visible u oculto (activo siempre booleano). */
export function conVisibilidad(ejes, id, visible) {
  return ejes.map((e) => (e.id === id ? { ...e, activo: !!visible } : e));
}

export function filtrarModos(ejes, filtro, conteos) {
  return ejes
    // Un mood recién creado a mano (`creadoPorUsuario`) sale aunque aún no tenga canciones: si no, «crear» parecería no hacer nada.
    .filter((e) => e.tipo !== 'sistema' && !e.sistema && e.activo !== false && ((conteos.get(e.id) ?? 0) > 0 || e.creadoPorUsuario === true))
    .filter((e) => filtro === 'todos' || (TIPOS[filtro] ?? []).includes(e.tipo))
    .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Familia de un mood: 'estado' (cómo te sientes o qué haces), 'genero' (cómo suena) o 'fijo' (no se rellena
 * solo: listas importadas o hechas a mano). Antes de migrar los datos no hay `familia`: se deduce del tipo
 * antiguo (playlist = fijo, funcional = estado, el resto = género).
 */
export function familiaDe(eje) {
  if (eje?.familia === 'estado' || eje?.familia === 'genero' || eje?.familia === 'fijo') return eje.familia;
  if (eje?.autoRellenar === false || eje?.tipo === 'playlist') return 'fijo';
  return eje?.tipo === 'funcional' ? 'estado' : 'genero';
}

/**
 * ¿El organizador puede añadirle canciones solo? Lo guardado (`autoRellenar`) manda; sin él, como las listas
 * (playlist/fijo) no se rellenan solas y el resto sí.
 */
export const seRellenaSola = (eje) => (typeof eje?.autoRellenar === 'boolean' ? eje.autoRellenar : familiaDe(eje) !== 'fijo');

/** Copia de `ejes` con «Se rellena sola» del mood `id` en `valor` (siempre booleano). */
export function conAutoRellenar(ejes, id, valor) {
  return ejes.map((e) => (e.id === id ? { ...e, autoRellenar: !!valor } : e));
}

export const TEXTO_AUTO_RELLENAR = 'Activado: el organizador añade solo canciones nuevas que encajen. Desactivado: solo las que tú pongas (como una lista).';

export const esEstado = (eje) => familiaDe(eje) === 'estado';

export const SECCIONES_MOODS = [
  ['estado', 'Estados'],
  ['genero', 'Géneros'],
  ['fijo', 'Listas'],
];

/** Moods visibles con canciones, agrupados por familia en el orden de SECCIONES_MOODS (sin las vacías). */
export function seccionesDeModos(ejes, conteos) {
  const lista = filtrarModos(ejes, 'todos', conteos);
  return SECCIONES_MOODS.map(([id, titulo]) => ({ id, titulo, modos: lista.filter((e) => familiaDe(e) === id) })).filter((s) => s.modos.length > 0);
}

/** ¿Hay moods propios que no salen en Moods (ocultos o sin canciones)? Distingue «no hay moods» de «están todos vacíos u ocultos». */
export function hayModosSinMostrar(ejes) {
  return ejes.some((e) => e.tipo !== 'sistema' && !e.sistema);
}

export const ORDENES_EDITOR = [
  ['alfabetico', 'A–Z'],
  ['canciones', 'Más canciones'],
];

const colador = new Intl.Collator('es', { sensitivity: 'base' });

/** Copia de `ejes` ordenada alfabéticamente o por número de canciones (de más a menos). */
export function ordenarModos(ejes, criterio, conteos) {
  const porNombre = (a, b) => colador.compare(a.nombre ?? '', b.nombre ?? '');
  const copia = [...ejes];
  if (criterio === 'canciones') {
    return copia.sort((a, b) => (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0) || porNombre(a, b));
  }
  return copia.sort(porNombre);
}

/** Quita los modos o listas sin canciones. `conservar`: ids que se dejan aunque estén vacíos. */
export function sinVacios(ejes, conteos, conservar = []) {
  return ejes.filter((e) => (conteos.get(e.id) ?? 0) > 0 || conservar.includes(e.id));
}

/** Modos y listas que admiten «Unir con…» (cualquiera que no sea de sistema). Misma regla que scripts/lib/unir-modos.mjs. */
export const esUnible = (e) => !!e && e.tipo !== 'sistema' && !e.sistema;

/** Otros modos y listas a los que se puede unir `ejeId`, A-Z, con su nº de canciones. */
export function modosParaUnir(ejes, conteos, ejeId) {
  const otros = ejes.filter(
    (e) => e.id !== ejeId && esUnible(e) && e.activo !== false,
  );
  return ordenarModos(otros, 'alfabetico', conteos).map((eje) => ({ eje, n: conteos.get(eje.id) ?? 0 }));
}

/** Pregunta de confirmación al unir dos modos. */
export function preguntaUnir(n, origen, destino) {
  const canciones = n === 1 ? 'la canción' : `las ${n} canciones`;
  return `¿Pasar ${canciones} de “${origen}” a “${destino}” y borrar “${origen}”?`;
}

/** Opciones de «Crear»: el valor es lo que se pasa a `camposDeMoodNuevo`. */
export const FAMILIAS_NUEVO = [
  ['estado', 'Estado', 'Cómo te sientes o qué haces'],
  ['genero', 'Género', 'Cómo suena'],
];

/**
 * Campos que `crearEje` añade a un mood creado a mano. 'fijo' = lista que no se rellena sola (sección Listas);
 * 'estado' y 'genero' sí se rellenan. `creadoPorUsuario` lo mantiene visible aunque aún esté vacío.
 */
export function camposDeMoodNuevo(familia) {
  const f = familia === 'estado' || familia === 'genero' ? familia : 'fijo';
  return {
    familia: f,
    autoRellenar: f !== 'fijo',
    creadoPorUsuario: true,
    tipo: f === 'fijo' ? 'playlist' : f === 'estado' ? 'funcional' : 'gusto',
  };
}
