// src/movil/saltos.js
// Saltos rápidos: si el usuario salta la misma canción varias veces tras oírla poco,
// se marca como «no me gusta»; y si salta muchas de un artista, se le pregunta por él. Puro.
import { artistasDe, claveCancion, norm } from './inicio/claves.js';

/** Clave de configuración (IndexedDB) donde se guarda el contador. */
export const CLAVE_SALTOS = 'saltosRapidos';

/**
 * Interruptor de la regla. Desactivada el 2026-11-08: saltar rápido al buscar o probar música
 * sacaba canciones por error. Con `false` no se cuentan saltos, no se marca nada ni se pregunta por artistas.
 * Lo ya marcado (origen `saltos`) se queda y se devuelve con «Quitar» en No me gusta.
 */
export const SALTOS_MARCAN = false;

export const SEGUNDOS_SALTO = 10;
export const SEGUNDOS_MINIMOS = 1;
export const SALTOS_PARA_MARCAR = 3;
export const CANCIONES_PARA_ARTISTA = 4;
const MS_ANTIREBOTE = 2000;
/** Oír más de esta fracción de la canción pone su contador de saltos a cero. */
export const FRACCION_REINICIA = 0.7;

export const reiniciaPorEscucha = (fraccion) => fraccion > FRACCION_REINICIA;

/** Oír entre 1 s y 10 s (sin incluir) cuenta como salto rápido. */
export const esSaltoRapido = (segundosOidos) =>
  segundosOidos >= SEGUNDOS_MINIMOS && segundosOidos < SEGUNDOS_SALTO;

/** Cuenta un salto del `track`; `marcar` es true al llegar al umbral. Ignora repeticiones a menos de 2 s (en cualquier sentido: el nativo puede llegar con hora anterior). */
export function registrarSalto(estado, track, ahora) {
  const canciones = estado?.canciones ?? {};
  const clave = claveCancion(track.artista, track.titulo);
  const previo = canciones[clave];
  if (previo && Math.abs(ahora - previo.ultimo) < MS_ANTIREBOTE) {
    return { estado: { ...estado, canciones }, marcar: false };
  }
  const n = (previo?.n ?? 0) + 1;
  return {
    estado: { ...estado, canciones: { ...canciones, [clave]: { n, ultimo: ahora } } },
    marcar: n >= SALTOS_PARA_MARCAR,
  };
}

/** Pone a cero el contador de una canción (p. ej. si se escucha entera). */
export function reiniciarCancion(estado, track) {
  const clave = claveCancion(track.artista, track.titulo);
  const { [clave]: _quitada, ...resto } = estado?.canciones ?? {};
  return { ...estado, canciones: resto };
}

/**
 * Artistas con `CANCIONES_PARA_ARTISTA` o más marcas de canción hechas por saltos, sin marca de
 * artista y cuyo `n` supera el que tenían cuando el usuario los rechazó (`rechazados[clave]`).
 * Las marcas por saltos llevan `artista` (texto original del track); `nombre` es el original.
 */
export function artistasAPreguntar(marcas, rechazados) {
  const lista = marcas ?? [];
  const yaMarcados = new Set(lista.filter((m) => m.tipo === 'artista').map((m) => m.clave));
  const cuentas = new Map();
  for (const m of lista) {
    if (m.tipo !== 'cancion' || m.origen !== 'saltos' || m.artista == null) continue;
    for (const nombre of artistasDe(m.artista)) {
      const clave = norm(nombre);
      const c = cuentas.get(clave) ?? { nombre, n: 0 };
      c.n += 1;
      cuentas.set(clave, c);
    }
  }
  return [...cuentas]
    .filter(([clave, { n }]) => n >= CANCIONES_PARA_ARTISTA && !yaMarcados.has(clave) && n > (rechazados?.[clave] ?? 0))
    .map(([, { nombre, n }]) => ({ nombre, n }));
}

/** Anotaciones del servicio nativo (saltos y oídas) por hora de anotación; las que no traen `ts` van al principio. */
export const ordenarPendientesNativos = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .map((s, i) => [s, i])
    .sort(([a, i], [b, j]) => (a.ts ?? 0) - (b.ts ?? 0) || i - j)
    .map(([s]) => s);

/**
 * Busca la canción de cada anotación nativa (`{id, titulo?, artista?, tipo?, segundos, fraccion, ts}`).
 * Con título y artista (lo normal): por `claveCancion` en la biblioteca, que se espera cargada (si no, se
 * retiene). Las antiguas, sin título, por id de reproductor entre la cola, que se espera no vacía.
 * `idsDe(track)` da los ids que puede tener una canción (videoId, resuelto en sesión, `local:…`).
 * Devuelve {resueltos: [{salto, track}], retenidos: [salto]}; lo que no se encuentra se descarta, salvo una
 * reproducción (`tipo: 'reproduccion'`), que va con `track: null`: sonó aunque ya no esté en ningún sitio.
 */
export function resolverPendientesNativos(pendientes, { tracks = [], bibliotecaCargada = false, cola = [], idsDe = () => [] }) {
  const resueltos = [];
  const retenidos = [];
  let porClave = null;
  const claves = () => {
    if (!porClave) {
      porClave = new Map();
      for (const t of tracks) {
        const k = claveCancion(t.artista, t.titulo);
        if (!porClave.has(k)) porClave.set(k, t);
      }
    }
    return porClave;
  };
  const porId = (id) => {
    const enCola = cola.find((c) => c.youtubeVideoId === id || idsDe(c).includes(id));
    return enCola ? (tracks.find((x) => x.id === enCola.id) ?? enCola) : null;
  };
  for (const salto of pendientes ?? []) {
    if (!salto?.id) continue;
    const esReproduccion = salto.tipo === 'reproduccion';
    if (salto.titulo && (salto.artista || esReproduccion)) {
      if (!bibliotecaCargada) {
        retenidos.push(salto);
        continue;
      }
      const track = claves().get(claveCancion(salto.artista, salto.titulo)) ?? porId(salto.id);
      if (track || esReproduccion) resueltos.push({ salto, track: track ?? null });
    } else {
      if (cola.length === 0) {
        retenidos.push(salto);
        continue;
      }
      const track = porId(salto.id);
      if (track) resueltos.push({ salto, track });
    }
  }
  return { resueltos, retenidos };
}

/**
 * ¿«Siguiente» pulsado en la app cuenta como salto? Solo si la canción sonaba de verdad: ni error ni
 * resolución en curso, y ni en modo sin señal (espera o guardadas de respaldo) donde lo que suena no es
 * la canción de la cola.
 */
export const cuentaComoSaltoUsuario = ({ esMovil, hayCancion, sonando, estadoResolucion, senalDebilActivo, pistaRespaldo }) =>
  !!(esMovil && hayCancion && sonando && !estadoResolucion && !senalDebilActivo && !pistaRespaldo);
