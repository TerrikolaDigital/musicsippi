// src/data/catalogo-local.js
import { pedidoJsonp } from './lib/jsonp.js';
import { obtenerBibliotecaLocal } from './biblioteca-local.js';

const BASE = 'https://api.deezer.com';

function trackIdDeezer(prefijoArtista, prefijoTitulo) {
  // Mismo criterio de "trackId provisorio" que ya usa el servidor para
  // resultados de búsqueda que todavía no están en la biblioteca: no es el
  // id final (ese lo asigna idTrackNavegador cuando se agrega de verdad),
  // solo una clave estable para que la UI pueda marcar "ya en biblioteca".
  return `deezer:${prefijoArtista}|${prefijoTitulo}`.toLowerCase();
}

async function marcarYaEnBiblioteca(items, obtenerClave) {
  const biblioteca = await obtenerBibliotecaLocal();
  const claves = new Set(
    biblioteca.map((t) => `${t.artista}|${t.titulo}`.toLowerCase())
  );
  return items.map((item) => ({ ...item, yaEnBiblioteca: claves.has(obtenerClave(item)) }));
}

export async function obtenerAlbum({ artista, titulo }) {
  const busqueda = await pedidoJsonp(
    `${BASE}/search/album?q=artist:"${encodeURIComponent(artista)}" album:"${encodeURIComponent(titulo)}"`
  );
  const encontrado = busqueda.data && busqueda.data[0];
  if (!encontrado) return { ok: true, encontrado: false };

  const detalle = await pedidoJsonp(`${BASE}/album/${encontrado.id}`);
  const tracksRaw = detalle.tracks?.data ?? [];
  const tracks = await marcarYaEnBiblioteca(
    tracksRaw.map((t, i) => ({
      numero: i + 1,
      titulo: t.title,
      artista: t.artist.name,
      duracionMs: t.duration * 1000,
      trackId: trackIdDeezer(t.artist.name, t.title),
      ejes: [],
    })),
    (item) => `${item.artista}|${item.titulo}`.toLowerCase()
  );

  return {
    ok: true,
    encontrado: true,
    albumId: String(detalle.id),
    titulo: detalle.title,
    artista: detalle.artist.name,
    coverUrl: detalle.cover_xl ?? detalle.cover_big ?? detalle.cover_medium ?? null,
    anio: detalle.release_date ? Number(detalle.release_date.slice(0, 4)) : null,
    tracks,
  };
}

export async function obtenerArtista(nombre) {
  const busqueda = await pedidoJsonp(`${BASE}/search/artist?q=${encodeURIComponent(nombre)}`);
  const candidatos = (busqueda.data ?? []).filter(
    (a) => a.name.toLowerCase() === nombre.toLowerCase()
  );
  const encontrado = candidatos.sort((a, b) => b.nb_fan - a.nb_fan)[0] ?? busqueda.data?.[0];
  if (!encontrado) return { ok: true, encontrado: false };

  const [albumesResp, topResp, relacionadosResp] = await Promise.all([
    pedidoJsonp(`${BASE}/artist/${encontrado.id}/albums`),
    pedidoJsonp(`${BASE}/artist/${encontrado.id}/top?limit=20`),
    pedidoJsonp(`${BASE}/artist/${encontrado.id}/related`),
  ]);

  const canciones = await marcarYaEnBiblioteca(
    (topResp.data ?? []).map((t) => ({
      titulo: t.title,
      artista: t.artist.name,
      duracionMs: t.duration * 1000,
      albumTitulo: t.album?.title ?? null,
      coverUrl: t.album?.cover_xl ?? t.album?.cover_big ?? t.album?.cover_medium ?? null,
      trackId: trackIdDeezer(t.artist.name, t.title),
      ejes: [],
    })),
    (item) => `${item.artista}|${item.titulo}`.toLowerCase()
  );

  return {
    ok: true,
    encontrado: true,
    artistaId: String(encontrado.id),
    nombre: encontrado.name,
    fotoUrl: encontrado.picture_medium ?? null,
    albumes: (albumesResp.data ?? []).map((a) => ({
      titulo: a.title,
      coverUrl: a.cover_xl ?? a.cover_big ?? a.cover_medium ?? null,
      anio: a.release_date ? Number(a.release_date.slice(0, 4)) : null,
      nbTracks: a.nb_tracks ?? null,
    })),
    canciones,
    similares: (relacionadosResp.data ?? []).map((a) => ({
      nombre: a.name,
      fotoUrl: a.picture_medium ?? null,
      nbFans: a.nb_fan,
    })),
  };
}

export async function obtenerArtistasFotos() {
  // Sin caché de servidor que consultar en esta fase — ver nota de
  // "Simplificación deliberada" arriba del Task.
  return { fotos: {} };
}

export async function obtenerTendencias(genero = '0') {
  const resp = await pedidoJsonp(`${BASE}/chart/${genero}`);
  return {
    tracks: (resp.tracks?.data ?? []).map((t) => ({
      id: t.id,
      titulo: t.title,
      artista: t.artist.name,
      cover: t.album?.cover_xl ?? t.album?.cover_big ?? t.album?.cover_medium ?? null,
    })),
    albums: (resp.albums?.data ?? []).map((a) => ({
      id: a.id,
      titulo: a.title,
      artista: a.artist.name,
      cover: a.cover_xl ?? a.cover_big ?? a.cover_medium ?? null,
    })),
    artists: (resp.artists?.data ?? []).map((a) => ({
      id: a.id,
      nombre: a.name,
      foto: a.picture_medium ?? null,
    })),
  };
}

export async function obtenerRecomendaciones(artistas) {
  // Sin caché de "similares" pre-computado, se resuelve en vivo: busca cada
  // artista de entrada y trae sus relacionados directo de Deezer (más caro
  // en llamadas que el servidor, aceptable para el volumen de un usuario).
  const resultados = await Promise.all(
    artistas.map(async (nombre) => {
      try {
        const busqueda = await pedidoJsonp(`${BASE}/search/artist?q=${encodeURIComponent(nombre)}&limit=1`);
        const encontrado = busqueda.data?.[0];
        if (!encontrado) return [];
        const relacionados = await pedidoJsonp(`${BASE}/artist/${encontrado.id}/related`);
        return relacionados.data ?? [];
      } catch {
        return [];
      }
    })
  );

  const biblioteca = await obtenerBibliotecaLocal();
  const artistasEnBiblioteca = new Set(
    biblioteca.map((t) => t.artista.toLowerCase())
  );

  const vistos = new Map();
  for (const a of resultados.flat()) {
    if (artistasEnBiblioteca.has(a.name.toLowerCase())) continue;
    if (!vistos.has(a.id)) vistos.set(a.id, a);
  }

  return {
    artistas: [...vistos.values()]
      .sort((a, b) => b.nb_fan - a.nb_fan)
      .slice(0, 24)
      .map((a) => ({ nombre: a.name, fotoUrl: a.picture_medium ?? null, nbFans: a.nb_fan })),
  };
}
