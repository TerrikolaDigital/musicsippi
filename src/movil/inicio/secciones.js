// src/movil/inicio/secciones.js
// Registro de las secciones de Inicio y la elección (determinista por fecha) de las rotativas.
// - fija: siempre se ve (si el usuario no la apaga).
// - rotativa: cada día se enseñan 2 como mucho, elegidas por fecha para que no cambien al reabrir.
// Orden de pantalla (campo `orden`): Mood del momento, ¿Cómo te sientes?, Favoritas e Infinito, la banda
// del resumen (solo cuando toca), Creado para ti, Sigue escuchando, Tus géneros y las rotativas.
// - propia: siempre se monta; el componente decide si hay algo que enseñar (Resumen).
// `archivo`: componente en src/movil/inicio/<archivo>.jsx; sin archivo, lo pinta InicioMovil.
import { claveDia, hashTexto } from './comun.js';

export const SECCIONES = [
  { id: 'modo-momento', titulo: 'Mood del momento', tipo: 'fija', orden: 10 },
  { id: 'animo', titulo: '¿Cómo te sientes?', tipo: 'fija', orden: 20, archivo: 'SeccionAnimo' },
  { id: 'accesos', titulo: 'Favoritas e Infinito', tipo: 'fija', orden: 30 },
  { id: 'estadisticas', titulo: 'Resumen de la semana', tipo: 'fija', orden: 35 },
  { id: 'creado-para-ti', titulo: 'Creado para ti', tipo: 'fija', orden: 40, archivo: 'SeccionCreadoParaTi' },
  { id: 'sigue-escuchando', titulo: 'Sigue escuchando', tipo: 'fija', orden: 50 },
  { id: 'generos', titulo: 'Tus géneros', tipo: 'fija', orden: 60 },
  { id: 'descubrimiento', titulo: 'Descubrimiento semanal', tipo: 'rotativa', orden: 70, archivo: 'SeccionDescubrimiento' },
  { id: 'novedades', titulo: 'Lo nuevo de tus artistas', tipo: 'rotativa', orden: 75, archivo: 'SeccionNovedades' },
  { id: 'tendencias', titulo: 'Tendencias en tu estilo', tipo: 'rotativa', orden: 80, archivo: 'SeccionTendencias' },
  { id: 'parecidos', titulo: 'También te podría gustar', tipo: 'rotativa', orden: 85, archivo: 'SeccionArtistasParecidos' },
  { id: 'capsula', titulo: 'Cápsula del tiempo', tipo: 'rotativa', orden: 90, archivo: 'SeccionCapsula' },
  { id: 'joyas', titulo: 'Joyas escondidas', tipo: 'rotativa', orden: 95, archivo: 'SeccionJoyas' },
  { id: 'mezcla-modos', titulo: 'Mezcla de dos moods', tipo: 'rotativa', orden: 100, archivo: 'SeccionMezclaModos' },
  { id: 'olvidadas', titulo: 'Hace tiempo que no escuchas', tipo: 'rotativa', orden: 105, archivo: 'SeccionOlvidadas' },
];

/** Secciones que ya no existen y la que las sustituye (la preferencia «nunca» se traslada). */
export const SECCIONES_RENOMBRADAS = { recientes: 'sigue-escuchando', 'tus-artistas': 'generos' };

/** Tope de rotativas «a veces» por día. */
export const MAX_ROTATIVAS = 2;

/** Cuántas rotativas se intentan enseñar ese día (fijo: 2). */
export function cuantasRotativas() {
  return MAX_ROTATIVAS;
}

/** Descubrimiento semanal sale siempre los lunes. */
export const esLunes = (fecha = new Date()) => new Date(fecha).getDay() === 1;

/** Rotativas que dependen de la red (Deezer, MusicBrainz…): sin conexión no tienen contenido. */
export const EXTERNAS = ['descubrimiento', 'novedades', 'tendencias', 'parecidos'];

/** Secciones que no se pueden quitar (`obligatoria: true` en el registro); hoy ninguna. */
export const esObligatoria = (id) => SECCIONES.find((s) => s.id === id)?.obligatoria === true;

/** «siempre» para las fijas, «aveces» (rotación diaria) para las rotativas. */
export function modoPorDefecto(id) {
  return SECCIONES.find((s) => s.id === id)?.tipo === 'rotativa' ? 'aveces' : 'siempre';
}

