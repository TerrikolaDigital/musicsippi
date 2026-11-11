/**
 * Comprueba que los enlaces fijos de descarga responden y que la última release de Android
 * lleva todos sus archivos. Solo lee: no sube ni cambia nada. Sale con código 1 si algo falla.
 *
 *   node scripts/comprobar-descargas.mjs      (o `npm run comprobar-descargas`)
 *
 * Pásalo después de publicar una versión: el enlace de «Compartir Musicsippi» no lleva número
 * y da 404 si la release salió sin el archivo de nombre fijo.
 */
import { DESCARGA_ANDROID, DESCARGA_WINDOWS } from '../src/movil/compartir-salida.js';
import { URL_MANIFIESTO, normalizarManifiesto } from '../src/data/actualizaciones.js';
import { REPO_ANDROID, enlaceResponde, faltanEnRelease } from './lib/publicar-version.mjs';

/** Estado HTTP pidiendo solo el primer byte (no baja el archivo entero); 0 = sin respuesta. */
async function estadoDe(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
    await r.body?.cancel();
    return r.status;
  } catch {
    return 0;
  }
}

let fallos = 0;
async function comprobar(nombre, url) {
  const estado = await estadoDe(url);
  const bien = enlaceResponde(estado);
  if (!bien) fallos++;
  console.log(`${bien ? 'OK   ' : 'FALLA'} ${estado || 'sin respuesta'}  ${nombre}\n      ${url}`);
}

await comprobar('Compartir · Android', DESCARGA_ANDROID);
await comprobar('Compartir · Windows', DESCARGA_WINDOWS);
await comprobar('Aviso de versión nueva (version.json)', URL_MANIFIESTO);

let manifiesto = null;
try {
  manifiesto = normalizarManifiesto(await (await fetch(URL_MANIFIESTO)).json());
} catch {}
if (manifiesto) {
  await comprobar(`Botón «Descargar» de la ${manifiesto.versionName}`, manifiesto.url);
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_ANDROID}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'comprobar-descargas' },
    });
    if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
    const nombres = ((await r.json()).assets ?? []).map((a) => a.name);
    const faltan = faltanEnRelease(nombres, manifiesto.versionName);
    if (faltan.length) {
      fallos++;
      console.log(`FALLA La última release (${manifiesto.versionName}) no lleva: ${faltan.join(', ')}`);
    } else {
      console.log(`OK    La última release (${manifiesto.versionName}) lleva todos sus archivos`);
    }
  } catch (e) {
    console.log(`AVISO No pude leer la lista de archivos de la release: ${e.message}`);
  }
} else {
  fallos++;
  console.log('FALLA No pude leer version.json');
}

if (fallos) {
  console.error(`\n${fallos} comprobación(es) fallaron: quien use esos enlaces verá un error.`);
  process.exit(1);
}
console.log('\nTodos los enlaces de descarga responden.');
