// Géneros (y portada) de las canciones añadidas en el móvil. Deezer va rápido
// (lotes de 4); MusicBrainz, en serie a 1 petición cada 1600 ms con
// User-Agent de contacto, como el PC (enriquecer-musicbrainz-core.mjs).
// Una canción solo se marca como consultada si la consulta salió: un fallo de
// red la deja pendiente para la siguiente pasada.
import {
  tituloParaBuscar,
  tituloSinSufijoFinal,
  escaparLucene,
  elegirCandidato,
  elegirAlbumYAnio,
  normalizarTitulo,
} from '../../scripts/lib/musicbrainz-puro.mjs';
import { URL_RECORDING, URL_RELEASE_GROUP, resumirFicha, elegirReleaseGroup, AGENTE_MB_DETALLE, ESPERA_MB_DETALLE_MS } from '../../scripts/lib/musicbrainz-detalle.mjs';
import { elegirGenerosRelevantes } from '../../scripts/lib/filtrar-generos-musicbrainz.mjs';
import { separarArtistasParaFusion } from '../../scripts/lib/fusionar-duplicados.mjs';
import { FUENTE_MOVIL } from '../data/alta-local.js';

export const AGENTE_MB = AGENTE_MB_DETALLE; // 'Musicsippi/1.0 ( terrikoladigital@gmail.com )'
export const ESPERA_MB_MS = 1600;
export const LOTE_DEEZER = 4;

// Géneros de Deezer por id (los nombres llegan traducidos según el idioma:
// «Alternativo», «Clásica»…) → términos del vocabulario de fuentes.json. Los
// que no describen un estilo (Niños, Música africana/asiática/india/brasileña)
// no aportan nada.
export const TERMINOS_POR_GENERO_DEEZER = {
  132: ['pop'],
  116: ['hip hop'],
  122: ['reggaeton'],
  152: ['rock'],
  113: ['dance'],
  165: ['contemporary r&b'],
  85: ['indie'],
  106: ['electronic'],
  466: ['folk'],
  144: ['reggae'],
  129: ['jazz'],
  67: ['salsa'],
  98: ['classical'],
  464: ['metal'],
  173: ['soundtrack'],
  169: ['soul', 'funk'],
  153: ['blues'],
  71: ['cumbia'],
  197: ['latin'],
};

const API_DEEZER = 'https://api.deezer.com';
const API_MB = 'https://musicbrainz.org/ws/2';
const esperarPorDefecto = (ms) => new Promise((r) => setTimeout(r, ms));
// Foto de artista vacía: Deezer usa el md5 de "" (ver enriquecer-deezer-core.mjs).
const FOTO_VACIA = /\/artist\/\/|d41d8cd98f00b204e9800998ecf8427e/;

export function datosDeBusquedaDeezer(json) {
  const t = json?.data?.[0];
  if (!t) return null;
  const foto = t.artist?.picture_big ?? t.artist?.picture_medium ?? null;
  return {
    albumId: t.album?.id ?? null,
    album: t.album?.title ?? null,
    coverUrl: t.album?.cover_xl ?? t.album?.cover_big ?? t.album?.cover_medium ?? null,
    fotoArtista: foto && !FOTO_VACIA.test(foto) ? foto : null,
  };
}

export function generosDeAlbumDeezer(json) {
  const terminos = (json?.genres?.data ?? []).flatMap((g) => TERMINOS_POR_GENERO_DEEZER[g?.id] ?? []);
  return [...new Set(terminos)];
}

export function pendientesDe(tracks, registros, marca) {
  const porId = new Map(registros.map((r) => [r.trackId, r]));
  return tracks.filter((t) => (t.fuentes ?? []).includes(FUENTE_MOVIL) && !porId.get(t.id)?.[marca]);
}

