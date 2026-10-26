// Parte de scripts/recalificar-moods.mjs que se puede probar sin tocar el disco de verdad.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { crearIndiceVecinos } from '../../src/organizador/senales-estados.js';
import { recalificarMoods } from '../../src/organizador/recalificar-moods.js';
import { marcaDeTiempo } from './migrar-moods-pc.mjs';

export { appEnMarcha, permisoParaEscribir } from './migrar-moods-pc.mjs';

export const ARCHIVO_CAMBIOS = 'recalificacion-moods.json';
export const nombreCarpetaBackup = (fecha) => `backup-recalificar-moods-${marcaDeTiempo(fecha)}`;

/** Argumentos: `--aplicar`, `--data <carpeta>`, `--app-cerrada`, `--copia <carpeta>`, `--fiesta-estricta`, `--muestra <n>`. */
export function leerArgumentos(argv) {
  const a = { aplicar: false, dataDir: null, appCerrada: false, copia: null, fiestaEstricta: false, muestra: 12, errores: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const x = argv[i];
    if (x === '--aplicar') a.aplicar = true;
    else if (x === '--app-cerrada') a.appCerrada = true;
    else if (x === '--fiesta-estricta') a.fiestaEstricta = true;
    else if (x === '--data' || x === '--copia' || x === '--muestra') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) a.errores.push(`${x} necesita un valor.`);
      else {
        i += 1;
        if (x === '--data') a.dataDir = v;
        else if (x === '--copia') a.copia = v;
        else a.muestra = Math.max(0, Number.parseInt(v, 10) || 0);
      }
    } else a.errores.push(`Argumento desconocido: ${x}`);
  }
  return a;
}

/** La carpeta backup-migracion-moods-* más reciente (la marca de tiempo del nombre ordena igual que la fecha). */
export const copiaPreviaMasReciente = (nombres) => [...nombres].filter((n) => /^backup-migracion-moods-/.test(n)).sort().pop() ?? null;

/** Lee la copia previa a la reorganización de una carpeta de backup: { tracks, ejes } o null si falta algo. */
export function leerCopiaPrevia(carpeta) {
  const b = join(carpeta, 'biblioteca.json');
  const e = join(carpeta, 'ejes.json');
  if (!existsSync(b) || !existsSync(e)) return null;
  return { tracks: JSON.parse(readFileSync(b, 'utf8')).tracks, ejes: JSON.parse(readFileSync(e, 'utf8')).ejes };
}

export function buscarCopiaPrevia(dataDir, explicita = null) {
  if (explicita) return leerCopiaPrevia(explicita);
  const nombre = existsSync(dataDir) ? copiaPreviaMasReciente(readdirSync(dataDir)) : null;
  return nombre ? leerCopiaPrevia(join(dataDir, nombre)) : null;
}

/** Vectores del organizador del PC (vectores-indice.json + vectores.bin) como [{trackId, vector}]. */
export function leerVectores(dataDir) {
  const rutaI = join(dataDir, 'vectores-indice.json');
  const rutaB = join(dataDir, 'vectores.bin');
  if (!existsSync(rutaI) || !existsSync(rutaB)) return [];
  const indice = JSON.parse(readFileSync(rutaI, 'utf8'));
  const bin = readFileSync(rutaB);
  const dims = indice.dims;
  const res = [];
  for (const [trackId, e] of Object.entries(indice.tracks ?? {})) {
    const desde = e.offset * dims * 4;
    if (desde + dims * 4 > bin.length) continue;
    res.push({ trackId, vector: Float32Array.from(new Float32Array(bin.buffer.slice(bin.byteOffset + desde, bin.byteOffset + desde + dims * 4))) });
  }
  return res;
}

/**
 * Calcula la recalificación sobre copias de los datos. Devuelve { plan, biblioteca (nueva), archivoCambios }.
 * `archivoCambios` es lo que se guarda en recalificacion-moods.json para la pantalla «Revisar moods».
 */
export function prepararRecalificacion({ biblioteca, ejesData, musicbrainz = null, copiaPrevia = null, vectores = [], fiestaEstricta = false, ahora = new Date() }) {
  const vecinos = vectores.length ? crearIndiceVecinos(vectores) : null;
  const { plan, tracks } = recalificarMoods({ tracks: biblioteca.tracks, ejes: ejesData.ejes, copiaPrevia, musicbrainz, vecinos, fiestaEstricta });
  return {
    plan,
    biblioteca: { ...biblioteca, tracks },
    archivoCambios: { version: 1, fecha: ahora.toISOString(), cambios: plan.cambios, devueltos: {} },
  };
}
