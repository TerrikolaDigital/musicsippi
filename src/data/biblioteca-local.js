// src/data/biblioteca-local.js
import {
  obtenerTodos,
  obtenerPorClave,
  guardarRegistro,
  guardarVarios,
  borrarRegistro,
  obtenerValorConfig,
  guardarValorConfig,
} from './lib/db.js';
import { anotarCambio, descartarCambios, CLAVE_CAMBIOS } from './lib/journal.js';
import { podarEjesVacios } from '../../scripts/lib/clasificar.mjs';
import { unirModos as unirModosEnDatos } from '../../scripts/lib/unir-modos.mjs';
import ejesSemilla from '../../data/ejes.json';
import bibliotecaSemilla from '../../data/biblioteca.json';
import metadataSemilla from 'virtual:metadata-movil';
import evidenciaSemilla from 'virtual:evidencia-movil';
import { guardarEvidenciaPC } from '../organizador/evidencia-movil.js';
import favoritosSemilla from '../../data/favoritos.json';
import { esquemaDeEjes, puedeFusionarSemilla } from '../organizador/migrar-moods.js';
import { excluirDeEstado, perdonarEnEstado } from '../organizador/alimentar-estados.js';

const almacenConfig = { obtenerValorConfig, guardarValorConfig };

/**
 * Fusiona en IndexedDB los datos que vienen del escritorio (los que trae el
 * build, o los de "Sincronizar con el PC"). El escritorio manda en tracks y
 * modos, pero se conserva lo hecho en el móvil: modos/colecciones puestos a
 * mano (origen 'manual'), modos creados en el móvil, canciones añadidas en el
 * móvil y favoritos (unión de ambos lados).
 * @param {{generado?: string, tracks: object[], ejes: object[], favoritos?: object,
 *   cacheYoutube?: Record<string,string>, metadata?: {tracks: object},
 *   evidencia?: Record<string,{generos: string[], senal: string|null}>}} datos
 */
export async function fusionarDatosDelPC(datos, opciones = {}) {
  // `pcManda` (sincronización): los cambios del móvil ya se subieron al PC,
  // así que lo que llega es la versión completa. Se toma tal cual, incluido lo
  // que se quitó en el PC (modos, me gusta, canciones). Sin `pcManda` (datos
  // del build, que pueden ser más viejos) se protege lo hecho en el móvil.
  const { pcManda = false } = opciones;
  const previos = new Map((await obtenerTodos('biblioteca')).map((t) => [t.id, t]));
  if (pcManda) {
    const idsPC = new Set(datos.tracks.map((t) => t.id));
    await Promise.all([...previos.keys()].filter((id) => !idsPC.has(id)).map((id) => borrarRegistro('biblioteca', id)));
  }
  const nuevos = datos.tracks.map((t) => {
    const previo = previos.get(t.id);
    if (!previo || pcManda) return t;
    const manuales = previo.ejes.filter(
      (a) => a.origen === 'manual' && !t.ejes.some((b) => b.ejeId === a.ejeId)
    );
    if (manuales.length === 0) return t;
    return { ...t, ejes: [...t.ejes.filter((a) => a.ejeId !== 'sin-clasificar'), ...manuales] };
  });
  await Promise.all(nuevos.map((t) => guardarRegistro('biblioteca', t)));

  const ejesPrevios = await obtenerTodos('ejes');
  const idsPC = new Set(datos.ejes.map((e) => e.id));
  await Promise.all(datos.ejes.map((e) => guardarRegistro('ejes', e)));
  await Promise.all(ejesPrevios.filter((e) => !idsPC.has(e.id)).map((e) => guardarRegistro('ejes', e)));

  if (datos.favoritos) {
    const favMovil = pcManda
      ? { artistas: [], albumes: [] }
      : await obtenerValorConfig('favoritos', { artistas: [], albumes: [] });
    await guardarValorConfig('favoritos', {
      artistas: [...new Set([...(datos.favoritos.artistas ?? []), ...favMovil.artistas])],
      albumes: [...new Set([...(datos.favoritos.albumes ?? []), ...favMovil.albumes])],
    });
  }
  // Correcciones manuales (título/artista/álbum/año) hechas en el PC.
  if (datos.overrides) {
    await Promise.all(
      Object.entries(datos.overrides).map(([trackId, cambios]) => guardarRegistro('overrides', { trackId, ...cambios }))
    );
  }
  // videoId ya resueltos en el PC: el móvil no tiene que volver a buscarlos.
  if (datos.cacheYoutube) {
    await Promise.all(
      Object.entries(datos.cacheYoutube)
        .filter(([trackId]) => trackId !== 'version')
        .map(([trackId, v]) =>
          guardarRegistro('cacheYoutube', { trackId, videoId: typeof v === 'string' ? v : v?.videoId })
        )
    );
  }
  // Portadas/álbum/año: lo del PC pisa al del build (es más nuevo).
  if (datos.metadata?.tracks) {
    await Promise.all(
      Object.entries(datos.metadata.tracks).map(([trackId, m]) => guardarRegistro('metadataLocal', { trackId, ...m }))
    );
  }
  // Géneros que el PC ya conoce (ver evidenciaParaMovil en vite.config.js).
  if (datos.evidencia) {
    await guardarEvidenciaPC({ obtenerTodos, guardarVarios }, datos.evidencia);
  }
}

