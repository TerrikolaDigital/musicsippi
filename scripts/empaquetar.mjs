/**
 * Empaqueta la app, negándose a hacerlo si lo empaquetado no sería lo que uno
 * cree, y verificando después que efectivamente lo sea.
 *
 * POR QUÉ EXISTE: el 30/08 se instaló un .exe que parecía al día pero salía de
 * un commit anterior a los últimos tres arreglos, porque esos vivían en una
 * rama que nadie había mergeado y el empaquetado sale siempre de la rama
 * activa. Nadie lo notó hasta compararlo a mano. Estos chequeos son
 * exactamente esa comparación, hecha sola y antes de que el instalador exista.
 *
 * Uso: npm run empaquetar
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
// trimEnd, NO trim: en `git status --porcelain` los dos primeros caracteres son
// el estado y para un archivo modificado-sin-stagear el primero es un espacio
// (" M archivo"). Un trim() completo se comería ese espacio en la PRIMERA línea
// y solo en esa, desalineando el corte del nombre justo ahí — con el efecto
// silencioso de que un archivo de ruido que cayera primero (data/historial.json
// -> "ta/historial.json") dejaría de matchear el filtro y abortaría el
// empaquetado sin motivo.
const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trimEnd();

function abortar(titulo, detalle, comoArreglar) {
  console.error(`\n✗ ${titulo}\n`);
  if (detalle) console.error(detalle + '\n');
  if (comoArreglar) console.error(`Cómo seguir: ${comoArreglar}\n`);
  process.exit(1);
}

// Archivos que cambian solos con el uso normal de la app y no son código: que
// estén modificados no dice nada sobre qué versión se está por empaquetar.
const RUIDO = [/^data\//, /^version-build\.json$/];

console.log('Verificando antes de empaquetar…\n');

// --- 1. El árbol tiene que estar limpio -------------------------------------
// Si hay código sin commitear, el instalador contiene algo que no existe en
// ningún commit: irreproducible, y el sello de versión apuntaría a un commit
// que no es lo que realmente se empaquetó.
const sucio = git('status', '--porcelain')
  .split('\n')
  .filter(Boolean)
  .map((l) => l.slice(3))
  .filter((f) => !RUIDO.some((r) => r.test(f)));

if (sucio.length > 0) {
  abortar(
    'Hay cambios sin commitear',
    sucio.map((f) => '   ' + f).join('\n'),
    'commiteá (o descartá) esos archivos y volvé a correr esto.'
  );
}

// --- 2. Ninguna rama puede tener trabajo fuera de la rama activa -------------
// Este es EL chequeo que faltaba en agosto. Una rama con commits que no están
// acá significa que hay arreglos que el instalador no va a incluir.
const rama = git('rev-parse', '--abbrev-ref', 'HEAD');
const ramas = git('for-each-ref', '--format=%(refname:short)', 'refs/heads/')
  .split('\n')
  .filter((r) => r && r !== rama);

const pendientes = ramas
  .map((r) => ({ rama: r, commits: git('log', '--oneline', `${rama}..${r}`).split('\n').filter(Boolean) }))
  .filter((r) => r.commits.length > 0);

if (pendientes.length > 0) {
  abortar(
    `Hay ramas con trabajo que no está en "${rama}"`,
    pendientes
      .map((p) => `   ${p.rama}: ${p.commits.length} commits\n` + p.commits.map((c) => '      ' + c).join('\n'))
      .join('\n\n'),
    `integralas a "${rama}" (o borralas si ya no sirven) antes de empaquetar.`
  );
}

console.log(`✓ Árbol limpio y sin ramas pendientes (rama: ${rama})`);

// --- 3. Sellar y empaquetar --------------------------------------------------
execFileSync('node', [join(raiz, 'scripts', 'sellar-version.mjs')], { cwd: raiz, stdio: 'inherit' });
const commit = JSON.parse(readFileSync(join(raiz, 'version-build.json'), 'utf8')).commit;

console.log('\nEmpaquetando (esto tarda varios minutos)…\n');
execFileSync('npx', ['electron-builder'], { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' });

// --- 4. Verificar que lo empaquetado ES lo que hay en el repo -----------------
// El paso que faltaba del otro lado: no alcanza con que el build no falle, hay
// que confirmar que el código que quedó adentro es el mismo del repo. Se
// compara por hash, archivo por archivo, no por fecha ni por tamaño.
//
// SALIDA_DIR vive en C: (no en D:, donde está el repo) porque D: tiene
// habilitado el rename/unlink estilo POSIX de NTFS y eso hace que
// electron-builder falle siempre al renombrar win-unpacked.tmp -> win-unpacked
// (EPERM). Probado exhaustivamente el 02-03/09/2026: no es antivirus, Drive,
// permisos ni Controlled Folder Access — es la unidad. Debe coincidir con
// build.directories.output en package.json.
const SALIDA_DIR = 'C:/build-musicsippi';
const salida = join(SALIDA_DIR, 'win-unpacked', 'resources', 'app');
if (!existsSync(salida)) {
  abortar('El empaquetado terminó pero no encuentro win-unpacked/resources/app', `Busqué en: ${salida}`, null);
}

const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const aVerificar = ['src/App.jsx', 'src/escritorio/AppEscritorio.jsx', 'src/escritorio/componentes.jsx', 'src/escritorio/compartido.jsx', 'src/styles.css', 'src/useYouTube.js', 'vite.config.js', 'electron/main.cjs'];

const distintos = [];
for (const rel of aVerificar) {
  const enRepo = join(raiz, rel);
  const enPaquete = join(salida, rel);
  if (!existsSync(enPaquete)) {
    distintos.push(`${rel}: no está en el paquete`);
  } else if (hash(enRepo) !== hash(enPaquete)) {
    distintos.push(`${rel}: el contenido empaquetado no coincide con el del repo`);
  }
}

if (distintos.length > 0) {
  abortar(
    'El instalador NO contiene el código actual',
    distintos.map((d) => '   ' + d).join('\n'),
    'no distribuyas este instalador. Revisá la config "files" de electron-builder en package.json.'
  );
}

console.log(`\n✓ Instalador verificado: contiene el código del commit ${commit}`);
console.log(`   ${SALIDA_DIR}`);
console.log('   La app muestra ese mismo commit en Configuración → Acerca de.\n');
