// Portadas que faltan, buscadas en el móvil de cada usuario con fuentes gratuitas
// y sin claves: Deezer, iTunes y YouTube Music (por ese orden; se para en la
// primera que acierte). Un fallo de red en una fuente no marca la canción como
// no encontrada; solo se marca si todas respondieron y ninguna coincidió.
import { tituloParaBuscar } from '../../scripts/lib/musicbrainz-puro.mjs';
import { separarArtistasParaFusion } from '../../scripts/lib/fusionar-duplicados.mjs';
import { pedirJson, completarMetadata } from './enriquecer-movil.js';
import { ampliarMiniatura } from '../data/alta-local.js';

export { ampliarMiniatura };

export const MAX_IMAGENES_POR_PASADA = 60;
export const REINTENTO_NO_ENCONTRADA_MS = 30 * 24 * 60 * 60 * 1000;
export const ESPERA_ITUNES_MS = 4000; // 15 por minuto como máximo

const esperarPorDefecto = (ms) => new Promise((r) => setTimeout(r, ms));
const quitarInstrumental = (t) => t.replace(/\s*[-–]\s*instrumental\s*$/i, '').replace(/\s*\(\s*instrumental\s*\)\s*$/i, '');
// Palabras en minúsculas y sin tildes, de cualquier alfabeto (cirílico, CJK…): `normalizarTitulo` solo deja a-z.
const palabras = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const tituloPalabras = (t) => palabras(quitarInstrumental(tituloParaBuscar(String(t ?? ''))));
const artistaPalabras = (a) => palabras(separarArtistasParaFusion(String(a ?? ''))[0] ?? a);
const FALSOS = [' tribute ', ' karaoke ', ' cover ', ' in the style of '];
const frase = (p) => ` ${p.join(' ')} `;

function contiene(grande, chica) {
  if (!chica.length || chica.length > grande.length) return false;
  for (let i = 0; i + chica.length <= grande.length; i++) if (chica.every((w, k) => grande[i + k] === w)) return true;
  return false;
}

/** ¿Hay con qué comparar? (nombres que no dejan ninguna palabra no se pueden contrastar: ni se aceptan ni se marcan). */
export function sePuedeComparar(artista, tituloBuscado) {
  return artistaPalabras(artista).length > 0 && tituloPalabras(tituloBuscado).length > 0;
}

/** ¿El resultado hallado es esta canción? Mismo título (sin ediciones) y artista que se contenga en el otro, por palabras enteras. */
export function coincide(artistaBuscado, tituloBuscado, artistaHallado, tituloHallado) {
  const pedido = artistaPalabras(artistaBuscado);
  const hallado = palabras(artistaHallado);
  if (!pedido.length || !hallado.length || !(contiene(hallado, pedido) || contiene(pedido, hallado))) return false;
  const t = tituloPalabras(tituloBuscado).join(' ');
  if (!t || t !== tituloPalabras(tituloHallado).join(' ')) return false;
  // Tributos, karaokes y versiones «cover» llevan el nombre del artista original: no valen salvo que se pidieran.
  const pedidoTexto = frase([...palabras(artistaBuscado), ...palabras(tituloBuscado)]);
  const halladoTexto = frase([...hallado, ...palabras(tituloHallado)]);
  return !FALSOS.some((f) => halladoTexto.includes(f) && !pedidoTexto.includes(f));
}

export function pendientesImagen(tracks, metadata, registros, ahora) {
  const porId = new Map(registros.map((r) => [r.trackId, r]));
  return tracks.filter((t) => {
    if (metadata?.tracks?.[t.id]?.coverUrl) return false;
    const img = porId.get(t.id)?.imagen;
    // Un registro sin noEncontrada y sin portada efectiva quedó a medias (carrera al guardar): vuelve a pendiente.
    return !img || !img.noEncontrada || ahora - img.fecha >= REINTENTO_NO_ENCONTRADA_MS;
  });
}

const API_DEEZER = 'https://api.deezer.com/search?q=';
const API_ITUNES = 'https://itunes.apple.com/search?term=';