/** GET JSON con reintento ante 429/5xx y ante la cuota de Deezer (error.code 4). Otros 4xx → null. */
async function pedirJson(http, url, { headers = {}, esperar, reintentos = 3 } = {}) {
  for (let intento = 0; ; intento++) {
    const r = await http.get(url, { headers });
    const saturado = r.status === 429 || r.status >= 500;
    let json = null;
    if (!saturado && r.status < 400) {
      try {
        json = JSON.parse(r.texto);
      } catch {
        json = null;
      }
    }
    if (saturado || json?.error?.code === 4) {
      if (intento >= reintentos) throw new Error(`servicio saturado (HTTP ${r.status})`);
      await esperar(2000 * (intento + 1));
      continue;
    }
    return r.status >= 400 ? null : json;
  }
}

async function guardarEnGeneros(almacen, trackId, datos) {
  const previo = await almacen.obtenerPorClave('generos', trackId);
  await almacen.guardarRegistro('generos', { ...previo, trackId, ...datos });
}

async function completarMetadata(almacen, trackId, datos) {
  const previa = await almacen.obtenerPorClave('metadataLocal', trackId);
  const nuevos = Object.fromEntries(Object.entries(datos).filter(([k, v]) => v != null && previa?.[k] == null));
  if (Object.keys(nuevos).length) await almacen.guardarRegistro('metadataLocal', { ...previa, trackId, ...nuevos });
}

async function consultarDeezer(track, http, esperar) {
  const q = encodeURIComponent(`${track.artista} ${track.titulo}`);
  const meta = datosDeBusquedaDeezer(await pedirJson(http, `${API_DEEZER}/search?q=${q}&limit=1`, { esperar }));
  if (!meta) return { meta: null, generosDeezer: [] };
  const album = meta.albumId ? await pedirJson(http, `${API_DEEZER}/album/${meta.albumId}`, { esperar }) : null;
  return { meta, generosDeezer: generosDeAlbumDeezer(album) };
}

export async function enriquecerDeezerPendientes({ almacen, http, onProgreso = () => {}, esperar = esperarPorDefecto }) {
  const [tracks, registros] = await Promise.all([almacen.obtenerTodos('biblioteca'), almacen.obtenerTodos('generos')]);
  const pendientes = pendientesDe(tracks, registros, 'deezerBuscado');
  let hechas = 0;
  let conGeneros = 0;
  onProgreso(0, pendientes.length);
  for (let i = 0; i < pendientes.length; i += LOTE_DEEZER) {
    const lote = pendientes.slice(i, i + LOTE_DEEZER);
    const resultados = await Promise.all(lote.map((t) => consultarDeezer(t, http, esperar).catch(() => null)));
    for (const [k, t] of lote.entries()) {
      hechas++;
      const res = resultados[k];
      if (!res) continue;
      if (res.generosDeezer.length) conGeneros++;
      await guardarEnGeneros(almacen, t.id, { deezerBuscado: true, generosDeezer: res.generosDeezer });
      if (res.meta) await completarMetadata(almacen, t.id, { coverUrl: res.meta.coverUrl, fotoArtista: res.meta.fotoArtista, album: res.meta.album });
    }
    onProgreso(hechas, pendientes.length);
  }
  return { procesadas: hechas, conGeneros };
}

/** La grabación que mejor encaja con la canción en MusicBrainz (con una espera tras cada petición), o null. */
async function buscarGrabacion(track, { http, esperar, headers, espera = ESPERA_MB_MS }) {
  const artista = separarArtistasParaFusion(track.artista)[0] ?? track.artista;
  const titulo = tituloParaBuscar(track.titulo);
  const intentos = [titulo];
  const sinSufijo = tituloSinSufijoFinal(titulo);
  if (sinSufijo) intentos.push(sinSufijo);
  for (const t of intentos) {
    const q = `recording:"${escaparLucene(t)}" AND artist:"${escaparLucene(artista)}"`;
    const j = await pedirJson(http, `${API_MB}/recording/?fmt=json&limit=5&query=${encodeURIComponent(q)}`, { headers, esperar });
    await esperar(espera);
    const elegido = elegirCandidato((j?.recordings ?? []).filter((r) => (r.score ?? 0) >= 60), t);
    if (elegido) return elegido;
  }
  return null;
}

