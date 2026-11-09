// src/movil/resumen/imagenesResumen.js
// Imágenes de «Tu semana»: lista de fuentes por orden de preferencia (la portada propia, la de la misma
// canción en otra versión, la foto del artista o de cada artista de un dúo, la portada de sus canciones)
// y elección de la primera que de verdad carga. Así ninguna tarjeta cae a iniciales. Sin React ni DOM:
// la carga real de una imagen se inyecta (`cargar`).
import { esPortadaReal } from './datosTarjetas.js';
import { separarInvitados } from '../../ui/creditos.js';

const MAX_PORTADAS_ARTISTA = 3;

const normal = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// «Sia & Kylie Minogue», «A feat. B», «A x B», «A, B», «A · B», «A with B», «A vs B».
const SEPARADOR = /\s*(?:[·,&+]|\s(?:x|vs\.?|with|con|feat\.?|ft\.?|featuring)\s)\s*/i;

/** Artistas de un crédito: «Sia & Kylie Minogue» → ['Sia', 'Kylie Minogue']. Un solo artista → [nombre]. */
export function partesDeArtista(nombre) {
  const partes = String(nombre ?? '')
    .split(SEPARADOR)
    .map((s) => s.trim())
    .filter(Boolean);
  return partes.length ? partes : [];
}

const unicas = (lista) => [...new Set(lista.filter(esPortadaReal))];

/**
 * @param {{tracks:Array, metadataDe:(id:string)=>object, fotoDeArtista:(nombre:string)=>string|null}} o
 * @returns {{portada:(track:object|null)=>string[], foto:(nombre:string)=>string[]}} listas de urls candidatas, de más a menos preferida.
 */
export function crearFuentes({ tracks = [], metadataDe, fotoDeArtista, respaldoDe = () => null }) {
  const cover = (t) => metadataDe(t.trackIdReal ?? t.id)?.coverUrl ?? t.coverUrl ?? null;
  const fotoDe = (n) => (n ? fotoDeArtista(n) ?? null : null);

  const porCancion = new Map(); // titulo|artista → pistas (otras versiones del mismo tema)
  const porArtista = new Map(); // nombre de artista → pistas
  for (const t of tracks) {
    const k = `${normal(t.titulo)}|${normal(t.artista)}`;
    porCancion.set(k, [...(porCancion.get(k) ?? []), t]);
    for (const n of new Set([normal(t.artista), ...partesDeArtista(t.artista).map(normal)])) porArtista.set(n, [...(porArtista.get(n) ?? []), t]);
  }

  const partesDeTrack = (t) => unicas0([...partesDeArtista(t.artista), ...partesDeArtista(separarInvitados(t).artista)]);
  const unicas0 = (l) => [...new Set(l)];

  const foto = (nombre) => {
    const partes = partesDeArtista(nombre);
    const propias = (porArtista.get(normal(nombre)) ?? []).map(cover);
    const deLasPartes = partes.flatMap((p) => [fotoDe(p), ...(porArtista.get(normal(p)) ?? []).slice(0, 1).map(cover)]);
    return unicas([fotoDe(nombre), ...partes.map(fotoDe), ...propias.slice(0, MAX_PORTADAS_ARTISTA), ...deLasPartes]);
  };

  const portada = (track) => {
    if (!track) return [];
    const mismas = (porCancion.get(`${normal(track.titulo)}|${normal(track.artista)}`) ?? []).map(cover);
    const fotos = partesDeTrack(track).flatMap((n) => [fotoDe(n)]);
    return unicas([cover(track), ...mismas, respaldoDe(track), fotoDe(track.artista), ...fotos]);
  };

  return { portada, foto };
}

/** Primera url de la lista que está entre las verificadas (cargan). Sin `verificadas`, la primera de la lista. */
export function primeraVerificada(lista, verificadas) {
  if (!verificadas) return lista[0] ?? null;
  return lista.find((u) => verificadas.has(u)) ?? null;
}

/**
 * Comprueba qué urls cargan de verdad. `cargar(url)` resuelve con algo truthy si cargó.
 * @returns {Promise<Set<string>>}
 */
export async function verificarUrls(urls, cargar, concurrencia = 6) {
  // En orden de prioridad y de pocas en pocas: lanzarlas todas a la vez hace esperar en cola al navegador
  // (límite de conexiones por servidor) y las últimas agotan el tiempo sin estar rotas.
  const lista = [...new Set(urls.filter(esPortadaReal))];
  const ok = new Set();
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < lista.length) {
      const u = lista[siguiente++];
      if (await cargar(u)) ok.add(u);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrencia, lista.length) }, trabajador));
  return ok;
}

/** Carga una imagen como la pinta la pantalla (sin exigir CORS, que solo hace falta para exportarla a canvas). */
export function cargarSinCors(url, ms = 6000) {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), ms);
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.src = url;
  });
}