async function deDeezer(track, { http, esperar }) {
  const artista = separarArtistasParaFusion(track.artista)[0] ?? track.artista;
  const t = tituloParaBuscar(track.titulo);
  const consultas = [
    `${encodeURIComponent(`artist:"${artista}" track:"${t}"`)}&limit=5`,
    `${encodeURIComponent(`${artista} ${t}`)}&limit=10`,
  ];
  for (const c of consultas) {
    const json = await pedirJson(http, API_DEEZER + c, { esperar, estricto: true });
    const hit = (json?.data ?? []).find((d) => fotoUtil(d?.album?.cover_big) && coincide(track.artista, track.titulo, d.artist?.name, d.title));
    if (hit) return hit.album.cover_big;
  }
  return null;
}

async function deItunes(track, { http, esperar }) {
  const term = encodeURIComponent(`${track.artista} ${track.titulo}`);
  // Sin reintentos: cada uno sería otra petición y se pasaría de 15 por minuto.
  const json = await pedirJson(http, `${API_ITUNES}${term}&entity=song&limit=10`, { esperar, estricto: true, reintentos: 0 });
  const hit = (json?.results ?? []).find((d) => d?.artworkUrl100 && coincide(track.artista, track.titulo, d.artistName, d.trackName));
  return hit ? hit.artworkUrl100.replace('100x100', '600x600') : null;
}

async function deYoutube(track, { buscarCanciones }) {
  const items = await buscarCanciones(`${track.artista} ${track.titulo}`);
  const hit = (items ?? []).find((d) => d?.thumbnail && coincide(track.artista, track.titulo, (d.artistas ?? []).join(' '), d.titulo));
  return hit ? ampliarMiniatura(hit.thumbnail) : null;
}

// Estado de módulo: una sola pasada a la vez (las que lleguen mientras corre reutilizan su promesa) y
// el último instante de iTunes se recuerda entre pasadas para que valga el límite de 15 por minuto.
let pasadaEnCurso = null;
let ultimoItunes = null;

/** Solo para los tests. */
export function reiniciarEstadoImagenes() {
  pasadaEnCurso = null;
  ultimoItunes = null;
}

export function completarImagenes(opciones) {
  pasadaEnCurso ??= pasada(opciones).finally(() => {
    pasadaEnCurso = null;
  });
  return pasadaEnCurso;
}

async function pasada({
  almacen,
  http,
  buscarCanciones,
  obtenerMetadata,
  esperar = esperarPorDefecto,
  onProgreso = () => {},
  ahora = () => Date.now(),
}) {
  const [tracks, registros, metadata] = await Promise.all([almacen.obtenerTodos('biblioteca'), almacen.obtenerTodos('generos'), obtenerMetadata()]);
  const pendientes = pendientesImagen(tracks, metadata, registros, ahora())
    .filter((t) => sePuedeComparar(t.artista, t.titulo))
    .slice(0, MAX_IMAGENES_POR_PASADA);
  let encontradas = 0;
  let procesadas = 0;
  const ctx = { http, esperar, buscarCanciones };
  const fuentes = [
    deDeezer,
    async (t, c) => {
      if (ultimoItunes != null) {
        const falta = ESPERA_ITUNES_MS - (ahora() - ultimoItunes);
        if (falta > 0) await esperar(falta);
      }
      ultimoItunes = ahora();
      return deItunes(t, c);
    },
    deYoutube,
  ];
  onProgreso(0, pendientes.length);
  for (const t of pendientes) {
    let url = null;
    let fallo = false;
    for (const fuente of fuentes) {
      try {
        url = await fuente(t, ctx);
      } catch {
        fallo = true;
      }
      if (url) break;
    }
    procesadas++;
    if (url) {
      // MusicBrainz escribe en el mismo registro: se confirma que la portada quedó y, si no, se repite una vez.
      let quedo = false;
      for (let intento = 0; intento < 2 && !quedo; intento++) {
        await completarMetadata(almacen, t.id, { coverUrl: url });
        quedo = !!(await almacen.obtenerPorClave('metadataLocal', t.id))?.coverUrl;
      }
      if (quedo) {
        encontradas++;
        await guardarImagen(almacen, t.id, { fecha: ahora(), noEncontrada: false });
      }
    } else if (!fallo) {
      await guardarImagen(almacen, t.id, { fecha: ahora(), noEncontrada: true });
    }
    onProgreso(procesadas, pendientes.length);
  }
  return { encontradas, procesadas };
}

