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
