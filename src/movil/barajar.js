// src/movil/barajar.js
// Aleatorio de verdad y con memoria: azar criptográfico (crypto.getRandomValues) y,
// entre sesiones, prioridad a lo que no suena hace tiempo. Puro salvo `azar01`.
const DIA_MS = 86400000;
export const DIAS_RECIENTE = 3; // lo escuchado en los últimos días queda al final
const DIAS_TOPE = 60; // a partir de aquí, «hace mucho» pesa igual que «nunca»
const AGRUPAR = 30; // hasta cuántas posiciones se mira adelante para no juntar artistas

/** Número en [0, 1) con crypto.getRandomValues (Math.random solo si no existe). */
export function azar01() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const v = new Uint32Array(2);
    c.getRandomValues(v);
    return (v[0] * 2 ** 21 + (v[1] >>> 11)) / 2 ** 53; // 53 bits
  }
  return Math.random();
}

/** Fisher-Yates con azar criptográfico. */
export function mezclar(lista, rnd = azar01) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Mapa trackId -> última vez (ms) que sonó, a partir de las entradas del historial. */
export function ultimaVezDeHistorial(historial) {
  const m = new Map();
  for (const h of historial ?? []) {
    if (h?.trackId && h.ts > (m.get(h.trackId) ?? 0)) m.set(h.trackId, h.ts);
  }
  return m;
}

// Muestreo ponderado sin reemplazo (Efraimidis-Spirakis): clave = u^(1/peso), de mayor a menor.
function ordenPonderado(ids, peso, rnd) {
  return ids
    .map((id) => ({ id, k: Math.log(Math.max(rnd(), Number.MIN_VALUE)) / peso(id) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.id);
}

/**
 * Orden aleatorio de `ids` que da prioridad a lo que lleva más tiempo sin sonar.
 * - Lo que no ha sonado en los últimos DIAS_RECIENTE días: orden aleatorio, peso 1..4 según
 *   lo viejo que sea (nunca = 4 = hace ≥ 60 días). Todos pueden salir primero.
 * - Lo reciente va después, con el mismo criterio (lo más antiguo antes).
 * @param {Array} ids
 * @param {Map|Object} ultimaVez id -> ms (los que faltan cuentan como «nunca»)
 */
export function barajarConMemoria(ids, ultimaVez, ahora = Date.now(), rnd = azar01) {
  const ultima = (id) => (ultimaVez instanceof Map ? ultimaVez.get(id) : ultimaVez?.[id]);
  const edadDias = (id) => {
    const t = ultima(id);
    return t == null ? Infinity : Math.max(0, (ahora - t) / DIA_MS);
  };
  const peso = (id) => 1 + (3 * Math.min(edadDias(id), DIAS_TOPE)) / DIAS_TOPE;
  const noRecientes = [];
  const recientes = [];
  for (const id of ids) (edadDias(id) < DIAS_RECIENTE ? recientes : noRecientes).push(id);
  return [...ordenPonderado(noRecientes, peso, rnd), ...ordenPonderado(recientes, peso, rnd)];
}

/**
 * Como barajarConMemoria sobre canciones ({ id, trackIdReal?, artista }), pero evitando que dos
 * del mismo artista queden seguidas: en cada hueco toma la primera del orden (dentro de una
 * ventana corta) cuyo artista no sea el de la anterior.
 */
export function barajarSeparandoArtistas(tracks, ultimaVez, ahora = Date.now(), rnd = azar01) {
  const clave = (t) => t.trackIdReal ?? t.id;
  const porClave = new Map(tracks.map((t) => [clave(t), t]));
  const ultima = new Map();
  for (const t of tracks) {
    const u = ultimaVez instanceof Map ? ultimaVez.get(clave(t)) ?? ultimaVez.get(t.id) : undefined;
    if (u != null) ultima.set(clave(t), u);
  }
  const orden = barajarConMemoria([...porClave.keys()], ultima, ahora, rnd).map((k) => porClave.get(k));
  // Si había ids repetidos en `tracks`, se conservan todos.
  if (orden.length !== tracks.length) return mezclar(tracks, rnd);
  const artista = (t) => String(t.artista ?? '').toLowerCase();
  const esReciente = (t) => ahora - (ultima.get(clave(t)) ?? -Infinity) < DIAS_RECIENTE * DIA_MS;
  // Cada tramo (no recientes, luego recientes) se separa por su cuenta: las recientes no se adelantan.
  const salida = [];
  for (const tramo of [orden.filter((t) => !esReciente(t)), orden.filter(esReciente)]) {
    while (tramo.length > 0) {
      const previo = salida.length ? artista(salida[salida.length - 1]) : null;
      let i = tramo.findIndex((t, k) => k < AGRUPAR && artista(t) !== previo);
      if (i < 0) i = 0;
      salida.push(tramo.splice(i, 1)[0]);
    }
  }
  return salida;
}
