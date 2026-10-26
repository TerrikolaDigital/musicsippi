// Parte pura de scripts/aplicar-migracion-moods.mjs (la que se puede probar sin tocar disco).
import { VERSION_ESQUEMA_MOODS, aplicarPlan, esquemaDeEjes, planificarMigracion } from '../../src/organizador/migrar-moods.js';

/** Argumentos: `--aplicar`, `--data <carpeta>`, `--app-cerrada` (confirmación explícita de que la app está cerrada). */
export function leerArgumentos(argv) {
  const a = { aplicar: false, dataDir: null, appCerrada: false, json: false, errores: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const x = argv[i];
    if (x === '--aplicar') a.aplicar = true;
    else if (x === '--app-cerrada') a.appCerrada = true;
    else if (x === '--json') a.json = true;
    else if (x === '--data') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) a.errores.push('--data necesita una carpeta.');
      else {
        a.dataDir = v;
        i += 1;
      }
    } else a.errores.push(`Argumento desconocido: ${x}`);
  }
  return a;
}

/** 2026-10-20T10:05:09.123Z -> 20261020-100509 (válido en nombres de carpeta de Windows). */
export const marcaDeTiempo = (fecha = new Date()) => fecha.toISOString().replace(/\..*$/, '').replace(/[-:]/g, '').replace('T', '-');

export const nombreCarpetaBackup = (fecha) => `backup-migracion-moods-${marcaDeTiempo(fecha)}`;

/**
 * ¿Está en marcha la app de escritorio? Recibe la salida de la lista de procesos (tasklist en Windows, ps en el resto)
 * y devuelve true/false, o null si no hay lista (no se puede saber).
 */
export function appEnMarcha(listaProcesos) {
  if (typeof listaProcesos !== 'string' || !listaProcesos.trim()) return null;
  return /(^|[\\/\s"])Musicsippi(\.exe)?(\s|"|$)/im.test(listaProcesos);
}

/** Qué hacer antes de escribir: { permitido, motivo? }. */
export function permisoParaEscribir({ enMarcha, appCerrada }) {
  if (enMarcha === true) return { permitido: false, motivo: 'La app de escritorio de Musicsippi está en marcha. Ciérrala del todo (también en la bandeja) y repite.' };
  if (enMarcha === null && !appCerrada) {
    return { permitido: false, motivo: 'No he podido comprobar si la app de escritorio está abierta. Ciérrala y repite con --app-cerrada para confirmarlo.' };
  }
  return { permitido: true };
}

/**
 * Calcula la migración sobre copias de los datos. Devuelve { yaMigrado } o { plan, ejesData, biblioteca } nuevos
 * (ejes.json lleva `esquemaMoods`; biblioteca.json conserva sus demás campos).
 */
export function prepararMigracion({ biblioteca, ejesData, musicbrainz = null, ahora = new Date() }) {
  if (esquemaDeEjes(ejesData.ejes, ejesData.esquemaMoods) >= VERSION_ESQUEMA_MOODS) return { yaMigrado: true };
  const plan = planificarMigracion({ tracks: biblioteca.tracks, ejes: ejesData.ejes, musicbrainz });
  const nuevo = aplicarPlan(ejesData, biblioteca.tracks, plan);
  return {
    yaMigrado: false,
    plan,
    ejesData: { ...nuevo.ejesData, esquemaMoods: VERSION_ESQUEMA_MOODS, actualizado: ahora.toISOString() },
    biblioteca: { ...biblioteca, tracks: nuevo.tracks },
  };
}
