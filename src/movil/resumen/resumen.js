// src/movil/resumen/resumen.js
// «Tu semana / Tu año en Musicsippi»: cálculos puros (sin React) sobre el historial.
import { calcularEstadisticas } from '../estadisticas.js';

const DIA_MS = 86400000;
const MAX_ALTERNATIVAS = 6; // canciones entre las que se puede elegir en las tarjetas de bucle y descubrimiento
const MIN_SEMANA_S = 3600; // el aviso de la semana pide al menos 1 h escuchada

const enRango = (historial, desde, hasta) => (historial ?? []).filter((e) => e && Number.isFinite(e.ts) && e.ts >= desde && e.ts < hasta);

/** Último lunes de noviembre del año `anio` (día del mes). */
function ultimoLunesNoviembre(anio) {
  const fin = new Date(anio, 10, 30);
  return 30 - ((fin.getDay() + 6) % 7);
}

/**
 * Ventana de «Tu año en Musicsippi»: visible desde el último lunes de noviembre hasta el 15 de enero.
 * Hasta fin de año resume el año en curso «hasta hoy» (completo: false); del 1 al 15 de enero, el año
 * anterior entero («Edición completa»). Fuera de la ventana: { visible: false, anio: año en curso, completo: false }.
 */
export function ventanaResumenAnual(fecha = new Date()) {
  const d = new Date(fecha);
  const anio = d.getFullYear();
  if (d.getMonth() === 0 && d.getDate() <= 15) return { visible: true, anio: anio - 1, completo: true };
  const desdeNov = d.getMonth() === 10 && d.getDate() >= ultimoLunesNoviembre(anio);
  if (d.getMonth() === 11 || desdeNov) return { visible: true, anio, completo: false };
  return { visible: false, anio, completo: false };
}

/** Rango [desde, hasta) del resumen: el lunes se cuenta la semana que acaba de cerrar. */
export function rangoResumen(tipo, ahora = Date.now()) {
  const d = new Date(ahora);
  if (tipo === 'anio') {
    const { anio, completo } = ventanaResumenAnual(d);
    const finAnio = new Date(anio + 1, 0, 1).getTime();
    return { desde: new Date(anio, 0, 1).getTime(), hasta: completo ? finAnio : Math.min(ahora + 1, finAnio), anio, completo };
  }
  const hoy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
  if (hoy.getDay() === 1) lunes = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() - 7);
  const fin = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 7).getTime();
  return { desde: lunes.getTime(), hasta: Math.min(ahora + 1, fin) };
}

/**
 * ¿Qué resumen toca anunciar hoy? 'anio' (ventana anual), 'semana' (solo los domingos: la semana que termina hoy) o null.
 * Exige datos: alguna escucha en el año, o ≥ 1 h en la semana.
 */
export function resumenQueToca(historial, { ahora = Date.now(), duracionDe } = {}) {
  if (ventanaResumenAnual(ahora).visible) {
    const r = rangoResumen('anio', ahora);
    if (enRango(historial, r.desde, r.hasta).length > 0) return 'anio';
  }
  const d = new Date(ahora);
  if (d.getDay() === 0) {
    const r = rangoResumen('semana', ahora);
    const s = calcularEstadisticas({ historial: enRango(historial, r.desde, r.hasta), duracionDe, ahora: r.hasta }).segundos;
    if (s >= MIN_SEMANA_S) return 'semana';
  }
  return null;
}

/**
 * @param {Array} historial entradas { trackId, ts, ejeId?, titulo?, artista?, duracionS? }
 * @param {Array} biblioteca canciones ({ id, trackIdReal?, titulo, artista, ejes })
 * @param {{desde:number, hasta:number, ejes?:Array, duracionDe?:Function, portadaDe?:(track:object|null)=>string|null}} o
 *   Con `portadaDe`, la canción en bucle y el descubrimiento solo pueden ser canciones con portada real;
 *   `candidatasBucle` y `descubrimientos` traen las alternativas (todas con portada, de más a menos escuchada).
 */
