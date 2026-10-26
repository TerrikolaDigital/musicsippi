// src/movil/inicio/tarjetaSemana.js
// La ÚNICA banda de resumen de Inicio: «Tu semana en Musicsippi está lista» (solo los domingos) o el aviso del
// año. Aparece solo cuando toca y desaparece al abrirla (queda anotado en el móvil); los datos de consulta
// («Esta semana», «Tu artista») viven en Biblioteca › Estadísticas.
import { rangoResumen } from '../resumen/resumen.js';

const TEXTOS_RESUMEN = {
  semana: { titulo: 'Tu semana en Musicsippi está lista', sub: 'Tus canciones, tus artistas y tu hora favorita, en historias.' },
  anio: { titulo: 'Tu año en Musicsippi está listo', sub: 'Un repaso de todo lo que te ha sonado este año. Hasta hoy: se actualiza cada vez que lo abres.' },
  anioCompleto: { titulo: 'Tu año en Musicsippi, edición completa', sub: 'Con diciembre incluido. Ya no cambia: es tu año de verdad.' },
};

const CLAVE_VISTO = 'musicsippi-resumen-visto';

/**
 * Identifica "este" resumen para recordar que ya se abrió: la semana por su lunes de inicio y el año por
 * su número (la edición completa cuenta aparte, para volver a avisar cuando ya no cambia).
 */
export function claveResumen(periodo, { ahora = Date.now(), completo = false } = {}) {
  const r = rangoResumen(periodo, ahora);
  return periodo === 'anio' ? `anio:${r.anio}${completo ? ':completo' : ''}` : `semana:${r.desde}`;
}

/** ¿Ya se abrió este resumen? (localStorage; si falla, se considera no visto). */
export function resumenVisto(clave, almacen = globalThis.localStorage) {
  try {
    return JSON.parse(almacen?.getItem(CLAVE_VISTO) ?? '[]').includes(clave);
  } catch {
    return false;
  }
}

/** Anota que el resumen se abrió. Guarda solo los últimos 8 para no crecer sin fin. */
export function marcarResumenVisto(clave, almacen = globalThis.localStorage) {
  try {
    const vistos = JSON.parse(almacen?.getItem(CLAVE_VISTO) ?? '[]');
    if (vistos.includes(clave)) return;
    almacen?.setItem(CLAVE_VISTO, JSON.stringify([...vistos, clave].slice(-8)));
  } catch {
    // sin localStorage: la banda puede volver a salir; no es crítico
  }
}

/**
 * @param {{toca:('semana'|'anio'|null), anioCompleto?:boolean, visto?:boolean}} datos
 * @returns {{periodo:string, titulo:string, sub:string}|null} la banda, o null si no toca o ya se abrió.
 */
export function estadoTarjetaSemana({ toca, anioCompleto = false, visto = false }) {
  if (!toca || visto) return null;
  const t = TEXTOS_RESUMEN[toca === 'anio' && anioCompleto ? 'anioCompleto' : toca];
  return { periodo: toca, ...t };
}