async function consultarMusicbrainz(track, { almacen, http, esperar, headers, artistas }) {
  const elegido = await buscarGrabacion(track, { http, esperar, headers });
  if (!elegido) return { artistaMbid: null, generosMB: [], album: null, anio: null };
  const mbid = elegido.rec['artist-credit']?.[0]?.artist?.id ?? null;
  if (mbid && !artistas[mbid]) {
    const a = await pedirJson(http, `${API_MB}/artist/${mbid}?fmt=json&inc=genres`, { headers, esperar });
    await esperar(ESPERA_MB_MS);
    artistas[mbid] = elegirGenerosRelevantes(a?.genres ?? []);
    // Se persiste ya (sin red): si la app se cierra a mitad no se repite la consulta.
    await almacen.guardarValorConfig('artistasMB', artistas);
  }
  const { album, anio } = elegirAlbumYAnio(elegido.rec.releases);
  return { artistaMbid: mbid, generosMB: mbid ? artistas[mbid] : [], album, anio, recordingMbid: elegido.rec.id ?? null };
}

export async function enriquecerMusicbrainzPendientes({
  almacen,
  http,
  onProgreso = () => {},
  esperar = esperarPorDefecto,
  maxFallosSeguidos = 3,
}) {
  const [tracks, registros] = await Promise.all([almacen.obtenerTodos('biblioteca'), almacen.obtenerTodos('generos')]);
  const pendientes = pendientesDe(tracks, registros, 'mbBuscado');
  const artistas = await almacen.obtenerValorConfig('artistasMB', {});
  const headers = { 'User-Agent': AGENTE_MB, Accept: 'application/json' };
  let hechas = 0;
  let conGeneros = 0;
  let fallosSeguidos = 0;
  onProgreso(0, pendientes.length);
  for (const t of pendientes) {
    let res = null;
    try {
      res = await consultarMusicbrainz(t, { almacen, http, esperar, headers, artistas });
      fallosSeguidos = 0;
    } catch {
      fallosSeguidos++;
    }
    hechas++;
    onProgreso(hechas, pendientes.length);
    if (!res) {
      if (fallosSeguidos >= maxFallosSeguidos) break;
      continue;
    }
    await guardarEnGeneros(almacen, t.id, {
      mbBuscado: true,
      artistaMbid: res.artistaMbid,
      generosMB: res.generosMB,
      ...(res.recordingMbid ? { recordingMbid: res.recordingMbid } : {}),
    });
    if (res.generosMB.length) conGeneros++;
    await completarMetadata(almacen, t.id, { album: res.album, anio: res.anio });
  }
  await almacen.guardarValorConfig('artistasMB', artistas);
  return { procesadas: hechas, conGeneros };
}

// ---------------------------------------------------------------------------------------------
// Ritmo (bpm) de Deezer: señal para alimentar los estados. /track/{id} trae `bpm` y `gain`.
// ---------------------------------------------------------------------------------------------
export const LOTE_RITMO = 3;
export const ESPERA_RITMO_MS = 800; // 3 canciones × 2 peticiones cada 0,8 s ≈ 7,5/s, bajo el límite de Deezer (50 por 5 s)
export const MAX_RITMO_POR_PASADA = 300;

export const idPistaDeezer = (json) => json?.data?.[0]?.id ?? null;
const normArtista = (s) => normalizarTitulo(String(s ?? ''));

/** ¿El primer resultado de la búsqueda es del artista pedido? (evita tomar el bpm de otra canción) */
export function coincideArtistaDeezer(json, track) {
  const hallado = normArtista(json?.data?.[0]?.artist?.name);
  const pedido = normArtista(separarArtistasParaFusion(track.artista)[0] ?? track.artista);
  return !!hallado && !!pedido && (hallado.includes(pedido) || pedido.includes(hallado));
}

