// Texto pegado o compartido → lectura de la playlist (sin escribir nada).
import { extraerUrl, detectarOrigen, esEnlaceCorto } from './enlace.js';
import { ErrorImportar } from './errores.js';
import * as spotify from './fuentes/spotify.js';
import * as deezer from './fuentes/deezer.js';
import * as youtube from './fuentes/youtube.js';
import * as apple from './fuentes/apple.js';
import * as amazon from './fuentes/amazon.js';

export const NOMBRE_ORIGEN = { spotify: 'Spotify', youtube: 'YouTube Music', deezer: 'Deezer', apple: 'Apple Music', amazon: 'Amazon Music' };

const LECTORES = {
  spotify: spotify.leerPlaylist,
  deezer: deezer.leerPlaylist,
  youtube: youtube.leerPlaylist,
  apple: apple.leerPlaylist,
  amazon: amazon.leerPlaylist,
};

export async function leerEnlace(texto, http, lectores = LECTORES) {
  let url = extraerUrl(texto);
  if (!url) throw new ErrorImportar('no-reconocido');
  if (esEnlaceCorto(url)) url = (await http.get(url)).url;
  const destino = detectarOrigen(url);
  if (!destino || !lectores[destino.origen]) throw new ErrorImportar('no-reconocido', url);
  const leida = await lectores[destino.origen](destino.id, http);
  return { origen: destino.origen, id: destino.id, ...leida, aviso: leida.aviso ?? null };
}
