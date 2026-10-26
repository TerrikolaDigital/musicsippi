// src/ui/formato.js
// Formato de presentación compartido por el escritorio (App.jsx) y la capa móvil.

// Palabras cortas (ES/EN) que quedan en minúscula salvo que abran el título —
// "titlecase" estándar de editorial, no traducción real.
const PALABRAS_MINUSCULAS_TITULO = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but', 'nor', 'vs', 'feat', 'ft', 'with',
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'o', 'en', 'con', 'por', 'para', 'un', 'una', 'al',
]);

// Siglas cortas SIN puntos que también van siempre en mayúsculas — muy
// comunes como prefijo de nombre de artista ("DJ Snake", "MC Solaar") y el
// regex de sigla-con-puntos no las agarra porque no llevan puntos.
const SIGLAS_CORTAS_TITULO = new Set(['dj', 'mc']);

// Solo toca títulos/álbumes en TODO MAYÚSCULAS o todo minúsculas — casing
// mixto ("One Kiss", "Sunflower - Piano Instrumental") ya se ve bien, tocarlo
// arriesga romper estilizaciones reales sin necesidad. Es formateo de
// PRESENTACIÓN nomás: no toca biblioteca.json (nada de matching/búsqueda usa
// el resultado de esto), así que un caso mal corregido (sigla corta,
// nombre estilizado puntual) es cosmético y reversible, no un dato roto.
export function formatearTitulo(str) {
  if (!str) return str;
  const soloLetras = str.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (soloLetras.length < 3) return str;
  const esMayus = soloLetras === soloLetras.toUpperCase() && /[A-Z]/.test(soloLetras);
  const esMinus = soloLetras === soloLetras.toLowerCase() && str[0] === str[0].toLowerCase();
  if (!esMayus && !esMinus) return str;
  return str
    .split(' ')
    .map((palabra, i) => {
      if (!palabra) return palabra;
      // Sigla con puntos internos ("P.I.G", "U.S.A.", "R.E.M."): va en
      // mayúsculas enteras, no letra-por-letra — así no queda "P.i.g".
      if (/^[A-Za-z](\.[A-Za-z])+\.?$/.test(palabra)) return palabra.toUpperCase();
      const minuscula = palabra.toLowerCase();
      if (SIGLAS_CORTAS_TITULO.has(minuscula)) return palabra.toUpperCase();
      if (i !== 0 && PALABRAS_MINUSCULAS_TITULO.has(minuscula)) return minuscula;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Color determinístico por modo: mismo id, siempre mismo color, sin tocar
 * ejes.json ni migrar datos. Si en el futuro se quiere un color curado a mano
 * en vez del calculado, `eje.color` (campo opcional) lo pisa.
 */
export function colorDeEje(eje) {
  if (eje.color) return eje.color;
  let hash = 0;
  for (let i = 0; i < eje.id.length; i++) {
    hash = (hash * 31 + eje.id.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 55%, 42%)`;
}

export function reloj(segundos) {
  if (!segundos || !isFinite(segundos)) return '0:00';
  const s = Math.floor(segundos % 60);
  const m = Math.floor(segundos / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
