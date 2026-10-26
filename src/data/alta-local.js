// src/data/alta-local.js
// Altas de canciones en el móvil (IndexedDB), con la misma lógica que el PC
// (scripts/lib) y anotadas en el registro de cambios con endpoints que el PC
// ya tiene, para que las reciba al sincronizar.
import * as db from './lib/db.js';
import { idTrackNavegador } from './lib/id-track-navegador.js';
import { anotarCambio } from './lib/journal.js';
import {
  limpiarTitulo,
  clasificar,
  propagarSugerenciasUnanimes,
  podarEjesVacios,
  indiceSugerenciasPorArtista,
  sugerenciaUnanime,
} from '../../scripts/lib/clasificar.mjs';
import { aplicarFilasImportadas } from '../../scripts/lib/importar-filas.mjs';
import { filasACsvTuneMyMusic } from '../../scripts/lib/csv-tunemymusic.mjs';
import { esNombreDeFavoritos } from '../../scripts/lib/nombres-favoritos.mjs';

/** Marca en track.fuentes: lo añadido en el móvil (el organizador solo enriquece esto). */
export const FUENTE_MOVIL = 'movil';
const NOMBRE_ORIGEN = { spotify: 'Spotify', youtube: 'YouTube Music', deezer: 'Deezer', local: 'tu móvil' };

const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Sin saltos de línea ni espacios dobles: así el CSV del PC da los mismos ids. */
export function limpiarFila(f) {
  return { ...f, titulo: limpio(f.titulo), artista: limpio(f.artista), album: limpio(f.album), playlist: limpio(f.playlist), tipo: f.tipo || 'Track' };
}

async function precalcularIds(pares) {
  const ids = new Map();
  for (const [artista, titulo] of pares) {
    const clave = `${artista}\u0000${titulo}`;
    if (!ids.has(clave)) ids.set(clave, await idTrackNavegador(artista, titulo));
  }
  return (artista, titulo) => {
    const id = ids.get(`${artista}\u0000${titulo}`);
    if (!id) throw new Error(`id sin precalcular: ${artista} — ${titulo}`);
    return id;
  };
}

function clasificarNuevo(artista, titulo, ejes, tracks) {
  let asignaciones = clasificar({ artista, titulo }, ejes);
  if (asignaciones.some((a) => a.ejeId === 'sin-clasificar')) {
    const validos = new Set(ejes.filter((e) => (e.tipo === 'gusto' || e.tipo === 'funcional') && !e.sistema).map((e) => e.id));
    const unanime = sugerenciaUnanime(artista, indiceSugerenciasPorArtista(tracks, validos));
    if (unanime) asignaciones = [{ ejeId: unanime, origen: 'auto', senal: 'artista-unanime', score: 0.9 }];
  }
  return asignaciones;
}

/** Rellena huecos de metadataLocal sin pisar lo que ya haya. */
async function completarMetadata(almacen, trackId, datos) {
  const previa = await almacen.obtenerPorClave('metadataLocal', trackId);
  const nuevos = Object.fromEntries(Object.entries(datos).filter(([k, v]) => v != null && previa?.[k] == null));
  if (Object.keys(nuevos).length === 0) return;
  await almacen.guardarRegistro('metadataLocal', { ...previa, trackId, ...nuevos });
}

/** Ids de canción de unas filas, calculados igual que en importarFilasLocal (mismo orden que `filas`). */
export async function idsDeFilas(filas) {
  const limpias = filas.map(limpiarFila);
  const idDe = await precalcularIds(limpias.map((f) => [f.artista, limpiarTitulo(f.titulo)]));
  return limpias.map((f) => idDe(f.artista, limpiarTitulo(f.titulo)));
}

