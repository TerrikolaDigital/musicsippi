// src/movil/resumen/datosTarjetas.js
// Datos planos para las tarjetas compartibles del resumen (sin React ni canvas): una sola
// estructura `datos` sirve a todas las tarjetas; cada tipo dibuja la parte que le toca.
import { formatearTitulo } from '../../ui/formato.js';
import { fraseHora, notaHora, textoMinutos } from './resumen.js';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «Mi semana · 12–18 oct», «Mi semana · 30 sep–6 oct» o «Mi año 2026». */
export function textoPeriodo(desde, hasta, tipo) {
  const a = new Date(desde);
  const b = new Date(hasta - 1);
  if (tipo === 'anio') return `Mi año ${a.getFullYear()}`;
  const ini = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MES[a.getMonth()]}`;
  return `Mi semana · ${ini}–${b.getDate()} ${MES[b.getMonth()]}`;
}

const NOMBRE = {
  minutos: 'Minutos',
  bucle: 'En bucle',
  artistas: 'Artistas',
  modo: 'Mood',
  hora: 'Hora',
  curioso: 'Novedad',
  final: 'Todo en uno',
};

/** ¿Es una dirección de imagen usable como portada (web o carátula local)? */
export const esPortadaReal = (u) => typeof u === 'string' && /^(https?:|data:image\/|capacitor:|file:|\/)/i.test(u.trim());

/** ¿Tiene esta tarjeta con qué dibujarse sin iniciales? Bucle y artistas necesitan imagen; novedad, el descubrimiento o la comparativa. */
export function hayTarjeta(tipo, datos) {
  if (!datos) return true;
  if (tipo === 'bucle') return !!datos.bucle;
  if (tipo === 'artistas') return datos.artistas.length > 0;
  if (tipo === 'curioso') return !!datos.descubrimiento || (datos.cambioPct !== null && datos.cambioPct !== undefined);
  return true;
}

/**
 * Tarjetas disponibles, en el orden de las historias: [{ tipo, nombre }].
 * Con `datos`, se omiten las que se quedarían sin imagen: nunca una tarjeta con iniciales.
 */
export function listarTarjetas(pantallas, datos) {
  return pantallas.filter((p) => hayTarjeta(p.id, datos)).map((p) => ({ tipo: p.id, nombre: NOMBRE[p.id] ?? p.id }));
}

const conUrl = (lista, urlDe) => lista.map((x) => ({ x, url: urlDe(x) })).filter((p) => esPortadaReal(p.url));

/**
 * @param {object} res resultado de armarResumen
 * @param {'semana'|'anio'} tipo
 * @param {string} color color del modo (css)
 * @param {{portada:(track:object)=>string|null, foto:(nombre:string)=>string|null}} urls
 * @returns datos + urls de imagen a cargar. Solo entra lo que tiene imagen real y cada lista de datos
 *   va alineada con su lista de urls. `datos.candidatas.{bucle,curioso}` son las canciones entre las que
 *   se puede elegir (cada una con su `url`); la primera es la que sale por defecto.
 */
export function armarDatosTarjeta(res, tipo, color, urls) {
  const h = res.horaFavorita;
  const cancion = (c) => ({ titulo: formatearTitulo(c.titulo), artista: formatearTitulo(c.artista), n: c.n });
  const alternativas = (lista) => conUrl(lista, (c) => urls.portada(c.track)).map((p) => ({ ...cancion(p.x), url: p.url }));
  const bucles = alternativas(res.candidatasBucle ?? (res.bucle ? [res.bucle] : []));
  const curiosos = alternativas(res.descubrimientos ?? (res.descubrimiento ? [res.descubrimiento] : []));
  const canciones = conUrl((res.topCanciones ?? []).slice(0, 5), (c) => urls.portada(c.track));
  const artistas = conUrl(res.topArtistas.slice(0, 5), (a) => urls.foto(a.nombre) ?? null);
  const albumes = conUrl((res.topAlbumes ?? []).slice(0, 3), (a) => urls.portada(a.track));
  const tira = (tracks, max = 5) => [...new Set((tracks ?? []).map((t) => urls.portada(t)).filter(esPortadaReal))].slice(0, max);
  const collage = { hora: tira(res.tracksHora, 3), modo: tira(res.tracksModo), minutos: tira(res.tracksMinutos), curioso: tira(res.tracksNuevas, 4) };
  const datos = {
    color,
    tipoPeriodo: tipo,
    periodo: textoPeriodo(res.desde, res.hasta, tipo),
    minutos: res.minutos,
    textoMinutos: textoMinutos(res.minutos),
    reproducciones: res.reproducciones,
    distintas: res.cancionesDistintas,
    nArtistas: res.artistasDistintos ?? 0,
    bucle: bucles[0] ? { titulo: bucles[0].titulo, artista: bucles[0].artista, n: bucles[0].n } : null,
    candidatas: { bucle: bucles, curioso: curiosos },
    artistas: artistas.map(({ x: a }) => ({ nombre: formatearTitulo(a.nombre), n: a.n, segundos: a.segundos })),
    canciones: canciones.map(({ x: c }) => ({ titulo: formatearTitulo(c.titulo), artista: formatearTitulo(c.artista), n: c.n, segundos: c.segundos })),
    albumes: albumes.map(({ x: a }) => ({ album: formatearTitulo(a.album), artista: formatearTitulo(a.artista), n: a.n, segundos: a.segundos })),
    modos: (res.topModos ?? []).slice(0, 5).map((m) => ({ nombre: formatearTitulo(m.nombre), n: Math.round(m.n) })),
    modo: res.modo && { nombre: formatearTitulo(res.modo.nombre), fraccion: res.modo.fraccion },
    hora: h === null || h === undefined ? null : { h, frase: fraseHora(h), nota: notaHora(h), racha: res.racha },
    descubrimiento: curiosos[0] ? { titulo: curiosos[0].titulo, artista: curiosos[0].artista, n: curiosos[0].n } : null,
    cambioPct: res.cambioPct,
  };
  return {
    datos,
    urls: {
      bucle: bucles[0]?.url ?? null,
      descubre: curiosos[0]?.url ?? null,
      artistas: artistas.map((p) => p.url),
      canciones: canciones.map((p) => p.url),
      albumes: albumes.map((p) => p.url),
      candidatas: { bucle: bucles.map((c) => c.url), curioso: curiosos.map((c) => c.url) },
      collage,
    },
  };
}

/**
 * Deja solo lo que de verdad tiene imagen cargada (una portada puede fallar al descargarse): evita
 * tarjetas con iniciales. Las listas de datos e imágenes siguen alineadas; si la portada de la canción por
 * defecto falla, pasa a ser la siguiente candidata.
 */
export function soloConImagen(datos, imagenes) {
  const cand = datos.candidatas ?? {};
  const imgsCand = imagenes.candidatas ?? {};
  const podar = (lista = [], imgs = []) => {
    const ok = lista.map((_, i) => !!imgs[i]);
    return [lista.filter((_, i) => ok[i]), imgs.filter((_, i) => ok[i])];
  };
  const [bucles, imgsBucle] = podar(cand.bucle, imgsCand.bucle);
  const [curiosos, imgsCuriosos] = podar(cand.curioso, imgsCand.curioso);
  const [canciones, imgCanciones] = podar(datos.canciones, imagenes.canciones);
  const [artistas, imgArtistas] = podar(datos.artistas, imagenes.artistas);
  const [albumes, imgAlbumes] = podar(datos.albumes, imagenes.albumes);
  const sola = ({ titulo, artista, n }) => ({ titulo, artista, n });
  return {
    datos: {
      ...datos,
      bucle: bucles[0] ? sola(bucles[0]) : null,
      descubrimiento: curiosos[0] ? sola(curiosos[0]) : null,
      candidatas: { bucle: bucles, curioso: curiosos },
      canciones,
      artistas,
      albumes,
    },
    imagenes: {
      ...imagenes,
      bucle: imgsBucle[0] ?? null,
      descubre: imgsCuriosos[0] ?? null,
      candidatas: { bucle: imgsBucle, curioso: imgsCuriosos },
      canciones: imgCanciones,
      artistas: imgArtistas,
      albumes: imgAlbumes,
      collage: Object.fromEntries(['hora', 'modo', 'minutos', 'curioso'].map((k) => [k, (imagenes.collage?.[k] ?? []).filter(Boolean)])),
    },
  };
}

const claveCancion = (tipo) => (tipo === 'bucle' ? 'bucle' : tipo === 'curioso' ? 'curioso' : null);

/** Canciones entre las que se puede elegir en una tarjeta (solo bucle y descubrimiento): [{ titulo, artista, n, url }]. */
export function opcionesCancion(tipo, datos) {
  const lista = datos.candidatas?.[claveCancion(tipo)] ?? [];
  return lista.length > 1 ? lista : [];
}

/** Datos e imágenes con la canción número `i` de la tarjeta: cambian juntos canción, datos y portada. */
export function conCancionElegida(tipo, datos, imagenes, i) {
  const clave = claveCancion(tipo);
  const c = clave && datos.candidatas?.[clave]?.[i];
  const img = clave && imagenes.candidatas?.[clave]?.[i];
  if (!c || !img) return { datos, imagenes };
  const { titulo, artista, n } = c;
  return clave === 'bucle'
    ? { datos: { ...datos, bucle: { titulo, artista, n } }, imagenes: { ...imagenes, bucle: img } }
    : { datos: { ...datos, descubrimiento: { titulo, artista, n } }, imagenes: { ...imagenes, descubre: img } };
}

/** Texto que acompaña a la imagen al compartir (si el sistema solo admite texto). */
export function textoCompartir(tipo, datos) {
  const cab = datos.tipoPeriodo === 'anio' ? 'Mi año en Musicsippi' : 'Mi semana en Musicsippi';
  switch (tipo) {
    case 'bucle':
      return datos.bucle ? `${cab}: «${datos.bucle.titulo}» de ${datos.bucle.artista}, ${datos.bucle.n} veces en bucle.` : cab;
    case 'artistas':
      return `${cab}: ${datos.artistas.slice(0, 3).map((a) => a.nombre).join(', ')}.`;
    case 'modo':
      return datos.modo ? `${cab}: mi mood fue ${datos.modo.nombre}.` : cab;
    case 'hora':
      return datos.hora ? `${cab}: ${datos.hora.frase.replace('Eres', 'Soy')}.` : cab;
    case 'curioso':
      return datos.descubrimiento ? `${cab}: he descubierto «${datos.descubrimiento.titulo}» de ${datos.descubrimiento.artista}.` : cab;
    default:
      return `${cab}: ${datos.minutos.toLocaleString('es-ES')} minutos de música.`;
  }
}