async function guardarImagen(almacen, trackId, imagen) {
  for (let intento = 0; intento < 2; intento++) {
    const previo = await almacen.obtenerPorClave('generos', trackId);
    await almacen.guardarRegistro('generos', { ...previo, trackId, imagen });
    if ((await almacen.obtenerPorClave('generos', trackId))?.imagen) return;
  }
}

// Fotos de artista: Deezer busca artistas sin clave. La config `fotosArtistas`
// guarda { [nombreEnMinusculas]: { url, fecha } }; url null = no encontrado.
export const MAX_FOTOS_ARTISTAS_POR_PASADA = 40;
export const ESPERA_FOTOS_ARTISTAS_MS = 500;
const API_DEEZER_ARTISTA = 'https://api.deezer.com/search/artist?q=';
const MD5_IMAGEN_VACIA = 'd41d8cd98f00b204e9800998ecf8427e';

/** Nombres que no son de artista (número de pista, «#78», «T6 E11 …»): no se buscan. */
export function esNombreBasura(nombre) {
  const s = String(nombre ?? '').trim();
  return /^\d+$/.test(s) || s.startsWith('#') || /^T\d+ E\d+/.test(s);
}

const fotoUtil = (url) => typeof url === 'string' && url !== '' && !url.includes(MD5_IMAGEN_VACIA) && !url.includes('/artist//') && !url.includes('/cover//');

/** Artistas (separados como en la app) que ninguna canción suya tiene con foto válida en la metadata. */
export function artistasSinFotoMetadata(tracks, metadata) {
  const conFoto = new Set();
  const nombres = new Map();
  for (const t of tracks) {
    const foto = metadata?.tracks?.[t.id]?.fotoArtista;
    for (const nombre of separarArtistasParaFusion(String(t.artista ?? ''))) {
      const clave = nombre.toLowerCase();
      if (!nombres.has(clave)) nombres.set(clave, nombre);
      if (fotoUtil(foto)) conFoto.add(clave);
    }
  }
  return [...nombres].filter(([clave]) => !conFoto.has(clave)).map(([, nombre]) => nombre);
}

async function fotoDeezerArtista(nombre, { http, esperar }) {
  const json = await pedirJson(http, API_DEEZER_ARTISTA + encodeURIComponent(nombre), { esperar, estricto: true });
  const buscado = palabras(nombre).join(' ');
  const iguales = (json?.data ?? []).filter((a) => fotoUtil(a?.picture_big) && buscado !== '' && palabras(a?.name).join(' ') === buscado);
  const mejor = iguales.reduce((m, a) => (!m || (a.nb_fan ?? 0) > (m.nb_fan ?? 0) ? a : m), null);
  return mejor ? mejor.picture_big : null;
}

export async function completarFotosArtistas({ almacen, http, nombres, esperar = esperarPorDefecto, ahora = () => Date.now() }) {
  const fotos = await almacen.obtenerValorConfig('fotosArtistas', {});
  const vistos = new Set();
  const pendientes = [];
  for (const nombre of nombres) {
    const n = String(nombre ?? '').trim();
    const clave = n.toLowerCase();
    if (!n || vistos.has(clave) || esNombreBasura(n) || !palabras(n).length) continue; // sin palabras no hay con qué comparar: ni se consulta ni se marca
    vistos.add(clave);
    const previo = fotos[clave];
    if (fotoUtil(previo?.url)) continue;
    if (previo && ahora() - previo.fecha < REINTENTO_NO_ENCONTRADA_MS) continue;
    pendientes.push({ n, clave });
  }
  let encontradas = 0;
  let procesadas = 0;
  for (const [i, { n, clave }] of pendientes.slice(0, MAX_FOTOS_ARTISTAS_POR_PASADA).entries()) {
    if (i > 0) await esperar(ESPERA_FOTOS_ARTISTAS_MS);
    let url;
    try {
      url = await fotoDeezerArtista(n, { http, esperar });
    } catch {
      continue; // fallo de red: no se marca, se reintenta en la próxima pasada
    }
    procesadas++;
    if (url) encontradas++;
    fotos[clave] = { url, fecha: ahora() };
    await almacen.guardarValorConfig('fotosArtistas', fotos);
  }
  return { encontradas, procesadas };
}
