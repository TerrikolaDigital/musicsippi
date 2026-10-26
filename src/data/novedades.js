// src/data/novedades.js
// «Qué hay de nuevo»: aviso único tras actualizar la app. Lógica PURA (más la clave de
// localStorage); la red y el plugin nativo los conecta novedades-movil.js.

export const CLAVE_VISTA = 'novedadesVista';
const BASE_RELEASES = 'https://github.com/TerrikolaDigital/musicsippi-android/releases/download';

/**
 * 'registrar' = instalación nueva (guardar sin mostrar); 'mostrar' = se actualizó; 'nada' = igual o menor.
 * Sin `vista` (versión anterior a esta función): 'mostrar' si `usuarioPrevio` (la app ya se usaba), si no 'registrar'.
 */
export function decidirNovedades({ instalada, vista, usuarioPrevio = false }) {
  const inst = Number(instalada);
  if (!Number.isInteger(inst) || inst < 1) return 'nada';
  if (vista == null || vista === '' || !Number.isInteger(Number(vista))) return usuarioPrevio ? 'mostrar' : 'registrar';
  return inst > Number(vista) ? 'mostrar' : 'nada';
}

export function urlNotasVersion(versionCode) {
  return `${BASE_RELEASES}/v1.${versionCode}/version.json`;
}

export function leerVersionVista(almacen = globalThis.localStorage) {
  try {
    const v = almacen?.getItem(CLAVE_VISTA);
    if (v == null) return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

export function guardarVersionVista(code, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE_VISTA, String(code));
  } catch {
    // sin almacenamiento: se volverá a decidir en la próxima apertura
  }
}