export async function importarFilasLocal(filasCrudas, { nombrePlaylist, origen, ejeId = null }, almacen = db) {
  const [tracks, ejes, cacheLista] = await Promise.all([
    almacen.obtenerTodos('biblioteca'),
    almacen.obtenerTodos('ejes'),
    almacen.obtenerTodos('cacheYoutube'),
  ]);
  // Una seguida ya enlazada a su lista/modo (ejeId) se importa ahí aunque en el origen
  // se haya renombrado: se usa el nombre que ya tiene en el móvil (y el PC recibe ese).
  const destino = ejeId ? ejes.find((e) => e.id === ejeId && (e.tipo === 'playlist' || e.origen === 'descubierto')) : null;
  const nombreDestino = destino ? destino.nombre : nombrePlaylist;
  const filas = filasCrudas
    .map(limpiarFila)
    .filter((f) => f.titulo && f.artista)
    .map((f) => ({ ...f, playlist: limpio(nombreDestino) }));
  const idDe = await precalcularIds(filas.map((f) => [f.artista, limpiarTitulo(f.titulo)]));

  const antes = new Map(tracks.map((t) => [t.id, JSON.stringify(t)]));
  const cacheYoutube = Object.fromEntries(cacheLista.map((c) => [c.trackId, c.videoId]));
  const biblioteca = { tracks };
  const metaSpotify = { tracks: {} };

  const stats = aplicarFilasImportadas(filas, {
    biblioteca,
    ejes,
    metaSpotify,
    cacheYoutube,
    idDe,
    fuente: FUENTE_MOVIL,
    descripcionLista: `Importada desde ${NOMBRE_ORIGEN[origen] ?? 'otra app'}.`,
  });
  propagarSugerenciasUnanimes(biblioteca.tracks, stats.ejesFinal);
  const { ejes: ejesFinales } = podarEjesVacios(stats.ejesFinal, biblioteca.tracks);

  // Se anota ANTES de guardar las canciones: si la app se cierra entre medias, el PC
  // recibe el cambio igualmente (reenviarlo es inocuo) en vez de perderlo.
  // Releer una playlist sin nada nuevo no engorda el registro (ni el envío al PC).
  const hayNovedad = stats.tracksNuevos > 0 || stats.pertenenciasMarcadas > 0 || stats.favoritosMarcados > 0 || stats.listasNuevas.length > 0;
  if (hayNovedad) await anotarCambio(almacen, 'importar-tunemymusic', { contenido: filasACsvTuneMyMusic(filas) });

  // Solo se escribe lo que cambió (aplicarFilasImportadas muta los objetos).
  const idsFinales = new Set(biblioteca.tracks.map((t) => t.id));
  const cambiados = biblioteca.tracks.filter((t) => antes.get(t.id) !== JSON.stringify(t));
  const fusionados = [...antes.keys()].filter((id) => !idsFinales.has(id));
  await almacen.guardarVarios('biblioteca', cambiados);
  if (fusionados.length) await almacen.borrarVarios('biblioteca', fusionados);

  const idsEjesFinales = new Set(ejesFinales.map((e) => e.id));
  await almacen.guardarVarios('ejes', stats.listasNuevas.filter((e) => idsEjesFinales.has(e.id)));
  const ejesPodados = ejes.filter((e) => !idsEjesFinales.has(e.id)).map((e) => e.id);
  if (ejesPodados.length) await almacen.borrarVarios('ejes', ejesPodados);

  const videos = [];
  for (const f of filas) {
    if (!f.videoId) continue;
    const id = idDe(f.artista, limpiarTitulo(f.titulo));
    if (idsFinales.has(id) && !cacheYoutube[id]) {
      cacheYoutube[id] = f.videoId;
      videos.push({ trackId: id, videoId: f.videoId });
    }
  }
  if (videos.length) await almacen.guardarVarios('cacheYoutube', videos);
  for (const [trackId, m] of Object.entries(metaSpotify.tracks)) await completarMetadata(almacen, trackId, { album: m.album });

  const nombre = limpio(nombreDestino).toLowerCase();
  const ejeLista =
    (destino && ejesFinales.some((e) => e.id === destino.id) ? destino.id : null) ??
    ejesFinales.find((e) => (e.tipo === 'playlist' || e.origen === 'descubierto') && e.nombre.toLowerCase() === nombre)?.id ??
    (esNombreDeFavoritos(nombrePlaylist) ? 'favoritos' : null);
  return {
    ok: true,
    tracksNuevos: stats.tracksNuevos,
    listasNuevas: stats.listasNuevas.filter((e) => idsEjesFinales.has(e.id)).map((e) => e.nombre),
    ejeLista,
    tracks: await almacen.obtenerTodos('biblioteca'),
    ejes: await almacen.obtenerTodos('ejes'),
  };
}

export async function agregarTrackLocal({ titulo, artista, videoId }, almacen = db) {
  const tituloLimpio = limpiarTitulo(limpio(titulo));
  const artistaLimpio = limpio(artista);
  if (!tituloLimpio || !artistaLimpio) throw new Error('titulo_y_artista_requeridos');
  const id = await idTrackNavegador(artistaLimpio, tituloLimpio);
  const existente = await almacen.obtenerPorClave('biblioteca', id);
  if (existente) return { ok: true, yaExistia: true, track: existente };

  const [tracks, ejes] = await Promise.all([almacen.obtenerTodos('biblioteca'), almacen.obtenerTodos('ejes')]);
  const nuevo = {
    id,
    artista: artistaLimpio,
    titulo: tituloLimpio,
    fuentes: ['manual', FUENTE_MOVIL],
    youtubeQuery: `${artistaLimpio} ${tituloLimpio}`,
    youtubeVideoId: null,
    ejes: clasificarNuevo(artistaLimpio, tituloLimpio, ejes, tracks),
  };
  // Anotar antes de guardar (como organizador/aplicar.js): un cierre a medias no pierde el alta.
  // /api/agregar-track del PC exige videoId. Sin él NO sirve agregar-album (busca en
  // YouTube y, si no la encuentra, no crea la canción y la sincronización la borraría
  // del móvil): va por importar-tunemymusic, que en el PC es determinista.
  if (videoId) await anotarCambio(almacen, 'agregar-track', { titulo: tituloLimpio, artista: artistaLimpio, videoId });
  else {
    const fila = { titulo: tituloLimpio, artista: artistaLimpio, album: '', playlist: '', tipo: 'Track' };
    await anotarCambio(almacen, 'importar-tunemymusic', { contenido: filasACsvTuneMyMusic([fila]) });
  }
  await almacen.guardarRegistro('biblioteca', nuevo);
  if (videoId) await almacen.guardarRegistro('cacheYoutube', { trackId: id, videoId });
  return { ok: true, yaExistia: false, track: nuevo };
}