/** Modo elegido para la sección: 'siempre' | 'aveces' | 'nunca'. */
export const modoSeccion = (config, id) => config?.modos?.[id] ?? modoPorDefecto(id);

/**
 * Ids de las rotativas que no están en «nunca», en el orden en que se prueban hoy: primero las
 * de «siempre» (en su orden fijo; salen todas las que tengan datos) y luego las de «a veces»,
 * barajadas por fecha. Quien las pinta enseña las de «siempre» con contenido y, de las de
 * «a veces», las primeras `max` que tengan contenido.
 */
export function rotativasDelDia(fecha, config) {
  const activas = SECCIONES.filter((s) => s.tipo === 'rotativa' && modoSeccion(config, s.id) !== 'nunca');
  const siempre = activas.filter((s) => modoSeccion(config, s.id) === 'siempre').map((s) => s.id);
  const dia = claveDia(fecha);
  let aveces = activas
    .filter((s) => modoSeccion(config, s.id) === 'aveces')
    .map((s) => ({ id: s.id, k: hashTexto(`${dia}:${s.id}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.id);
  if (esLunes(fecha) && aveces.includes('descubrimiento')) aveces = ['descubrimiento', ...aveces.filter((x) => x !== 'descubrimiento')];
  return { ids: [...siempre, ...aveces], max: cuantasRotativas(fecha) };
}

/** Ids de las rotativas en «siempre»: no cuentan para el tope diario. */
export const rotativasSiempre = (config) =>
  SECCIONES.filter((s) => s.tipo === 'rotativa' && modoSeccion(config, s.id) === 'siempre').map((s) => s.id);

const DIAS_MES = 30;
const MIN_ESCUCHAS_JOYAS = 15;
const MIN_CANCIONES_MODO = 6;

/**
 * Motivo (texto corto) por el que la sección no tendría contenido hoy, o null si lo tiene o no
 * se puede saber. `datos`: { historial, enLinea, modosConCanciones, ahora }; lo que falte se
 * da por bueno.
 */
export function motivoSinDatos(id, datos = {}) {
  const ahora = datos.ahora ?? Date.now();
  const historial = datos.historial;
  if (EXTERNAS.includes(id) && datos.enLinea === false) return 'necesita conexión';
  if (id === 'capsula' && Array.isArray(historial)) {
    const primera = historial.reduce((m, h) => (h?.ts < m ? h.ts : m), Infinity);
    if (!(ahora - primera > (DIAS_MES + 3) * 86400000)) return 'necesita un mes de historial';
  }
  if (id === 'joyas' && Array.isArray(historial) && historial.length < MIN_ESCUCHAS_JOYAS) {
    return `escucha un poco más (${MIN_ESCUCHAS_JOYAS} canciones)`;
  }
  if (id === 'mezcla-modos' && Number.isFinite(datos.modosConCanciones) && datos.modosConCanciones < 2) {
    return `necesita dos moods con ${MIN_CANCIONES_MODO} canciones`;
  }
  return null;
}

/**
 * Estado de una sección para Ajustes > Inicio.
 * @returns {{ estado: 'nunca'|'hoy'|'noToca'|'sinDatos', texto: string }}
 */
export function estadoSeccionHoy(id, { config, fecha = new Date(), datos = {} } = {}) {
  const modo = modoSeccion(config, id);
  if (modo === 'nunca') return { estado: 'nunca', texto: 'No sale en Inicio' };
  const motivo = motivoSinDatos(id, { ...datos, ahora: new Date(fecha).getTime() });
  if (motivo) return { estado: 'sinDatos', texto: `Aún sin datos: ${motivo}` };
  if (modo === 'aveces') {
    const { ids, max } = rotativasDelDia(fecha, config);
    const cola = ids.filter((x) => modoSeccion(config, x) === 'aveces' && !motivoSinDatos(x, { ...datos, ahora: new Date(fecha).getTime() }));
    if (cola.indexOf(id) >= max || !cola.includes(id)) return { estado: 'noToca', texto: 'Hoy no le toca; saldrá otro día' };
  }
  return { estado: 'hoy', texto: 'Hoy en Inicio' };
}
