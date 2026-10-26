// src/data/novedades-movil.js
// Conecta novedades.js con el plugin nativo y la red. Nunca lanza.
import { esAndroid } from './nativo-movil.js';
import { descargarJson, versionInstalada } from './actualizaciones-movil.js';
import { obtenerOnboardingVisto } from './onboarding.js';
import { decidirNovedades, guardarVersionVista, leerVersionVista, urlNotasVersion } from './novedades.js';

/**
 * ¿La app ya se usaba antes de esta función? Señales que ya existían: el onboarding cerrado
 * (`onboardingVisto`, IndexedDB; solo se guarda al cerrarlo y esta comprobación corre al arrancar,
 * así que una instalación nueva aún no lo tiene) o el volumen guardado en localStorage.
 */
async function hayUsoPrevio() {
  try {
    if (globalThis.localStorage?.getItem('volumenReproductor') != null) return true;
  } catch {
    // sin localStorage
  }
  try {
    return !!(await obtenerOnboardingVisto());
  } catch {
    return false;
  }
}

/**
 * Al abrir: devuelve { versionCode, versionName, notas } a mostrar, o null.
 * Sin red / fallo: null SIN guardar la versión vista (se reintenta en la próxima apertura).
 */
export async function prepararNovedades() {
  if (!esAndroid()) return null;
  try {
    const inst = await versionInstalada();
    if (!inst) return null;
    const vista = leerVersionVista();
    const decision = decidirNovedades({ instalada: inst.versionCode, vista, usuarioPrevio: vista == null ? await hayUsoPrevio() : false });
    if (decision === 'registrar') {
      guardarVersionVista(inst.versionCode);
      return null;
    }
    if (decision !== 'mostrar') return null;
    const json = await descargarJson(urlNotasVersion(inst.versionCode));
    const notas = Array.isArray(json?.notas) ? json.notas.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim()) : [];
    if (!notas.length) {
      guardarVersionVista(inst.versionCode);
      return null;
    }
    const nombre = typeof json.versionName === 'string' && json.versionName ? json.versionName : inst.versionName || String(inst.versionCode);
    return { versionCode: inst.versionCode, versionName: nombre, notas };
  } catch {
    return null;
  }
}

export function cerrarNovedades(versionCode) {
  guardarVersionVista(versionCode);
}