export async function agregarAlbumLocal({ tracks: filas, ejeId, albumTitulo, anio }, almacen = db) {
  if (!Array.isArray(filas) || filas.length === 0) throw new Error('tracks_requeridos');
  const [tracks, ejes] = await Promise.all([almacen.obtenerTodos('biblioteca'), almacen.obtenerTodos('ejes')]);
  const destino = ejeId ? ejes.find((e) => e.id === ejeId) : null;
  if (ejeId && !destino) throw new Error(`eje_inexistente: ${ejeId}`);
  // Igual que /api/agregar-album: 'favoritos' es colección (no quita «Sin clasificar»).
  const esColeccion = !!destino && (destino.tipo === 'playlist' || destino.id === 'favoritos');
  const esModo = !!destino && !esColeccion && (destino.tipo === 'gusto' || destino.tipo === 'funcional');
  const porId = new Map(tracks.map((t) => [t.id, t]));
  const cambiados = new Map();
  const filasLimpias = [];
  let agregados = 0;
  let conPertenencia = 0;

  for (const fila of filas) {
    if (typeof fila?.artista !== 'string' || typeof fila?.titulo !== 'string') continue;
    const artista = limpio(fila.artista);
    const titulo = limpiarTitulo(limpio(fila.titulo));
    if (!artista || !titulo) continue;
    filasLimpias.push({ ...fila, artista, titulo: limpio(fila.titulo) });
    const id = await idTrackNavegador(artista, titulo);
    let track = porId.get(id);
    if (!track) {
      track = {
        id,
        artista,
        titulo,
        fuentes: ['album', FUENTE_MOVIL],
        youtubeQuery: `${artista} ${titulo}`,
        youtubeVideoId: null,
        ejes: clasificarNuevo(artista, titulo, ejes, [...porId.values()]),
      };
      porId.set(id, track);
      cambiados.set(id, track);
      agregados++;
    }
    if (esModo || esColeccion) {
      if (esModo) track.ejes = track.ejes.filter((a) => a.ejeId !== 'sin-clasificar');
      if (!track.ejes.some((a) => a.ejeId === ejeId)) {
        track.ejes.push({ ejeId, origen: 'manual', senal: 'usuario', score: 1 });
        cambiados.set(id, track);
        conPertenencia++;
      }
    }
    await completarMetadata(almacen, id, {
      album: albumTitulo || null,
      anio: typeof anio === 'number' ? anio : null,
      duracionMs: typeof fila.duracionMs === 'number' && fila.duracionMs > 0 ? fila.duracionMs : null,
    });
  }
  // Para el PC: PRIMERO las canciones (y la lista/favoritos) por importar-tunemymusic,
  // que no busca en YouTube; DESPUÉS agregar-album solo para lo que el CSV no lleva
  // (modo, duración/año), ya con las canciones existiendo. Las filas viajan limpiadas
  // igual que aquí: el PC calcula el id sobre lo que recibe y no junta espacios.
  const nombreLista = destino?.tipo === 'playlist' ? destino.nombre : '';
  const csv = filasLimpias.map((f) => ({
    titulo: f.titulo,
    artista: f.artista,
    album: limpio(albumTitulo),
    playlist: nombreLista,
    tipo: destino?.id === 'favoritos' ? 'Favorite' : 'Track',
  }));
  await anotarCambio(almacen, 'importar-tunemymusic', { contenido: filasACsvTuneMyMusic(csv) });
  const conDuracion = filasLimpias.some((f) => typeof f.duracionMs === 'number' && f.duracionMs > 0);
  if (esModo || conDuracion) {
    await anotarCambio(almacen, 'agregar-album', {
      tracks: filasLimpias,
      ...(esModo ? { ejeId } : {}),
      albumTitulo,
      anio,
    });
  }
  await almacen.guardarVarios('biblioteca', [...cambiados.values()]);
  return { ok: true, agregados, noEncontrados: 0, conPertenencia, tracks: [...porId.values()], ejes };
}
