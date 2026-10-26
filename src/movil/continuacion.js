// src/movil/continuacion.js
// «Reproducción automática» y «Radio del modo»: qué canciones añadir cuando la
// cola se acaba. Puro (sin React ni red): recibe la biblioteca, la cola, el
// historial y, si los hay, los vectores de similitud (embeddings) del móvil.
import { azar01, barajarConMemoria, ultimaVezDeHistorial } from './barajar.js';
import { filtrarNoMeGusta } from './noMeGusta.js';

const HORA_MS = 3600000;
const IGNORADOS = new Set(['sin-clasificar', 'favoritos']);
const SEMILLAS = 5;

function coseno(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function centroide(vectores) {
  if (vectores.length === 0) return null;
  const c = new Array(vectores[0].length).fill(0);
  for (const v of vectores) for (let i = 0; i < c.length; i += 1) c[i] += v[i];
  return c;
}

const claveArtista = (t) => String(t.artista ?? '').toLowerCase().trim();
const idsDe = (t) => [t.id, t.trackIdReal].filter(Boolean);

/** Toma `k` de `lista` (ya ordenada por preferencia) con tope por artista; si no llega, relaja el tope. */
function tomar(lista, k, usadas, porArtista, tope) {
  const salida = [];
  for (const limite of [tope, Infinity]) {
    for (const t of lista) {
      if (salida.length >= k) return salida;
      if (usadas.has(t.id)) continue;
      const a = claveArtista(t);
      if ((porArtista.get(a) ?? 0) >= limite) continue;
      usadas.add(t.id);
      porArtista.set(a, (porArtista.get(a) ?? 0) + 1);
      salida.push(t);
    }
  }
  return salida;
}

/**
 * @param {object} p
 * @param {Array} p.tracks biblioteca ({ id, trackIdReal?, artista, ejes: [{ ejeId }] })
 * @param {Array} [p.cola] canciones ya en cola (no se repiten)
 * @param {Array} [p.historial] entradas { trackId, ts }, de la más nueva a la más vieja
 * @param {Array} [p.vectores] registros { trackId, vector }
 * @param {string|null} [p.modoId] radio de este modo (si no, «reproducción automática»)
 * @param {number} [p.fraccionFuera] parte de la tanda que viene de fuera del modo (radio)
 * @param {boolean} [p.excluirRecientes] no repetir lo de la última hora
 * @param {Array} [p.marcas] «No me gusta»: canciones y artistas que no se eligen nunca
 * @returns {Array} canciones de la biblioteca a añadir, en el orden en que deben sonar
 */
export function elegirContinuacion({
  tracks,
  cola = [],
  historial = [],
  vectores = [],
  ahora = Date.now(),
  n = 10,
  modoId = null,
  fraccionFuera = 0,
  excluirRecientes = true,
  marcas = [],
  rng = azar01,
  tope = 2,
}) {
  const porId = new Map();
  for (const t of tracks) for (const id of idsDe(t)) porId.set(id, t);
  const vec = new Map(vectores.map((v) => [v.trackId, v.vector]));
  const vectorDe = (t) => idsDe(t).map((id) => vec.get(id)).find(Boolean) ?? null;

  const excluidas = new Set();
  for (const t of cola) for (const id of idsDe(t)) excluidas.add(id);
  const recientes = new Set();
  if (excluirRecientes) {
    for (const h of historial) if (h.ts > ahora - HORA_MS) recientes.add(h.trackId);
  }
  const disponibles = (conRecientes) =>
    tracks.filter((t) => !idsDe(t).some((id) => excluidas.has(id) || (conRecientes && recientes.has(id))));
  let candidatas = filtrarNoMeGusta(disponibles(true), marcas);
  if (candidatas.length < n) candidatas = filtrarNoMeGusta(disponibles(false), marcas); // biblioteca pequeña: mejor repetir que parar

  const modosDe = (t) => (t.ejes ?? []).map((e) => e.ejeId).filter((id) => id && !IGNORADOS.has(id));

  // Semillas: el modo entero (radio) o las últimas escuchadas (o la cola, si no hay historial utilizable).
  let semillas = [];
  if (modoId) {
    semillas = tracks.filter((t) => (t.ejes ?? []).some((e) => e.ejeId === modoId));
  } else {
    const vistas = new Set();
    for (const h of historial) {
      const t = porId.get(h.trackId);
      if (!t || vistas.has(t.id)) continue;
      vistas.add(t.id);
      semillas.push(t);
      if (semillas.length >= SEMILLAS) break;
    }
    if (semillas.length === 0) {
      semillas = cola.slice(-SEMILLAS).map((t) => porId.get(t.trackIdReal ?? t.id) ?? t);
    }
  }

  const pesoModos = new Map();
  if (modoId) pesoModos.set(modoId, 1);
  else for (const s of semillas) for (const m of new Set(modosDe(s))) pesoModos.set(m, (pesoModos.get(m) ?? 0) + 1);
  const enModoSemilla = (t) => (modoId
    ? (t.ejes ?? []).some((e) => e.ejeId === modoId)
    : modosDe(t).some((m) => pesoModos.has(m)));
  const pesoDe = (t) => {
    let p = 0;
    for (const m of new Set(modosDe(t))) p += pesoModos.get(m) ?? 0;
    return Math.min(1, p / Math.max(1, semillas.length));
  };

  const centro = centroide(semillas.map(vectorDe).filter(Boolean));
  const simDe = (t) => {
    const v = centro && vectorDe(t);
    return v ? coseno(centro, v) : null;
  };
  const artistasSemilla = new Set(semillas.map(claveArtista));
  const afinidad = (t) => (artistasSemilla.has(claveArtista(t)) ? 1 : 0);
  const conPuntos = (lista, f) => lista.map((t) => ({ t, p: f(t) + rng() * 0.15 })).sort((a, b) => b.p - a.p).map((x) => x.t);

  const usadas = new Set();
  const porArtista = new Map();

  if (modoId) {
    const nFuera = Math.min(n, Math.round(n * fraccionFuera));
    const dentro = candidatas.filter(enModoSemilla);
    const fuera = candidatas.filter((t) => !enModoSemilla(t));
    // Fuera del modo: lo más parecido (similitud; sin vectores, mismo artista que el modo y al azar).
    const fueraOrd = conPuntos(fuera, (t) => (simDe(t) ?? 0) + (centro ? 0 : afinidad(t) * 0.5));
    const elegidasFuera = tomar(fueraOrd, nFuera, usadas, porArtista, tope);
    // Dentro del modo: al azar, con prioridad a lo que lleva más tiempo sin sonar.
    const ultima = ultimaVezDeHistorial(historial);
    const porTrack = new Map(dentro.map((t) => [t.id, t]));
    const ultimaPorId = new Map(dentro.map((t) => [t.id, idsDe(t).map((id) => ultima.get(id)).find((x) => x != null)]).filter(([, u]) => u != null));
    const dentroOrd = barajarConMemoria([...porTrack.keys()], ultimaPorId, ahora, rng).map((id) => porTrack.get(id));
    const elegidasDentro = tomar(dentroOrd, n - elegidasFuera.length, usadas, porArtista, tope);
    // Si el modo no da para más, se completa con más de fuera.
    const faltan = n - elegidasDentro.length - elegidasFuera.length;
    if (faltan > 0) elegidasFuera.push(...tomar(fueraOrd, faltan, usadas, porArtista, tope));
    const total = elegidasDentro.length + elegidasFuera.length;
    const salida = [...elegidasDentro];
    elegidasFuera.forEach((t, k) => {
      const pos = Math.min(salida.length, Math.round(((k + 0.5) * total) / elegidasFuera.length));
      salida.splice(pos, 0, t);
    });
    return salida;
  }

  // Reproducción automática: primero el mismo modo, luego las vecinas por similitud.
  const mismoModo = conPuntos(candidatas.filter(enModoSemilla), (t) => pesoDe(t) + (simDe(t) ?? 0) * 0.5);
  const resto = candidatas.filter((t) => !enModoSemilla(t));
  const vecinas = conPuntos(resto, (t) => (simDe(t) ?? 0) + afinidad(t) * 0.3);
  return tomar([...mismoModo, ...vecinas], n, usadas, porArtista, tope);
}
