// src/movil/cancionSonando.js
// ¿Esta fila es la canción que suena? La misma canción puede sonar con varias identidades: la de la
// biblioteca, la provisional de Deezer (`album-…`) o la vista previa (`preview-<vídeo>`).
import { claveCancion } from './inicio/claves.js';
import { primerArtista } from './albumLocal.js';

export const claveDe = (t) => claveCancion(primerArtista(t.artista), t.titulo);

const idsDe = (t) => [t.id, t.trackIdReal, t.trackId].filter(Boolean).map((id) => String(id).replace(/^album-/, ''));

// Dos canciones del mismo origen con ids distintos son distintas, aunque normalicen igual («Clarity» y «Clarity (Acoustic)»).
const origenDe = (t) => /^(preview-|deezer-|deezer:|radio-)/.exec(idsDe(t)[0] ?? '')?.[1] ?? 'biblioteca';

// Entre orígenes distintos, la clave ignora los paréntesis: «(Radio Edit)» es la misma canción, una remezcla no.
const versionDe = (t) => /\(([^)]*\b(?:remix|mix|vip|acoustic|acústica|live)\b[^)]*)\)/i.exec(t.titulo ?? '')?.[1].toLowerCase() ?? '';

export function esLaQueSuena(actual, fila) {
  if (!actual || !fila) return false;
  const ids = idsDe(actual);
  if (idsDe(fila).some((id) => ids.includes(id))) return true;
  if (actual.youtubeVideoId && actual.youtubeVideoId === fila.youtubeVideoId) return true;
  return origenDe(actual) !== origenDe(fila) && claveDe(actual) === claveDe(fila) && versionDe(actual) === versionDe(fila);
}