/**
 * Copia a IndexedDB la biblioteca que trae el build (la del escritorio, ver
 * vite.config: en modo móvil data/*.json sale de la carpeta de datos del
 * usuario) la primera vez y cada vez que se instala un build con otros datos.
 * La huella no usa solo `generado`: el enriquecimiento del escritorio reescribe
 * la biblioteca sin tocar esa fecha.
 * Devuelve lo que hay que mostrar: {tracks, ejes} de IndexedDB.
 */
export async function cargarDatosLocales() {
  const asignaciones = bibliotecaSemilla.tracks.reduce((n, t) => n + (t.ejes?.length ?? 0), 0);
  const huella = `${bibliotecaSemilla.generado ?? ''}|${bibliotecaSemilla.tracks.length}|${asignaciones}|${ejesSemilla.ejes.length}`;
  if ((await obtenerValorConfig('selloBuild', null)) !== huella) {
    // Un móvil ya reorganizado en moods no se pisa con la biblioteca antigua que trae un build viejo.
    const esquemaMovil = esquemaDeEjes(await obtenerTodos('ejes'), await obtenerValorConfig('esquemaMoods', 0));
    if (puedeFusionarSemilla(esquemaMovil, esquemaDeEjes(ejesSemilla.ejes, ejesSemilla.esquemaMoods))) {
      await fusionarDatosDelPC({
        tracks: bibliotecaSemilla.tracks,
        ejes: ejesSemilla.ejes,
        favoritos: favoritosSemilla,
        evidencia: evidenciaSemilla,
      });
    }
    await guardarValorConfig('selloBuild', huella);
  }
  const [tracks, ejes] = await Promise.all([obtenerTodos('biblioteca'), obtenerEjesLocal()]);
  return { tracks, ejes };
}

export async function asegurarEjesSembrados() {
  const existentes = await obtenerTodos('ejes');
  if (existentes.length > 0) return;
  await Promise.all(ejesSemilla.ejes.map((eje) => guardarRegistro('ejes', eje)));
}

async function obtenerEjesLocal() {
  await asegurarEjesSembrados();
  return obtenerTodos('ejes');
}

export function obtenerBibliotecaLocal() {
  return obtenerTodos('biblioteca');
}

export function guardarTrackLocal(track) {
  return guardarRegistro('biblioteca', track);
}

export async function obtenerMetadata() {
  const registros = await obtenerTodos('metadataLocal');
  // Base: la metadata del escritorio que trae el build; encima, lo agregado en el móvil.
  const tracks = { ...metadataSemilla.tracks };
  for (const r of registros) {
    tracks[r.trackId] = {
      album: r.album ?? null,
      anio: r.anio ?? null,
      duracionMs: r.duracionMs ?? null,
      artistaMbid: null,
      coverUrl: r.coverUrl ?? null,
      fotoArtista: r.fotoArtista ?? null,
    };
  }
  return { tracks, artistas: metadataSemilla.artistas ?? {} };
}

