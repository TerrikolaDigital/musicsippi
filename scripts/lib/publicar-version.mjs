// scripts/lib/publicar-version.mjs
// Parte pura de scripts/publicar-version.mjs: argumentos, nombres y manifiesto.

export function parsearArgumentos(argv) {
  const r = { baseUrl: '', notas: null, salida: 'dist-publicar', apk: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const siguiente = () => argv[++i];
    if (a === '--base-url') r.baseUrl = siguiente() ?? '';
    else if (a === '--notas') r.notas = siguiente() ?? '';
    else if (a === '--salida') r.salida = siguiente() ?? r.salida;
    else if (a === '--apk') r.apk = siguiente() ?? null;
    else throw new Error(`Argumento desconocido: ${a}`);
  }
  return r;
}

/** Misma fórmula que android/app/build.gradle: versionName = "1.<versionCode>". */
export const nombreVersion = (versionCode) => `1.${versionCode}`;

export const nombreApk = (versionName) => `musicsippi-${versionName}.apk`;

/**
 * Copia del APK con nombre SIN versión. El enlace de «Compartir Musicsippi»
 * (src/movil/compartir-salida.js) es `releases/latest/download/Musicsippi.apk`: si una
 * release sale sin este archivo, ese enlace da 404 (pasó con la 1.800).
 */
export const APK_FIJO = 'Musicsippi.apk';
export const MANIFIESTO = 'version.json';
export const REPO_ANDROID = 'TerrikolaDigital/musicsippi-android';

export const etiquetaVersion = (versionName) => `v${versionName}`;

/** Carpeta pública de una versión en GitHub Releases (la que usa la app para sus notas). */
export const baseUrlDeVersion = (versionName) =>
  `https://github.com/${REPO_ANDROID}/releases/download/${etiquetaVersion(versionName)}`;

/** Lo que TIENE que llevar cada release. */
export const archivosAPublicar = (versionName) => [nombreApk(versionName), APK_FIJO, MANIFIESTO];

/** Orden exacta para subir la release: nombra cada archivo (un comodín subiría restos de otra versión). */
export function comandoPublicar(versionName, salida = 'dist-publicar') {
  const carpeta = salida.replace(/\\/g, '/').replace(/\/+$/, '');
  const archivos = archivosAPublicar(versionName).map((a) => `${carpeta}/${a}`);
  return `gh release create ${etiquetaVersion(versionName)} --repo ${REPO_ANDROID} --title "Musicsippi ${versionName}" ${archivos.join(' ')}`;
}

/** De los archivos obligatorios, cuáles no están en la lista de nombres de una release. */
export const faltanEnRelease = (nombres, versionName) => archivosAPublicar(versionName).filter((a) => !nombres.includes(a));

/** ¿Un enlace de descarga respondió bien? (206 = respuesta parcial a una petición con Range). */
export const enlaceResponde = (estado) => estado === 200 || estado === 206;

/** Une la base con el archivo sin duplicar ni perder la barra. Base vacía = ruta relativa. */
export function urlApk(baseUrl, archivo) {
  const base = (baseUrl ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/${archivo}` : archivo;
}

/** Notas a partir de --notas (una por línea o separadas por «|») o, si no, de asuntos de commit. */
export function normalizarNotas(textoNotas, asuntosCommits = []) {
  const crudo = textoNotas != null ? textoNotas.split(/\r?\n|\|/) : asuntosCommits;
  return crudo
    .map((n) => n.trim())
    .filter((n) => n && !/^merge\b/i.test(n))
    .slice(0, 15);
}

export function construirManifiesto({ versionCode, baseUrl, notas, minimo }) {
  const versionName = nombreVersion(versionCode);
  const m = { versionCode, versionName, url: urlApk(baseUrl, nombreApk(versionName)), notas };
  if (minimo) m.minimo = minimo;
  return m;
}

/** Cuántos commits mirar para las notas: los que hay desde la versión publicada antes. */
export function commitsDesdeUltima(versionCode, ultimoCodigo) {
  const n = Number.isInteger(ultimoCodigo) ? versionCode - ultimoCodigo : 10;
  return Math.min(Math.max(n, 0), 30);
}
