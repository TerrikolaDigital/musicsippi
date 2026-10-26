// src/movil/estadisticas.js
// «Tus estadísticas»: cálculos puros sobre el historial de escucha (sin React).
// Cada entrada del historial es { trackId, ts, ejeId?, ejeNombre?, titulo?, artista?, duracionS? }.
// Si una entrada no guarda la duración (historial anterior), se usa la de la canción en la
// biblioteca (`duracionDe`) y, si tampoco hay, una estimada (DURACION_ESTIMADA_S).
export const DURACION_ESTIMADA_S = 210;
export const PERIODOS = ['semana', 'mes', 'anio', 'siempre'];
const TOP = 5;

const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const claveDia = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Instante (ms) en que empieza el periodo (calendario: semana desde el lunes). 0 = siempre. */
export function inicioPeriodo(periodo, ahora = Date.now()) {
  const hoy = inicioDia(new Date(ahora));
  switch (periodo) {
    case 'semana':
      return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7)).getTime();
    case 'mes':
      return new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
    case 'anio':
      return new Date(hoy.getFullYear(), 0, 1).getTime();
    default:
      return 0;
  }
}

/** Racha de días seguidos con música: la actual (hoy o, si aún no has escuchado hoy, hasta ayer) y la mejor. */
export function rachaDias(entradas, ahora = Date.now()) {
  const dias = new Set(entradas.map((e) => claveDia(new Date(e.ts))));
  const hoy = inicioDia(new Date(ahora));
  const haceDias = (n) => claveDia(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - n));
  let actual = 0;
  let desde = dias.has(haceDias(0)) ? 0 : 1;
  while (dias.has(haceDias(desde + actual))) actual += 1;
  // Mejor racha: recorrer los días distintos en orden.
  const orden = [...new Set(entradas.map((e) => inicioDia(new Date(e.ts)).getTime()))].sort((a, b) => a - b);
  let mejor = 0;
  let corrida = 0;
  let previo = null;
  for (const t of orden) {
    const d = new Date(t);
    const ayer = previo === null ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
    corrida = previo !== null && previo === ayer ? corrida + 1 : 1;
    mejor = Math.max(mejor, corrida);
    previo = t;
  }
  return { actual, mejor: Math.max(mejor, actual) };
}

/**
 * @param {object} p
 * @param {Array} p.historial entradas del historial (cualquier orden)
 * @param {Array} [p.tracks] biblioteca ({ id, trackIdReal?, titulo, artista, ejes: [{ ejeId }] })
 * @param {Array} [p.ejes] modos ({ id, nombre, sistema?, activo? })
 * @param {'semana'|'mes'|'anio'|'siempre'} [p.periodo]
 * @param {(trackId: string) => number|null} [p.duracionDe] segundos de una canción de la biblioteca
 */
export function calcularEstadisticas({ historial, tracks = [], ejes = [], periodo = 'siempre', ahora = Date.now(), duracionDe = () => null }) {
  const porId = new Map();
  for (const t of tracks) {
    porId.set(t.id, t);
    if (t.trackIdReal) porId.set(t.trackIdReal, t);
  }
  const modosValidos = new Map(ejes.filter((e) => !e.sistema && e.activo !== false).map((e) => [e.id, e]));
  const segundosDe = (e) => {
    if (Number.isFinite(e.duracionS) && e.duracionS > 0) return e.duracionS;
    const d = duracionDe(e.trackId);
    return Number.isFinite(d) && d > 0 ? d : DURACION_ESTIMADA_S;
  };

  const todas = (historial ?? []).filter((e) => e && Number.isFinite(e.ts));
  const suma = (desde) => todas.reduce((s, e) => (e.ts >= desde ? s + segundosDe(e) : s), 0);
  const tiempos = {
    semana: suma(inicioPeriodo('semana', ahora)),
    mes: suma(inicioPeriodo('mes', ahora)),
    total: suma(0),
  };

  const desde = inicioPeriodo(periodo, ahora);
  const entradas = todas.filter((e) => e.ts >= desde && e.ts <= ahora + 60000);

  const canciones = new Map();
  const artistas = new Map();
  const modos = new Map();
  let segundos = 0;
  for (const e of entradas) {
    const s = segundosDe(e);
    segundos += s;
    const track = porId.get(e.trackId) ?? null;
    const titulo = track?.titulo ?? e.titulo ?? '';
    const artista = track?.artista ?? e.artista ?? '';

    const c = canciones.get(e.trackId) ?? { trackId: e.trackId, track, titulo, artista, n: 0, segundos: 0 };
    c.n += 1;
    c.segundos += s;
    canciones.set(e.trackId, c);

    const claveA = artista.trim().toLowerCase();
    if (claveA) {
      const a = artistas.get(claveA) ?? { nombre: artista.trim(), n: 0, segundos: 0 };
      a.n += 1;
      a.segundos += s;
      artistas.set(claveA, a);
    }

    // Modo: el de la reproducción si existe todavía; si no, se reparte entre los modos de la canción.
    let ids = modosValidos.has(e.ejeId) ? [e.ejeId] : [];
    if (ids.length === 0 && track) ids = [...new Set((track.ejes ?? []).map((x) => x.ejeId))].filter((id) => modosValidos.has(id));
    for (const id of ids) {
      const m = modos.get(id) ?? { ejeId: id, nombre: modosValidos.get(id).nombre, n: 0, segundos: 0 };
      m.n += 1 / ids.length;
      m.segundos += s / ids.length;
      modos.set(id, m);
    }
  }

  const porPeso = (a, b) => b.n - a.n || b.segundos - a.segundos;
  const topModos = [...modos.values()].sort(porPeso);
  const totalModos = topModos.reduce((s, m) => s + m.segundos, 0);
  return {
    segundos,
    reproducciones: entradas.length,
    cancionesDistintas: canciones.size,
    artistasDistintos: artistas.size,
    tiempos,
    topCanciones: [...canciones.values()].sort(porPeso).slice(0, TOP),
    topArtistas: [...artistas.values()].sort(porPeso).slice(0, TOP),
    topModos: topModos.slice(0, TOP),
    reparto: topModos.map((m) => ({ ejeId: m.ejeId, nombre: m.nombre, segundos: m.segundos, fraccion: totalModos > 0 ? m.segundos / totalModos : 0 })),
    racha: rachaDias(todas, ahora),
  };
}