export function armarResumen(historial, biblioteca, { desde, hasta, ejes = [], duracionDe, metadataDe, portadaDe, fotoDe, maxAlternativas = MAX_ALTERNATIVAS } = {}) {
  const todas = (historial ?? []).filter((e) => e && Number.isFinite(e.ts));
  const entradas = enRango(todas, desde, hasta);
  const calc = (lista, ahora) => calcularEstadisticas({ historial: lista, tracks: biblioteca, ejes, periodo: 'siempre', ahora, duracionDe });
  const r = calc(entradas, hasta);
  const tienePortada = (track) => !portadaDe || (!!track && !!portadaDe(track));

  // Hora favorita: la hora del día con más reproducciones.
  const porHora = new Array(24).fill(0);
  for (const e of entradas) porHora[new Date(e.ts).getHours()] += 1;
  const max = Math.max(...porHora);
  const horaFavorita = max > 0 ? porHora.indexOf(max) : null;

  // Descubrimiento: canciones cuya primera escucha de siempre cae en el rango, la más repetida primero.
  const primera = new Map();
  for (const e of todas) primera.set(e.trackId, Math.min(primera.get(e.trackId) ?? Infinity, e.ts));
  const nuevas = new Map();
  for (const e of entradas) if (primera.get(e.trackId) >= desde) nuevas.set(e.trackId, (nuevas.get(e.trackId) ?? 0) + 1);
  const descubrimientos = [];
  for (const [id, veces] of [...nuevas].sort((a, b) => b[1] - a[1]).slice(0, maxAlternativas * 4)) {
    const c = calc(entradas.filter((e) => e.trackId === id), hasta).topCanciones[0];
    if (!tienePortada(c?.track)) continue;
    descubrimientos.push({ trackId: id, track: c?.track ?? null, titulo: c?.titulo ?? '', artista: c?.artista ?? '', n: veces });
    if (descubrimientos.length >= maxAlternativas) break;
  }
  const descubrimiento = descubrimientos[0] ?? null;

  // Comparativa con el periodo anterior de la misma duración.
  const largo = hasta - desde;
  const previos = calc(enRango(todas, desde - largo, desde), desde).segundos;
  const cambioPct = previos > 0 ? Math.round(((r.segundos - previos) / previos) * 100) : null;

  // Canciones más escuchadas a la hora favorita y dentro del mood de la semana (para las tiras de portadas).
  const porId = new Map();
  for (const t of biblioteca ?? []) {
    porId.set(t.id, t);
    if (t.trackIdReal) porId.set(t.trackIdReal, t);
  }
  const masEscuchadas = (pred) => {
    const n = new Map();
    for (const e of entradas) if (pred(e)) n.set(e.trackId, (n.get(e.trackId) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).map(([id]) => porId.get(id)).filter(Boolean).slice(0, 12);
  };
  const tracksHora = horaFavorita === null ? [] : masEscuchadas((e) => new Date(e.ts).getHours() === horaFavorita);
  const modoId = r.topModos[0]?.ejeId;
  const tracksModo = modoId ? masEscuchadas((e) => e.ejeId === modoId || (porId.get(e.trackId)?.ejes ?? []).some((x) => x.ejeId === modoId)) : [];

  const tracksMinutos = r.topCanciones.map((c) => c.track).filter(Boolean).slice(0, 12);
  const tracksNuevas = descubrimientos.slice(1).map((d) => d.track).filter(Boolean);

  const candidatasBucle = r.topCanciones.filter((c) => tienePortada(c.track)).slice(0, maxAlternativas);
  const bucle = candidatasBucle[0] ?? null;
  const modo = r.topModos[0] ?? null;
  return {
    desde,
    hasta,
    dias: Math.max(1, Math.round(largo / DIA_MS)),
    segundos: r.segundos,
    minutos: Math.round(r.segundos / 60),
    reproducciones: r.reproducciones,
    cancionesDistintas: r.cancionesDistintas,
    artistasDistintos: r.artistasDistintos,
    bucle: bucle && { trackId: bucle.trackId, track: bucle.track, titulo: bucle.titulo, artista: bucle.artista, n: bucle.n },
    candidatasBucle: candidatasBucle.map((c) => ({ trackId: c.trackId, track: c.track, titulo: c.titulo, artista: c.artista, n: c.n })),
    descubrimientos,
    // Con `fotoDe`, solo artistas con imagen real: nunca iniciales.
    topArtistas: fotoDe ? r.topArtistas.filter((a) => fotoDe(a.nombre)) : r.topArtistas,
    topCanciones: r.topCanciones,
    topModos: r.topModos,
    topAlbumes: topAlbumes(entradas, biblioteca, { metadataDe, duracionDe }),
    modo: modo && { ejeId: modo.ejeId, nombre: modo.nombre, fraccion: r.reparto[0]?.fraccion ?? 0 },
    racha: r.racha.mejor,
    horaFavorita,
    tracksHora,
    tracksModo,
    tracksMinutos,
    tracksNuevas,
    descubrimiento,
    previosSegundos: previos,
    cambioPct,
  };
}

/** Álbumes más escuchados del rango (por reproducciones); necesita `metadataDe(id)` con `album`. */
export function topAlbumes(entradas, biblioteca, { metadataDe, duracionDe, max = 3 } = {}) {
  if (!metadataDe) return [];
  const porId = new Map();
  for (const t of biblioteca ?? []) {
    porId.set(t.id, t);
    if (t.trackIdReal) porId.set(t.trackIdReal, t);
  }
  const albumes = new Map();
  for (const e of entradas) {
    const track = porId.get(e.trackId);
    const album = track ? metadataDe(track.trackIdReal ?? track.id)?.album : null;
    if (!track || typeof album !== 'string' || !album.trim()) continue;
    const clave = `${album.trim().toLowerCase()}|${(track.artista ?? '').trim().toLowerCase()}`;
    const a = albumes.get(clave) ?? { album: album.trim(), artista: track.artista ?? '', track, n: 0, segundos: 0 };
    a.n += 1;
    a.segundos += Number.isFinite(e.duracionS) && e.duracionS > 0 ? e.duracionS : duracionDe?.(e.trackId) ?? 210;
    if (!metadataDe(a.track.trackIdReal ?? a.track.id)?.coverUrl) a.track = track;
    albumes.set(clave, a);
  }
  return [...albumes.values()].sort((a, b) => b.n - a.n || b.segundos - a.segundos).slice(0, max);
}

const veces = (x) => `${x} ${x === 1 ? 'vez' : 'veces'}`;

/** Frase de la hora favorita: «Eres de escuchar a las 23 h». */
export function fraseHora(h) {
  if (h === null || h === undefined) return '';
  return h === 1 ? 'Eres de escuchar a la 1 h' : `Eres de escuchar a las ${h} h`;
}

/** Nota con gracia según la franja de la hora favorita. */
export function notaHora(h) {
  if (h < 5) return 'Noctámbulo de manual: la música te hace la compañía que el sueño no.';
  if (h < 9) return 'Madrugador: la banda sonora llega antes que el café.';
  if (h < 14) return 'Tu mañana tiene banda sonora propia.';
  if (h < 20) return 'La tarde es tuya y tiene ritmo.';
  return 'Las noches suenan mejor contigo.';
}

/** Dato curioso comparativo con el periodo anterior (o null si no hay con qué comparar). */
export function fraseComparativa(res, tipo) {
  const periodo = tipo === 'anio' ? 'el año pasado' : 'la semana pasada';
  if (res.cambioPct === null) return null;
  if (res.cambioPct === 0) return `Igual que ${periodo}: eres constante como un metrónomo.`;
  return res.cambioPct > 0
    ? `Escuchaste un ${res.cambioPct} % más que ${periodo}.`
    : `Escuchaste un ${-res.cambioPct} % menos que ${periodo}. Descansar los oídos también vale.`;
}

/** «12 h 5 min» / «45 min» a partir de minutos. */
export function textoMinutos(min) {
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Periodo que cubre el resumen: «Del 12 al 18 de octubre» (semana) o «Año 2026». */
export function textoRango(desde, hasta, tipo) {
  const a = new Date(desde);
  const b = new Date(hasta - 1);
  if (tipo === 'anio') return `Año ${a.getFullYear()}`;
  const mesA = a.getMonth() === b.getMonth() ? '' : ` de ${MESES[a.getMonth()]}`;
  return `Del ${a.getDate()}${mesA} al ${b.getDate()} de ${MESES[b.getMonth()]}`;
}

/**
 * Pantallas de las historias, en orden. Solo entran las que tienen datos (3 a 7).
 * Siempre acaba en la tarjeta final.
 */
export function armarPantallas(res, tipo) {
  const p = [];
  if (res.minutos > 0) {
    p.push({
      id: 'minutos',
      pre: tipo === 'anio' ? 'Este año has escuchado' : 'Esta semana has escuchado',
      rango: textoRango(res.desde, res.hasta, tipo),
      minutos: res.minutos,
      reproducciones: res.reproducciones,
      distintas: res.cancionesDistintas,
    });
  }
  if (res.bucle) {
    const texto = res.bucle.n > 1 ? `La pusiste ${veces(res.bucle.n)}. Algo te dice.` : 'Ni una repetición: eres de pasar página.';
    p.push({ id: 'bucle', ...res.bucle, texto });
  }
  if (res.topArtistas.length) p.push({ id: 'artistas', artistas: res.topArtistas });
  if (res.horaFavorita !== null) p.push({ id: 'hora', hora: res.horaFavorita, frase: fraseHora(res.horaFavorita), nota: notaHora(res.horaFavorita), racha: res.racha });
  const comparativa = fraseComparativa(res, tipo);
  if (res.descubrimiento || comparativa) p.push({ id: 'curioso', descubrimiento: res.descubrimiento, comparativa });
  p.push({ id: 'final' });
  return p;
}
