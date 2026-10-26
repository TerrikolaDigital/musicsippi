/**
 * Núcleo compartido para importar un CSV de tunemymusic.com — lo usan tanto
 * el script de consola (scripts/importar-tunemymusic.mjs, corre la
 * resolución de YouTube después) como POST /api/importar-tunemymusic (desde
 * la pantalla de carga en la app, sin esperar esa resolución: los tracks
 * nuevos se resuelven solos la primera vez que suenan, igual que los que se
 * agregan desde el buscador externo).
 *
 * Funciona para CUALQUIER plataforma de origen (Spotify, Apple Music,
 * YouTube Music, Amazon Music, Deezer, TIDAL...) porque TuneMyMusic
 * normaliza todo al mismo formato de columnas antes de exportar.
 */
import { idTrack } from './id-track.mjs';
import { aplicarFilasImportadas } from './importar-filas.mjs';

export { parsearCsvTuneMyMusic } from './csv-tunemymusic.mjs';

/**
 * Aplica `filas` ya parseadas contra el estado en memoria: agrega tracks
 * nuevos, clasifica, marca favoritos/pertenencia a listas (creando la lista
 * si hace falta) y completa álbum donde falte. Muta `biblioteca.tracks`
 * (push), `ejes` (push si hay listas nuevas — el llamador debe usar el
 * array devuelto, no el original, porque acá se reasigna) y
 * `metaSpotify.tracks`. Devuelve estadísticas para mostrarle al usuario.
 *
 * `cacheYoutube` (opcional, default `{}`): contenido de cache-youtube.json,
 * solo para el desempate de fusionarDuplicadosCruzados() de más abajo — sin
 * él, el fusionado sigue funcionando igual, solo pierde ese criterio puntual.
 */
export function aplicarFilasTuneMyMusic(filas, opciones) {
  return aplicarFilasImportadas(filas, { ...opciones, idDe: idTrack });
}
