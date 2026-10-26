// Qué canciones cuentan como «sin modo»: ningún eje salvo «sin-clasificar» y favoritas.
// Lo usan el organizador (para saber qué procesar), Inicio/Ajustes (para contarlas) y
// el aviso final, así que las cuentas no pueden separarse.
const IGNORADOS = new Set(['sin-clasificar', 'favoritos']);

export const esSinModo = (t) => !(t.ejes ?? []).some((e) => e.ejeId && !IGNORADOS.has(e.ejeId));

// R7: el organizador de géneros atiende también a las canciones que tienen un estado (Zen, Power…) pero ningún
// mood que no sea estado (género, Bandas sonoras, lista fija o un modo antiguo): un estado no es un género.
export const idsDeEstado = (ejes) => new Set((ejes ?? []).filter((e) => e.familia === 'estado').map((e) => e.id));

/** ¿Le falta género? Sin modo alguno, o solo con estados. `estados`: ids de eje de familia estado (idsDeEstado). */
export const necesitaGenero = (t, estados) => !(t.ejes ?? []).some((e) => e.ejeId && !IGNORADOS.has(e.ejeId) && !estados.has(e.ejeId));

// Protección contra bucles de reanudación (ver coordinador.js); aquí para poder leerla sin cargar el organizador.
export const CLAVE_INTENTOS_REANUDAR = 'intentosReanudar';
export const MAX_INTENTOS_REANUDAR = 2;

export const CLAVE_SIN_COLOCAR = 'sinColocar';

export const MOTIVOS_SIN_COLOCAR = {
  'sin-generos': 'No se encontraron géneros para esta canción',
  'sin-modo-afin': 'Ningún mood encaja lo bastante',
  'sin-datos': 'Todavía no se ha intentado organizar',
};
