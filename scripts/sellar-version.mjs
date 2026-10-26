/**
 * Graba el commit exacto del que sale un empaquetado, en version-build.json.
 *
 * POR QUÉ UN ARCHIVO Y NO CONSULTAR GIT AL VUELO: la app empaquetada arranca
 * `vite.config.js` DENTRO de la carpeta de instalación (ver electron/main.cjs),
 * donde no hay repositorio git ni git instalado. Cualquier `git rev-parse` en
 * runtime fallaría ahí. Por eso el sello se graba una vez, al empaquetar, y
 * viaja como dato dentro del paquete.
 *
 * PARA QUÉ SIRVE: el 30/08 se instaló un .exe que parecía al día pero venía de
 * un commit anterior a los últimos arreglos, y detectarlo requirió comparar el
 * código empaquetado contra el repo a mano. Con el sello, la app dice de qué
 * commit salió en "Acerca de" y eso se ve de un vistazo.
 */
// execFileSync con array de argumentos, no execSync con string: no pasa por el
// shell, así que no hay forma de que un nombre de rama o de carpeta con
// caracteres raros se interprete como comando.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function git(...args) {
  // trimEnd y no trim, por el mismo motivo que en scripts/empaquetar.mjs: en
  // `status --porcelain` el primer carácter de cada línea puede ser un espacio
  // significativo. Acá solo se mira si la salida está vacía, pero el helper se
  // comporta igual en los dos scripts a propósito.
  return execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trimEnd();
}

const commit = git('rev-parse', '--short', 'HEAD');
// --porcelain lista solo lo que difiere del commit; si hay algo, lo empaquetado
// NO es exactamente ese commit y el sello tiene que decirlo.
const sucio = git('status', '--porcelain').length > 0;

const sello = {
  commit,
  sucio,
  fecha: new Date().toISOString(),
};

const destino = join(raiz, 'version-build.json');
writeFileSync(destino, JSON.stringify(sello, null, 2) + '\n', 'utf8');

console.log(`[sellar-version] ${commit}${sucio ? ' (árbol sucio)' : ''} -> version-build.json`);
