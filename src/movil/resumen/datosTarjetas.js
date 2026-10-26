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

/** Tarjetas disponibles, en el orden de las historias: [{ tipo, nombre }]. */
export function listarTarjetas(pantallas) {
  return pantallas.map((p) => ({ tipo: p.id, nombre: NOMBRE[p.id] ?? p.id }));
}

/**
 * @param {object} res resultado de armarResumen
 * @param {'semana'|'anio'} tipo
 * @param {string} color color del modo (css)
 * @param {{portada:(track:object)=>string|null, foto:(nombre:string)=>string|null}} urls
 * @returns datos + urls de imagen a cargar: { datos, urls: { bucle, descubre, artistas: [] } }
 */
export function armarDatosTarjeta(res, tipo, color, urls) {
  const d = res.descubrimiento;
  const h = res.horaFavorita;
  const datos = {
    color,
    tipoPeriodo: tipo,
    periodo: textoPeriodo(res.desde, res.hasta, tipo),
    minutos: res.minutos,
    textoMinutos: textoMinutos(res.minutos),
    reproducciones: res.reproducciones,
    distintas: res.cancionesDistintas,
    nArtistas: res.artistasDistintos ?? 0,
    bucle: res.bucle && { titulo: formatearTitulo(res.bucle.titulo), artista: formatearTitulo(res.bucle.artista), n: res.bucle.n },
    artistas: res.topArtistas.slice(0, 5).map((a) => ({ nombre: formatearTitulo(a.nombre), n: a.n, segundos: a.segundos })),
    canciones: (res.topCanciones ?? []).slice(0, 5).map((c) => ({ titulo: formatearTitulo(c.titulo), artista: formatearTitulo(c.artista), n: c.n, segundos: c.segundos })),
    albumes: (res.topAlbumes ?? []).slice(0, 3).map((a) => ({ album: formatearTitulo(a.album), artista: formatearTitulo(a.artista), n: a.n, segundos: a.segundos })),
    modos: (res.topModos ?? []).slice(0, 5).map((m) => ({ nombre: formatearTitulo(m.nombre), n: Math.round(m.n) })),
    modo: res.modo && { nombre: formatearTitulo(res.modo.nombre), fraccion: res.modo.fraccion },
    hora: h === null || h === undefined ? null : { h, frase: fraseHora(h), nota: notaHora(h), racha: res.racha },
    descubrimiento: d && { titulo: formatearTitulo(d.titulo), artista: formatearTitulo(d.artista), n: d.n },
    cambioPct: res.cambioPct,
  };
  return {
    datos,
    urls: {
      bucle: res.bucle ? urls.portada(res.bucle.track) : null,
      descubre: d ? urls.portada(d.track) : null,
      artistas: res.topArtistas.slice(0, 5).map((a) => urls.foto(a.nombre) ?? null),
      canciones: (res.topCanciones ?? []).slice(0, 5).map((c) => urls.portada(c.track) ?? null),
      albumes: (res.topAlbumes ?? []).slice(0, 3).map((a) => urls.portada(a.track) ?? null),
    },
  };
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
