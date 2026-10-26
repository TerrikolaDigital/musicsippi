// src/data/continuar-al-acabar.js
// «Continuar al acabar»: al terminar la cola se añaden canciones parecidas en vez de
// volver al principio. Preferencia activada por defecto, en localStorage como el volumen.
const CLAVE = 'musicsippi-continuar-al-acabar';
export const EVENTO_CONTINUAR = 'musicsippi-continuar-al-acabar';

export function leerContinuar(almacen = globalThis.localStorage) {
  try {
    return almacen?.getItem(CLAVE) !== '0';
  } catch {
    return true;
  }
}

export function guardarContinuar(activo, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE, activo ? '1' : '0');
  } catch {
    // localStorage puede fallar (modo privado, cuota llena); no es crítico.
  }
  try {
    globalThis.dispatchEvent?.(new Event(EVENTO_CONTINUAR));
  } catch {
    // sin eventos (Node): nada que avisar
  }
}
