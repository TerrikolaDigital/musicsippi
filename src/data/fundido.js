// src/data/fundido.js
// «Fundido entre canciones»: 0 (apagado) a 12 s. En Android se hace en el servicio nativo
// (baja el volumen al final de una canción y lo sube al empezar la siguiente, mitad y mitad).
// «Sin fundido en álbumes»: dentro de un mismo álbum en reproducción secuencial no se funde,
// para no romper álbumes en directo o con pistas encadenadas.
export const FUNDIDO_MAX_S = 12;
export const FUNDIDO_POR_DEFECTO_S = 6; // sin valor guardado (instalación nueva o nunca tocado); un 0 elegido se respeta
export const EVENTO_FUNDIDO = 'musicsippi-fundido';
const CLAVE_SEGUNDOS = 'musicsippi-fundido-segundos';
const CLAVE_SIN_ALBUMES = 'musicsippi-fundido-sin-albumes';

/** Segundos válidos: entero entre 0 y 12; cualquier otra cosa -> el valor por defecto. */
export function normalizarFundido(valor) {
  if (valor === null || valor === undefined || valor === '') return FUNDIDO_POR_DEFECTO_S;
  const n = Number(valor);
  if (!Number.isFinite(n)) return FUNDIDO_POR_DEFECTO_S;
  return Math.min(FUNDIDO_MAX_S, Math.max(0, Math.round(n)));
}

export function leerFundido(almacen = globalThis.localStorage) {
  try {
    return normalizarFundido(almacen?.getItem(CLAVE_SEGUNDOS));
  } catch {
    return FUNDIDO_POR_DEFECTO_S;
  }
}

export function leerSinFundidoAlbumes(almacen = globalThis.localStorage) {
  try {
    return almacen?.getItem(CLAVE_SIN_ALBUMES) !== '0'; // activado por defecto
  } catch {
    return true;
  }
}

function avisar() {
  try {
    globalThis.dispatchEvent?.(new Event(EVENTO_FUNDIDO));
  } catch {
    // sin eventos (Node): nada que avisar
  }
}

export function guardarFundido(segundos, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE_SEGUNDOS, String(normalizarFundido(segundos)));
  } catch {
    // no crítico
  }
  avisar();
}

export function guardarSinFundidoAlbumes(activo, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE_SIN_ALBUMES, activo ? '1' : '0');
  } catch {
    // no crítico
  }
  avisar();
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * ¿La pista `actual` va encadenada con la `anterior` (mismo álbum del mismo artista, en
 * orden secuencial)? Con aleatorio nunca: dos pistas de un álbum que caen juntas son casualidad.
 */
export function encadenadaConAnterior(anterior, actual, { aleatorio = false } = {}) {
  if (aleatorio || !anterior || !actual) return false;
  const album = norm(actual.album);
  if (!album) return false;
  return album === norm(anterior.album) && norm(actual.artista) === norm(anterior.artista);
}
