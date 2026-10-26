// src/movil/compartirMusica.js
// Acción «Compartir» de la interfaz móvil: reúne el texto (compartir-salida.js),
// toma el videoId del caché si la canción ya está resuelta y lo entrega al puente nativo.
import { textoCompartir } from './compartir-salida.js';
import { compartir } from '../data/nativo-movil.js';
import { videoIdCacheado } from '../data/reproduccion.js';

/**
 * @param {{avisar?: (msg: string) => void}} ctx  para el aviso «Enlace copiado» (web sin navigator.share)
 * @param {{tipo: 'cancion'|'album'|'artista', titulo: string, artista: string, album?: string, trackId?: string}} datos
 */
export async function compartirMusica(ctx, { tipo, titulo, artista, album, trackId }) {
  const videoId = tipo === 'cancion' && trackId ? await videoIdCacheado(trackId) : null;
  const texto = textoCompartir({ tipo, titulo, artista, album, videoId });
  const resultado = await compartir({ titulo, texto });
  if (resultado === 'copiado') ctx.avisar?.('Enlace copiado');
  return resultado;
}