export async function obtenerOverrides() {
  const registros = await obtenerTodos('overrides');
  const mapa = {};
  for (const { trackId, ...cambios } of registros) mapa[trackId] = cambios;
  return mapa;
}

// ---- Registro de cambios para el PC ----------------------------------------
// Cada cambio hecho en el móvil se anota con el endpoint y el cuerpo que usa la
// app de escritorio para hacer lo mismo (ver biblioteca-servidor.js). Al
// sincronizar, el móvil los reenvía al PC en orden (sincronizar-movil.js) y
// así el PC se entera también de lo que se quitó, no solo de lo que se puso.
function registrarCambio(endpoint, cuerpo) {
  return anotarCambio({ obtenerValorConfig, guardarValorConfig }, endpoint, cuerpo);
}

export function obtenerCambiosPendientes() {
  return obtenerValorConfig(CLAVE_CAMBIOS, []);
}

/** Quita del registro los primeros `n` (los que el PC ya aplicó). */
export function descartarCambiosAplicados(n) {
  return descartarCambios({ obtenerValorConfig, guardarValorConfig }, n);
}

export async function guardarOverride(trackId, cambios) {
  await guardarRegistro('overrides', { trackId, ...cambios });
  await registrarCambio('override', { trackId, cambios });
  return { ok: true, overrides: await obtenerOverrides() };
}

export function obtenerFavoritos() {
  return obtenerValorConfig('favoritos', { artistas: [], albumes: [] });
}

async function alternarFavorito(clave, valorClave, activo) {
  const favoritos = await obtenerValorConfig('favoritos', { artistas: [], albumes: [] });
  const lista = favoritos[clave];
  const sinEste = lista.filter((v) => v !== valorClave);
  favoritos[clave] = activo ? [...sinEste, valorClave] : sinEste;
  return guardarValorConfig('favoritos', favoritos);
}

export async function guardarFavoritoArtista(nombre, activo) {
  await alternarFavorito('artistas', nombre.toLowerCase(), activo);
  await registrarCambio('favorito', { tipo: 'artista', nombre, activo });
}

export async function guardarFavoritoAlbum(artista, titulo, activo) {
  const clave = `${artista}||${titulo}`.toLowerCase();
  await alternarFavorito('albumes', clave, activo);
  await registrarCambio('favorito', { tipo: 'album', artista, titulo, activo });
}

async function podarEjesSiHaceFalta() {
  const ejes = await obtenerEjesLocal();
  const tracks = await obtenerBibliotecaLocal();
  const { ejes: restantes, podados } = podarEjesVacios(ejes, tracks);
  if (podados.length === 0) return;
  // podarEjesVacios devuelve un array nuevo sin las vacías: hay que borrar
  // del store las que ya no están, no solo reescribir las que sí.
  const idsRestantes = new Set(restantes.map((e) => e.id));
  const todasHoy = ejes.map((e) => e.id);
  await Promise.all(
    todasHoy.filter((id) => !idsRestantes.has(id)).map((id) => borrarRegistro('ejes', id))
  );
}

export async function asignarEje(trackId, ejeId) {
  const ejes = await obtenerEjesLocal();
  const eje = ejes.find((e) => e.id === ejeId);
  if (!eje || (eje.tipo !== 'gusto' && eje.tipo !== 'funcional')) {
    throw new Error(`asignarEje: ${ejeId} no es un modo válido`);
  }
  const track = await obtenerPorClave('biblioteca', trackId);
  if (!track) throw new Error(`asignarEje: track ${trackId} no existe`);
  const sinSinClasificar = track.ejes.filter((a) => a.ejeId !== 'sin-clasificar');
  const yaTiene = sinSinClasificar.some((a) => a.ejeId === ejeId);
  track.ejes = yaTiene
    ? sinSinClasificar
    : [...sinSinClasificar, { ejeId, origen: 'manual', senal: 'usuario', score: 1 }];
  await guardarRegistro('biblioteca', track);
  // Ponerla a mano en un estado es decisivo: si la había quitado antes, ya puede volver a entrar sola.
  if (eje.familia === 'estado') await perdonarEnEstado(almacenConfig, trackId, ejeId).catch(() => {});
  await registrarCambio('asignar', { trackId, ejeId });
  return { ok: true, ejes: track.ejes };
}

