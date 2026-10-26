// src/movil/busqueda.js
// Lógica pura de Buscar (sin React): búsqueda en la biblioteca sin acentos ni
// mayúsculas y búsquedas recientes guardadas en localStorage.
import { filtrarModos } from './modos.js';

export const CLAVE_RECIENTES = 'musicsippi.busquedasRecientes';
export const MAX_RECIENTES = 8;

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Palabras de la búsqueda, sin tildes ni mayúsculas ni signos («bad bunny» -> ['bad','bunny']).
export const palabras = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Puntuación de un texto frente a las palabras buscadas: todas deben aparecer (en cualquier
// orden). 0 = el texto empieza por la primera palabra, 1 = cada palabra empieza una palabra
// del texto, 2 = aparecen dentro de una palabra (parcial), -1 = alguna falta.
export function puntuar(texto, qs) {
  if (!qs.length) return -1;
  const t = norm(texto);
  const ws = palabras(texto);
  let peor = 0;
  for (const q of qs) {
    if (ws.some((w) => w.startsWith(q))) continue;
    if (t.includes(q)) peor = 2;
    else return -1;
  }
  if (peor === 0 && t.startsWith(qs[0])) return 0;
  return peor === 2 ? 2 : 1;
}

// `albumDe(track)` es opcional: nombre del álbum para que también cuente al buscar.
export function buscarEnBiblioteca(tracks, texto, max = 30, albumDe = null) {
  const qs = palabras(texto);
  if (!qs.length) return [];
  const puntos = (t) => {
    const cabeza = puntuar(`${t.titulo ?? ''} ${t.artista ?? ''}`, qs);
    const album = albumDe ? albumDe(t) : null;
    const conAlbum = album ? puntuar(`${t.titulo ?? ''} ${t.artista ?? ''} ${album}`, qs) : -1;
    if (cabeza < 0) return conAlbum < 0 ? -1 : 3;
    return cabeza;
  };
  return tracks
    .map((t) => [t, puntos(t)])
    .filter(([, p]) => p >= 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, max)
    .map(([t]) => t);
}

// Resultados de fuera (YouTube Music) ya normalizados -> canciones, artistas y álbumes que
// coinciden con lo escrito. Los artistas/álbumes salen de las propias canciones.
export function agruparExternos(resultados, texto) {
  const qs = palabras(texto);
  const canciones = resultados ?? [];
  const artistas = new Map();
  const albumes = new Map();
  for (const r of canciones) {
    const nombres = String(r.artistaSugerido ?? '').split(',').map((n) => n.trim()).filter(Boolean);
    for (const n of nombres) {
      if (puntuar(n, qs) < 0) continue;
      const a = artistas.get(norm(n)) ?? { nombre: n, cantidad: 0, foto: null };
      a.cantidad += 1;
      a.foto ??= r.thumbnail ?? null;
      artistas.set(norm(n), a);
    }
    if (r.album) {
      const principal = nombres[0] ?? '';
      if (puntuar(`${r.album} ${principal}`, qs) >= 0) {
        const clave = `${norm(principal)}|${norm(r.album)}`;
        const al = albumes.get(clave) ?? { artista: principal, titulo: r.album, cantidad: 0, portada: null };
        al.cantidad += 1;
        al.portada ??= r.thumbnail ?? null;
        albumes.set(clave, al);
      }
    }
  }
  const orden = (x, y) => y.cantidad - x.cantidad;
  return { canciones, artistas: [...artistas.values()].sort(orden), albumes: [...albumes.values()].sort(orden) };
}

// Mensaje corto y entendible para el aviso «No se pudo buscar» (sin volcar el error técnico).
export function mensajeBusqueda(error) {
  const t = String(error ?? '').toLowerCase();
  if (/network|fetch|timeout|time out|offline|conex|red|failed to|unable to resolve/.test(t)) return 'Parece que no hay conexión a internet.';
  if (/429|quota|cuota|too many/.test(t)) return 'Se hicieron demasiadas búsquedas seguidas. Espera un momento.';
  return 'YouTube Music no respondió.';
}

// `almacen` tiene la interfaz de localStorage; si falla (modo privado, datos
// bloqueados) la búsqueda sigue funcionando, solo que sin recientes.
export function leerRecientes(almacen) {
  try {
    const lista = JSON.parse(almacen.getItem(CLAVE_RECIENTES) ?? '[]');
    return Array.isArray(lista) ? lista.filter((t) => typeof t === 'string').slice(0, MAX_RECIENTES) : [];
  } catch {
    return [];
  }
}

function escribir(almacen, lista) {
  try {
    almacen.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: no se guardan recientes */
  }
  return lista;
}

export function guardarReciente(almacen, texto) {
  const limpio = String(texto ?? '').trim();
  if (limpio.length < 2) return leerRecientes(almacen);
  const resto = leerRecientes(almacen).filter((t) => norm(t) !== norm(limpio));
  return escribir(almacen, [limpio, ...resto].slice(0, MAX_RECIENTES));
}

export function quitarReciente(almacen, texto) {
  return escribir(almacen, leerRecientes(almacen).filter((t) => t !== texto));
}

export function borrarRecientes(almacen) {
  try {
    almacen.removeItem(CLAVE_RECIENTES);
  } catch {
    /* nada que borrar */
  }
  return [];
}

// Semilla de «Recomendados por tus artistas»: los artistas con más canciones
// en la biblioteca, acotados (como en escritorio, pedir "relacionados" de
// miles de artistas dispara 403 en Deezer).
export function semillaRecomendados(tracks, max = 12) {
  const cuenta = new Map();
  for (const t of tracks) {
    if (!t.artista) continue;
    cuenta.set(t.artista, (cuenta.get(t.artista) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([nombre]) => nombre);
}

// Track «de mentira» para escuchar un resultado externo antes de añadirlo:
// el id prefijado nunca choca con uno real y no entra en la biblioteca.
export function previewDe(r) {
  return {
    id: `preview-${r.videoId}`,
    artista: r.artistaSugerido,
    titulo: r.tituloSugerido,
    fuentes: ['youtube'],
    youtubeQuery: `${r.artistaSugerido} ${r.tituloSugerido}`,
    youtubeVideoId: r.videoId,
    ejes: [],
  };
}

/** Modos y listas (con canciones) cuyo nombre contiene el texto; sin texto, todos. */
export function buscarModos(ejes, conteos, texto, max = 12) {
  const q = norm(texto).trim();
  return filtrarModos(ejes, 'todos', conteos)
    .filter((e) => !q || norm(e.nombre).includes(q))
    .slice(0, max);
}
