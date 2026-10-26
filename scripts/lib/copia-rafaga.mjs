import { mkdirSync, copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Copia de seguridad "por ráfaga" para las bajas de canciones. Quitar un artista
 * o un álbum desde el móvil llega como una petición por canción: se guarda UNA
 * copia (carpeta `<prefijo>-<fecha-hora>` en dataDir, como las de
 * scripts/fusionar-modos-duplicados.mjs) antes de la primera baja y no se repite
 * mientras la última tenga menos de `ventanaMs`. Se conservan solo las `maxCopias`
 * más recientes de ese prefijo.
 *
 * @returns {string|null} carpeta creada, o null si ya había una reciente.
 */
export function copiaSiNuevaRafaga(dataDir, {
  archivos = ['biblioteca.json', 'ejes.json'],
  prefijo = 'backup-quitar-tracks',
  ventanaMs = 10 * 60 * 1000,
  maxCopias = 10,
  ahora = Date.now(),
} = {}) {
  const sello = (ms) => new Date(ms).toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const marca = (nombre) => {
    const m = nombre.slice(prefijo.length + 1).match(/^(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)$/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
  };
  const existentes = () =>
    readdirSync(dataDir)
      .filter((n) => n.startsWith(`${prefijo}-`) && marca(n) !== null)
      .sort();

  const previas = existentes();
  const ultima = previas.length ? marca(previas[previas.length - 1]) : null;
  if (ultima !== null && ahora - ultima < ventanaMs) return null;

  const carpeta = join(dataDir, `${prefijo}-${sello(ahora)}`);
  mkdirSync(carpeta, { recursive: true });
  for (const a of archivos) {
    const origen = join(dataDir, a);
    if (existsSync(origen)) copyFileSync(origen, join(carpeta, a));
  }
  const todas = existentes();
  for (const vieja of todas.slice(0, Math.max(0, todas.length - maxCopias))) {
    rmSync(join(dataDir, vieja), { recursive: true, force: true });
  }
  return carpeta;
}