export async function quitarModo(trackId, ejeId) {
  const ejes = await obtenerEjesLocal();
  const eje = ejes.find((e) => e.id === ejeId);
  if (!eje || (eje.tipo !== 'gusto' && eje.tipo !== 'funcional')) {
    throw new Error(`quitarModo: ${ejeId} no es un modo válido`);
  }
  const track = await obtenerPorClave('biblioteca', trackId);
  if (!track) throw new Error(`quitarModo: track ${trackId} no existe`);
  const sinEste = track.ejes.filter((a) => a.ejeId !== ejeId);
  const quedaSinModoReal = !sinEste.some((a) => {
    const e = ejes.find((x) => x.id === a.ejeId);
    return e && (e.tipo === 'gusto' || e.tipo === 'funcional');
  });
  track.ejes = quedaSinModoReal
    ? [...sinEste, { ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }]
    : sinEste;
  await guardarRegistro('biblioteca', track);
  // Quitarla de un estado a mano es definitivo: el organizador no la vuelve a meter (ver senales-estados.js).
  if (eje.familia === 'estado') await excluirDeEstado(almacenConfig, trackId, ejeId).catch(() => {});
  await podarEjesSiHaceFalta();
  await registrarCambio('quitar-modo', { trackId, ejeId });
  return { ok: true, ejes: track.ejes };
}

export async function quitarTrack(trackId) {
  await borrarRegistro('biblioteca', trackId);
  await podarEjesSiHaceFalta();
  await registrarCambio('quitar-track', { trackId });
  const tracks = await obtenerBibliotecaLocal();
  return { ok: true, tracks };
}

export async function guardarColeccion(trackId, ejeId, activo) {
  const ejes = await obtenerEjesLocal();
  const eje = ejes.find((e) => e.id === ejeId);
  if (!eje || (eje.tipo !== 'playlist' && ejeId !== 'favoritos')) {
    throw new Error(`guardarColeccion: ${ejeId} no es una colección válida`);
  }
  const track = await obtenerPorClave('biblioteca', trackId);
  if (!track) throw new Error(`guardarColeccion: track ${trackId} no existe`);
  const sinEsta = track.ejes.filter((a) => a.ejeId !== ejeId);
  track.ejes = activo
    ? [...sinEsta, { ejeId, origen: 'manual', senal: 'usuario', score: 1 }]
    : sinEsta;
  await guardarRegistro('biblioteca', track);
  if (!activo) await podarEjesSiHaceFalta();
  await registrarCambio('coleccion', { trackId, ejeId, activo });
  return { ok: true, ejes: track.ejes };
}

/** Pasa todas las canciones del modo `origenId` a `destinoId` y borra el origen (se anota para el PC). */
export async function unirModos(origenId, destinoId) {
  const ejes = await obtenerEjesLocal();
  const tracks = await obtenerTodos('biblioteca');
  const ejesData = { ejes };
  const afectados = new Set(tracks.filter((t) => t.ejes.some((x) => x.ejeId === origenId)).map((t) => t.id));
  const r = unirModosEnDatos(ejesData, { tracks }, origenId, destinoId);
  if (!r.ok) throw new Error(`unirModos: ${r.error}`);
  await guardarVarios('biblioteca', tracks.filter((t) => afectados.has(t.id)));
  await borrarRegistro('ejes', origenId);
  await registrarCambio('unir-modos', { origenId, destinoId });
  return { ok: true, movidas: r.movidas, yaEnDestino: r.yaEnDestino, tracks, ejes: ejesData.ejes };
}

export async function guardarEjes(payload) {
  const actuales = await obtenerEjesLocal();
  const idsNuevos = new Set(payload.ejes.map((e) => e.id));
  await Promise.all(
    actuales.filter((e) => !idsNuevos.has(e.id)).map((e) => borrarRegistro('ejes', e.id))
  );
  await Promise.all(payload.ejes.map((e) => guardarRegistro('ejes', e)));
  // /api/ejes del PC reemplaza la lista entera: al reenviarlo se combina con la
  // del PC (ver sincronizar-movil.js) para no borrar modos creados allí.
  await registrarCambio('ejes', payload);
  return { ok: true };
}