export function datosDeRitmoDeezer(json) {
  if (!json || json.error) return null;
  const bpm = Number(json.bpm);
  return { bpm: bpm > 0 ? Math.round(bpm * 10) / 10 : null, gain: Number.isFinite(json.gain) ? json.gain : null };
}

export function pendientesRitmo(tracks, metas) {
  const porId = new Map(metas.map((m) => [m.trackId, m]));
  return tracks.filter((t) => !porId.get(t.id)?.ritmoBuscado);
}

async function consultarRitmo(track, http, esperar) {
  const q = encodeURIComponent(`${track.artista} ${track.titulo}`);
  const busqueda = await pedirJson(http, `${API_DEEZER}/search?q=${q}&limit=1`, { esperar });
  const id = idPistaDeezer(busqueda);
  if (!id || !coincideArtistaDeezer(busqueda, track)) return { deezerTrackId: null, bpm: null, gain: null };
  const ficha = datosDeRitmoDeezer(await pedirJson(http, `${API_DEEZER}/track/${id}`, { esperar }));
  return { deezerTrackId: id, bpm: ficha?.bpm ?? null, gain: ficha?.gain ?? null };
}

/**
 * bpm de Deezer para toda la biblioteca, en segundo plano y por tandas (como mucho `max` canciones por pasada;
 * el resto, en la siguiente). Se guarda en `metadataLocal` (bpm, gain, deezerTrackId, ritmoBuscado); un fallo de
 * red deja la canción pendiente. Deezer sin bpm (0) también queda como consultada.
 */
export async function enriquecerRitmoPendientes({ almacen, http, onProgreso = () => {}, esperar = esperarPorDefecto, max = MAX_RITMO_POR_PASADA, maxFallosSeguidos = 3 }) {
  const [tracks, metas] = await Promise.all([almacen.obtenerTodos('biblioteca'), almacen.obtenerTodos('metadataLocal')]);
  const pendientes = pendientesRitmo(tracks, metas).slice(0, max);
  let hechas = 0;
  let conBpm = 0;
  let fallosSeguidos = 0;
  onProgreso(0, pendientes.length);
  for (let i = 0; i < pendientes.length; i += LOTE_RITMO) {
    const lote = pendientes.slice(i, i + LOTE_RITMO);
    const resultados = await Promise.all(lote.map((t) => consultarRitmo(t, http, esperar).catch(() => null)));
    for (const [k, t] of lote.entries()) {
      hechas++;
      const res = resultados[k];
      if (!res) {
        fallosSeguidos++;
        continue;
      }
      fallosSeguidos = 0;
      if (res.bpm) conBpm++;
      const previa = await almacen.obtenerPorClave('metadataLocal', t.id);
      await almacen.guardarRegistro('metadataLocal', {
        ...previa,
        trackId: t.id,
        ritmoBuscado: true,
        ...(res.bpm ? { bpm: res.bpm } : {}),
        ...(res.gain !== null ? { gain: res.gain } : {}),
        ...(res.deezerTrackId ? { deezerTrackId: res.deezerTrackId } : {}),
      });
    }
    onProgreso(hechas, pendientes.length);
    if (fallosSeguidos >= maxFallosSeguidos) break;
    await esperar(ESPERA_RITMO_MS);
  }
  return { procesadas: hechas, conBpm };
}

// ---------------------------------------------------------------------------------------------
// MusicBrainz por canción y por álbum (además del artista): géneros y etiquetas de ánimo.
// Prioridad al decidir géneros: canción > álbum > artista (generosMBEfectivos). 1 petición/s.
// ---------------------------------------------------------------------------------------------
export const MAX_MB_DETALLE_POR_PASADA = 80;
const CLAVE_RG_MB = 'releaseGroupsMB';

