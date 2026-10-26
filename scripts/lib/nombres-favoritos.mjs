import { normalizar } from './clasificar.mjs';

/**
 * Nombres con los que las plataformas de música llaman a "tus me gusta".
 *
 * No es vocabulario del usuario: son etiquetas de UI de Spotify, YouTube
 * Music, Apple Music y Deezer, en los dos idiomas que la app usa. Por eso
 * viven acá y no en fuentes.json (que se actualiza solo desde el repo remoto
 * y está pensado para vocabulario de géneros, que sí cambia seguido).
 *
 * Para qué: TuneMyMusic exporta la colección de "me gusta" DOS VECES cuando
 * en la plataforma de origen esa colección además tiene nombre propio de
 * playlist: una vez con `Type=Favorite` (que el importador ya manda al eje
 * 'favoritos' del sistema) y otra como una playlist normal llamada, por
 * ejemplo, "Mis favoritas". Sin esta lista el importador crea una lista
 * aparte con exactamente las mismas canciones, y quedan dos "favoritas" en
 * la app. Medido en una biblioteca real: las 83 canciones de "Mis favoritas"
 * estaban las 83 en "Favoritas", ninguna exclusiva.
 */
const NOMBRES = new Set([
  'favoritos',
  'favoritas',
  'mis favoritos',
  'mis favoritas',
  'favorites',
  'favourites',
  'my favorites',
  'my favourites',
  'liked',
  'liked songs',
  'liked music',
  'me gusta',
  'mis me gusta',
  'tus me gusta',
  'canciones que te gustan',
  'canciones que me gustan',
]);

/**
 * true si `nombre` es como una plataforma llama a "tus me gusta", o sea si una
 * lista con ese nombre es en realidad el eje 'favoritos' del sistema con otro
 * cartel encima.
 *
 * La comparación es por nombre completo, nunca por subcadena: "Rock favorito"
 * o "Favoritas del gimnasio" son listas de verdad que el usuario armó, y
 * absorberlas dentro de Favoritas sería perder una lista suya.
 */
export function esNombreDeFavoritos(nombre) {
  if (typeof nombre !== 'string') return false;
  return NOMBRES.has(normalizar(nombre).replace(/\s+/g, ' '));
}
