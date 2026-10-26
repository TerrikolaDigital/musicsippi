/**
 * Resuelve dónde vive data/ — punto único para que un futuro instalador (o
 * cualquier instalación fuera de este checkout de git) no dependa de que la
 * carpeta de la app sea escribible ni de dónde quedó instalada.
 *
 * Criterio (en este orden):
 *   1. MUSICSIPPI_DATA_DIR si está seteada (override explícito, útil para
 *      pruebas o para apuntar a una ubicación custom).
 *   2. `<raizProyecto>/data` si YA existe — así una instalación existente
 *      (como esta, con `data/` versionado en git a propósito: reconstruir
 *      cache-youtube.json/metadata-spotify.json cuesta cuota de API real)
 *      sigue funcionando exactamente igual, sin migrar nada.
 *   3. Si no existe ninguna de las dos, una carpeta de datos de usuario del
 *      sistema operativo — pensada para una instalación nueva sin `data/`
 *      en el paquete (instalador futuro, o la copia "para compartir").
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

function carpetaDeUsuario() {
  if (platform() === 'win32') {
    // APPDATA siempre está seteada en Windows; el fallback es solo defensivo.
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Musicsippi', 'data');
  }
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Musicsippi', 'data');
  }
  // Linux y el resto: convención XDG.
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'musicsippi', 'data');
}

export function resolverDataDir(raizProyecto) {
  if (process.env.MUSICSIPPI_DATA_DIR) return process.env.MUSICSIPPI_DATA_DIR;

  const dataDirProyecto = join(raizProyecto, 'data');
  if (existsSync(dataDirProyecto)) return dataDirProyecto;

  const dataDirUsuario = carpetaDeUsuario();
  mkdirSync(dataDirUsuario, { recursive: true });
  return dataDirUsuario;
}

/**
 * Atajo para el patrón repetido en cada script: calcular la raíz del
 * proyecto a partir de su propio import.meta.url y resolver data/ desde ahí.
 */
export function resolverRaizYDataDir(metaUrl) {
  const raiz = join(dirname(fileURLToPath(metaUrl)), '..');
  return { raiz, dataDir: resolverDataDir(raiz) };
}