/** Canciones sin ningún género conocido primero: son las que más ganan con esta consulta. */
export function pendientesDetalleMB(tracks, registros) {
  const porId = new Map(registros.map((r) => [r.trackId, r]));
  const sinGenero = (r) => !(r?.generosMB?.length || r?.generosDeezer?.length || r?.evidenciaPC?.generos?.length);
  return tracks
    .filter((t) => !porId.get(t.id)?.mbDetalle)
    .sort((a, b) => Number(sinGenero(porId.get(b.id))) - Number(sinGenero(porId.get(a.id))));
}

async function consultarDetalleMB(track, registro, album, { http, esperar, headers, rgCache, guardarRg }) {
  let recordingMbid = registro?.recordingMbid ?? null;
  if (!recordingMbid) {
    const elegido = await buscarGrabacion(track, { http, esperar, headers, espera: ESPERA_MB_DETALLE_MS });
    recordingMbid = elegido?.rec?.id ?? null;
  }
  if (!recordingMbid) return { recordingMbid: null };
  const ficha = await pedirJson(http, URL_RECORDING(recordingMbid), { headers, esperar });
  await esperar(ESPERA_MB_DETALLE_MS);
  const mbCancion = resumirFicha(ficha);
  const rgId = elegirReleaseGroup(ficha?.releases, album);
  let mbAlbum = { generos: [], tags: [] };
  if (rgId) {
    if (!rgCache[rgId]) {
      rgCache[rgId] = resumirFicha(await pedirJson(http, URL_RELEASE_GROUP(rgId), { headers, esperar }));
      await esperar(ESPERA_MB_DETALLE_MS);
      await guardarRg();
    }
    mbAlbum = rgCache[rgId];
  }
  return { recordingMbid, releaseGroupMbid: rgId, mbCancion, mbAlbum };
}

/**
 * Pide géneros y etiquetas de la canción y del álbum a MusicBrainz, en segundo plano y con caché persistente
 * (en el registro de `generos` por canción y `releaseGroupsMB` por álbum). Como mucho `max` canciones por pasada.
 * Un fallo de red deja la canción pendiente; «no encontrada» queda anotada para no repetir la búsqueda.
 */
export async function enriquecerMusicbrainzDetallePendientes({
  almacen,
  http,
  onProgreso = () => {},
  esperar = esperarPorDefecto,
  max = MAX_MB_DETALLE_POR_PASADA,
  maxFallosSeguidos = 3,
}) {
  const [tracks, registros, metas] = await Promise.all([
    almacen.obtenerTodos('biblioteca'),
    almacen.obtenerTodos('generos'),
    almacen.obtenerTodos('metadataLocal'),
  ]);
  const porReg = new Map(registros.map((r) => [r.trackId, r]));
  const albumDe = new Map(metas.map((m) => [m.trackId, m.album]));
  const pendientes = pendientesDetalleMB(tracks, registros).slice(0, max);
  const rgCache = await almacen.obtenerValorConfig(CLAVE_RG_MB, {});
  const guardarRg = () => almacen.guardarValorConfig(CLAVE_RG_MB, rgCache);
  const headers = { 'User-Agent': AGENTE_MB, Accept: 'application/json' };
  let hechas = 0;
  let conGeneros = 0;
  let conEtiquetas = 0;
  let fallosSeguidos = 0;
  onProgreso(0, pendientes.length);
  for (const t of pendientes) {
    let res = null;
    try {
      res = await consultarDetalleMB(t, porReg.get(t.id), albumDe.get(t.id) ?? null, { http, esperar, headers, rgCache, guardarRg });
      fallosSeguidos = 0;
    } catch {
      fallosSeguidos++;
    }
    hechas++;
    onProgreso(hechas, pendientes.length);
    if (!res) {
      if (fallosSeguidos >= maxFallosSeguidos) break;
      continue;
    }
    if (res.mbCancion?.generos.length || res.mbAlbum?.generos.length) conGeneros++;
    if (res.mbCancion?.tags.length || res.mbAlbum?.tags.length) conEtiquetas++;
    await guardarEnGeneros(almacen, t.id, { mbDetalle: true, ...res });
  }
  return { procesadas: hechas, conGeneros, conEtiquetas };
}
