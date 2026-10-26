// src/movil/avisos.js
// Textos del aviso no bloqueante (.m-toast) para acciones de reproducción que
// de otro modo parecen no hacer nada (la canción tarda en resolverse).

export function pluralCanciones(n) {
  return n === 1 ? '1 canción' : `${n} canciones`;
}

export function avisoInfinito(n) {
  return n > 0 ? 'Infinito: mezclando toda tu biblioteca' : 'Infinito: tu biblioteca está vacía, importa música primero';
}

export function avisoFavoritas(n) {
  return n > 0
    ? `Favoritas en aleatorio · ${pluralCanciones(n)}`
    : 'Aún no tienes favoritas: marca canciones con el corazón';
}

export function avisoModo(nombre, n, aleatorio) {
  if (!(n > 0)) return `«${nombre}» no tiene canciones todavía`;
  return `${nombre}${aleatorio ? ' en aleatorio' : ''} · ${pluralCanciones(n)}`;
}

export function avisoRadio(titulo, creando = false) {
  return creando ? `Creando radio de «${titulo}»…` : `Radio de «${titulo}»`;
}

// Descarga de la primera organización: modelo q8 (~118 MB) + tokenizer
// (~17 MB) + runtime WASM (~24 MB). Ajustar si la Task 1 cambió el dtype.
export const MB_DESCARGA_ORGANIZADOR = 160;

const DETALLE_FASE = { generos: 'Buscando géneros', modos: 'Creando moods' };

/** Aviso fijo mientras el organizador trabaja; null cuando no hay nada que mostrar. */
export function textoProgreso(e) {
  if (!e || e.fase === 'inactivo' || e.fase === 'listo') return null;
  if (e.fase === 'preparando') {
    const conDescarga = Number.isFinite(e.descarga);
    return {
      texto: 'Preparando el organizador',
      detalle: conDescarga ? `Descargando el modelo: ${e.descarga} %` : `La primera vez descarga unos ${MB_DESCARGA_ORGANIZADOR} MB`,
      porcentaje: conDescarga ? e.descarga : null,
    };
  }
  if (e.fase === 'aplicado') return { texto: 'Ya hay moods nuevos', detalle: 'Sigo buscando géneros para el resto', porcentaje: null };
  if (e.fase === 'esperando-wifi') {
    return {
      texto: 'Organizaré tus canciones cuando estés con WiFi',
      detalle: `La primera vez hay que descargar unos ${MB_DESCARGA_ORGANIZADOR} MB`,
      porcentaje: null,
    };
  }
  if (e.fase === 'error') return { texto: e.mensaje, detalle: null, porcentaje: null };
  const conTotal = e.total > 0;
  return {
    texto: conTotal ? `Organizando tu música… ${e.hechas}/${e.total}` : 'Organizando tu música…',
    detalle: DETALLE_FASE[e.fase] ?? null,
    porcentaje: conTotal ? Math.round((e.hechas / e.total) * 100) : null,
  };
}

/**
 * Una pasada automática (motivo 'auto' o reanudada) trabaja en segundo plano: no pinta la barra,
 * solo un indicador pequeño en Inicio. La barra queda para lo que el usuario lanzó (importar, «Usar datos»).
 */
export function esSegundoPlano(estado, manual) {
  return !manual && !!estado && estado.fase !== 'inactivo';
}

/** Aviso breve al terminar de organizar; null si no se colocó nada (no hay nada que contar). */
export function textoResumen({ colocadas = 0 }) {
  if (!(colocadas > 0)) return null;
  return colocadas === 1 ? 'Hemos colocado 1 canción en tus moods' : `Hemos colocado ${colocadas} canciones en tus moods`;
}
