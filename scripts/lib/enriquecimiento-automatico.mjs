/**
 * Orquesta el enriquecimiento automático en background: Deezer primero
 * (rápido, sin límite práctico), MusicBrainz después (lento, ~1.6s/track por
 * su política de rate limit) — y después de CADA uno, re-descubre modos
 * SOLO entre los tracks que siguen "Sin clasificar" y aplica el resultado
 * directo, sin pantalla de revisión (spec: "sin ningún botón manual").
 * Genius corre al final: guarda id/URL de página para uso futuro, pero no
 * aporta género ni ninguna otra señal de clasificación, así que no dispara
 * re-descubrimiento de modos.
 *
 * Un solo trabajo a la vez: si `dispararEnriquecimiento` se llama mientras
 * uno ya está corriendo, el segundo disparo se encola para cuando termine el
 * actual — nunca corren dos en paralelo (evita duplicar requests a las APIs
 * y pisarse escribiendo los mismos archivos de caché). Se puede llamar
 * tantas veces como se quiera (tras cada import, 15s después de arrancar el
 * servidor): las llamadas de más simplemente encolan o no hacen nada si ya
 * hay una encolada.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { enriquecerDeezer } from './enriquecer-deezer-core.mjs';
import { enriquecerFotosArtistas } from './enriquecer-fotos-artistas-core.mjs';
import { enriquecerMusicbrainz, refiltrarGenerosArtistasExistentes } from './enriquecer-musicbrainz-core.mjs';
import { enriquecerGenius } from './enriquecer-genius-core.mjs';
import { descubrirModos, VERSION_AGRUPACION } from './descubrir-modos.mjs';
import { resetearModosDescubiertos, restaurarManuales } from './resetear-modos.mjs';
import { armarEvidenciaPorTrack, soloGeneros } from './generos-por-track.mjs';
import { aplicarModosConfirmados } from './aplicar-modos.mjs';
import { escribirAtomico } from './escribir-atomico.mjs';
import { cargarFuentes } from './fuentes.mjs';

let jobActivo = false;
let jobEncolado = false;
let estadoActual = { activo: false, etapa: null, procesados: 0, total: 0 };

/** Estado actual en memoria — lo usa vite.config.js para mandarle el estado
 *  ya conocido a un cliente SSE que se conecta a mitad de un ciclo. */
export function estadoEnriquecimiento() {
  return estadoActual;
}

/**
 * Re-corre el descubrimiento de modos SOLO sobre los tracks que siguen
 * "Sin clasificar", y aplica directo lo que encuentre (sin pantalla de
 * revisión): mismo camino que POST /api/confirmar-modos, pero disparado
 * solo, no por una persona confirmando en pantalla. Los transversales NO se
 * tocan acá (spec: mecanismo aparte, sin cambios en este flujo).
 *
 * Si no hay tracks sin clasificar, o `fuentes.json` no existe/es inválido,
 * o el descubrimiento no encuentra ningún modo nuevo, no hace nada.
 */
export async function reDescubrirYAutoConfirmar(dataDir) {
  const bibPath = join(dataDir, 'biblioteca.json');
  const ejesPath = join(dataDir, 'ejes.json');
  const biblioteca = JSON.parse(readFileSync(bibPath, 'utf8'));
  const fuentes = cargarFuentes(dataDir);
  if (!fuentes) return;

  const sinClasificar = biblioteca.tracks.filter((t) => (t.ejes ?? []).some((a) => a.ejeId === 'sin-clasificar'));
  if (sinClasificar.length === 0) return;

  const evidenciaPorTrack = armarEvidenciaPorTrack(dataDir, biblioteca.tracks, fuentes);
  const generosPorTrack = soloGeneros(evidenciaPorTrack);
  const resultado = await descubrirModos(sinClasificar, generosPorTrack, fuentes, dataDir, biblioteca.tracks.length);

  const modosConfirmados = resultado.modosCandidatos
    .filter((m) => m.trackIds.length > 0)
    .map((m) => ({ nombre: m.nombre, trackIds: m.trackIds }));
  if (modosConfirmados.length === 0) return;

  // Con qué evidencia quedó clasificado cada track. Sin evidencia propia, el
  // track solo pudo entrar a un modo por propagación del residuo contra los
  // modos candidatos (ver descubrirModos), o sea por similitud de embeddings.
  const senalPorTrack = {};
  for (const [trackId, { senal }] of evidenciaPorTrack) {
    senalPorTrack[trackId] = senal ?? 'ia-embeddings';
  }

  const ejesActuales = JSON.parse(readFileSync(ejesPath, 'utf8'));
  const bibliotecaFresca = JSON.parse(readFileSync(bibPath, 'utf8'));
  aplicarModosConfirmados(ejesActuales, bibliotecaFresca, modosConfirmados, [], senalPorTrack);

  escribirAtomico(ejesPath, ejesActuales);
  escribirAtomico(bibPath, bibliotecaFresca);
}

/**
 * Cola compartida por rehacerModosSiCambioElAlgoritmo y
 * refiltrarGenerosMusicbrainzSiHaceFalta: ambas invalidan la evidencia de
 * TODA la biblioteca (no solo "Sin clasificar") y necesitan rehacer los
 * modos descubiertos desde cero, preservando las asignaciones manuales.
 */
async function reconstruirTodosLosModos(dataDir, fuentes) {
  const bibPath = join(dataDir, 'biblioteca.json');
  const ejesPath = join(dataDir, 'ejes.json');
  const ejesActuales = JSON.parse(readFileSync(ejesPath, 'utf8'));
  const biblioteca = JSON.parse(readFileSync(bibPath, 'utf8'));

  const { ejesQuitados, manuales } = resetearModosDescubiertos(ejesActuales, biblioteca);

  const evidenciaPorTrack = armarEvidenciaPorTrack(dataDir, biblioteca.tracks, fuentes);
  const generosPorTrack = soloGeneros(evidenciaPorTrack);
  const resultado = await descubrirModos(
    biblioteca.tracks,
    generosPorTrack,
    fuentes,
    dataDir,
    biblioteca.tracks.length
  );
  const modosConfirmados = resultado.modosCandidatos
    .filter((m) => m.trackIds.length > 0)
    .map((m) => ({ nombre: m.nombre, trackIds: m.trackIds }));

  const senalPorTrack = {};
  for (const [trackId, { senal }] of evidenciaPorTrack) senalPorTrack[trackId] = senal ?? 'ia-embeddings';
  aplicarModosConfirmados(ejesActuales, biblioteca, modosConfirmados, [], senalPorTrack);
  const manualesRestauradas = restaurarManuales(ejesActuales, biblioteca, manuales);

  escribirAtomico(ejesPath, ejesActuales);
  escribirAtomico(bibPath, biblioteca);

  return { ejesQuitados, modosNuevos: modosConfirmados.length, manualesRestauradas };
}

/**
 * Rehace TODOS los modos descubiertos si los actuales se armaron con una
 * versión vieja del algoritmo de agrupación.
 *
 * Sin esto, mejorar la agrupación solo serviría para bibliotecas nuevas: el
 * re-descubrimiento normal (arriba) solo mira lo que sigue "Sin clasificar",
 * así que un modo ya creado no se revisa nunca más. Una instalación que ya
 * corrió el enriquecimiento se quedaría con los modos viejos para siempre.
 *
 * Corre una sola vez por versión: la marca vive en su propio archivo y no en
 * ejes.json a propósito, porque ejes.json lo reescribe la UI entera cada vez
 * que alguien edita un eje desde Administrar, y ahí una clave de más se
 * perdería sin que nadie lo note (y la migración volvería a correr en cada
 * edición).
 */
export async function rehacerModosSiCambioElAlgoritmo(dataDir) {
  const marcaPath = join(dataDir, 'descubrimiento.json');
  const marca = existsSync(marcaPath) ? JSON.parse(readFileSync(marcaPath, 'utf8')) : {};
  if (marca?.version === VERSION_AGRUPACION) return null;

  const fuentes = cargarFuentes(dataDir);
  if (!fuentes) return null;

  const resultado = await reconstruirTodosLosModos(dataDir, fuentes);

  // La marca se escribe AL FINAL: si algo falla en el medio (se cierra la app,
  // se corta la red bajando el modelo de embeddings), la próxima vez se
  // vuelve a intentar en vez de darse por hecha a medias.
  escribirAtomico(marcaPath, { version: VERSION_AGRUPACION });

  return resultado;
}

const VERSION_FILTRO_GENEROS_MUSICBRAINZ = 1;

/**
 * Migración de un solo uso: reconsulta el género de todos los artistas ya
 * cacheados de MusicBrainz (ver refiltrarGenerosArtistasExistentes,
 * enriquecer-musicbrainz-core.mjs) con el filtro de top 3 por votos, y
 * reconstruye los modos descubiertos con esa evidencia limpia. Ver
 * docs/superpowers/specs/2026-09-14-filtro-generos-musicbrainz-design.md.
 *
 * Mismo patrón que rehacerModosSiCambioElAlgoritmo: marca propia en su
 * propio archivo, escrita solo al final para poder reintentar entero si se
 * corta a mitad de camino. Sin `contacto` configurado, se auto-omite sin
 * lanzar (mismo criterio que enriquecerMusicbrainz).
 */
export async function refiltrarGenerosMusicbrainzSiHaceFalta(dataDir, { contacto, onProgreso } = {}) {
  const marcaPath = join(dataDir, 'filtro-generos-musicbrainz.json');
  const marca = existsSync(marcaPath) ? JSON.parse(readFileSync(marcaPath, 'utf8')) : {};
  if (marca?.version === VERSION_FILTRO_GENEROS_MUSICBRAINZ) return null;

  const fuentes = cargarFuentes(dataDir);
  if (!fuentes) return null;

  const resultadoRefiltrado = await refiltrarGenerosArtistasExistentes(dataDir, { contacto, onProgreso });
  if (resultadoRefiltrado?.omitido) return resultadoRefiltrado;

  // Sin artistas cacheados (biblioteca nueva, o ninguno enriquecido todavía
  // por MusicBrainz), refiltrarGenerosArtistasExistentes no cambió nada
  // (`total: 0`) — sin este corte, cada instalación nueva pagaría una
  // pasada completa de embeddings de más, duplicando exactamente lo que
  // rehacerModosSiCambioElAlgoritmo ya acaba de hacer un momento antes en
  // el mismo ciclo. La marca igual se escribe: no hay nada que reintentar.
  if (resultadoRefiltrado.total === 0) {
    escribirAtomico(marcaPath, { version: VERSION_FILTRO_GENEROS_MUSICBRAINZ });
    return resultadoRefiltrado;
  }

  const resultadoModos = await reconstruirTodosLosModos(dataDir, fuentes);

  escribirAtomico(marcaPath, { version: VERSION_FILTRO_GENEROS_MUSICBRAINZ });

  return { ...resultadoRefiltrado, ...resultadoModos };
}

async function correrEtapa(etapa, dataDir, onCambioEstado, correr) {
  estadoActual = { activo: true, etapa, procesados: 0, total: 0 };
  onCambioEstado?.(estadoActual);
  return correr((procesados, total) => {
    estadoActual = { activo: true, etapa, procesados, total };
    onCambioEstado?.(estadoActual);
  });
}

// Un fallo acá (red caída a mitad de descubrimiento, fuentes.json corrupto)
// no debe cortar el ciclo de enriquecimiento completo — pero silenciarlo sin
// rastro deja este job de background sin forma de diagnosticar por qué
// "Sin clasificar" dejó de bajar. console.error alcanza: no hay UI que
// muestre esto (la spec pide "sin ningún botón manual", no un log viewer),
// solo la consola del servidor para cuando alguien vaya a mirar.
function logErrorSilencioso(etapa, error) {
  console.error(`[enriquecimiento-automatico] fallo en ${etapa}:`, error);
}

async function ejecutarCiclo(dataDir, contacto, tokenGenius, onCambioEstado) {
  jobActivo = true;
  do {
    // OJO: entre `jobActivo = true` y esta línea no puede haber ningún await.
    // Si lo hay, un disparo que llegue en el medio pone jobEncolado = true y
    // esta línea lo borra antes de que nadie lo lea: la re-corrida encolada se
    // pierde en silencio. Pasó al agregar la migración de abajo arriba de
    // todo, y lo agarró el test de encolado.
    jobEncolado = false;

    // Si los modos se armaron con un algoritmo viejo, rehacerlos antes que
    // nada: no tiene sentido que las etapas de abajo sumen evidencia sobre
    // unos modos que igual van a desaparecer. Después de la primera vez es
    // una lectura de un archivo chico y devuelve null.
    await rehacerModosSiCambioElAlgoritmo(dataDir)
      .then((r) => {
        if (r) {
          console.log(
            `[descubrimiento] modos rehechos con el algoritmo v${VERSION_AGRUPACION}: ` +
              `${r.ejesQuitados} viejos reemplazados por ${r.modosNuevos}, ` +
              `${r.manualesRestauradas} asignaciones manuales conservadas`
          );
        }
      })
      .catch((e) => logErrorSilencioso('rehacer modos tras cambio de algoritmo', e));

    await refiltrarGenerosMusicbrainzSiHaceFalta(dataDir, { contacto })
      .then((r) => {
        if (r?.omitido) {
          console.warn(
            `[filtro-generos-musicbrainz] omitido (${r.motivo}) — falta MUSICBRAINZ_CONTACT en .env.local.`
          );
        } else if (r) {
          console.log(
            `[filtro-generos-musicbrainz] ${r.procesados} artistas reconsultados (${r.saltados} saltados), ` +
              `${r.modosNuevos ?? 0} modos reconstruidos`
          );
        }
      })
      .catch((e) => logErrorSilencioso('refiltrar generos de MusicBrainz', e));

    await correrEtapa('deezer', dataDir, onCambioEstado, (onProgreso) => enriquecerDeezer(dataDir, { onProgreso }));
    await reDescubrirYAutoConfirmar(dataDir).catch((e) => logErrorSilencioso('re-descubrimiento tras Deezer', e));
    // Fotos de artista para las tarjetas con avatar (Home, buscador) — antes
    // quedaban con iniciales hasta visitar la página de cada artista. Fuera
    // de correrEtapa a propósito: su unidad es "artistas", no "canciones"
    // como el resto del ciclo, y el aviso genérico de arriba (App.jsx) dice
    // literalmente "X/Y canciones" — mezclar las dos unidades en la misma
    // barra de progreso mostraría un número sin sentido. Mismo criterio
    // silencioso que las migraciones de arriba: no aporta evidencia de
    // género/modo, así que tampoco hace falta re-descubrir después.
    await enriquecerFotosArtistas(dataDir)
      .then((r) => {
        if (r.total > 0) {
          console.log(`[fotos-artistas] ${r.encontrados}/${r.total} artistas con foto nueva (${r.sinResultado} sin match en Deezer)`);
        }
      })
      .catch((e) => logErrorSilencioso('fotos de artistas', e));
    const resultadoMb = await correrEtapa('musicbrainz', dataDir, onCambioEstado, (onProgreso) =>
      enriquecerMusicbrainz(dataDir, { contacto, onProgreso })
    );
    // enriquecerMusicbrainz nunca lanza por falta de contacto (se auto-omite,
    // ver enriquecer-musicbrainz-core.mjs) — así que sin este chequeo
    // explícito, un MUSICBRAINZ_CONTACT sin configurar queda indistinguible
    // de "no había nada pendiente" en los logs: exactamente el mismo
    // síntoma silencioso que esta feature existe para arreglar.
    if (resultadoMb?.omitido) {
      console.warn(
        `[enriquecimiento-automatico] MusicBrainz omitido (${resultadoMb.motivo}) — falta MUSICBRAINZ_CONTACT en .env.local.`
      );
    }
    await reDescubrirYAutoConfirmar(dataDir).catch((e) => logErrorSilencioso('re-descubrimiento tras MusicBrainz', e));

    const resultadoGenius = await correrEtapa('genius', dataDir, onCambioEstado, (onProgreso) =>
      enriquecerGenius(dataDir, { token: tokenGenius, onProgreso })
    );
    // Mismo motivo que el chequeo de MusicBrainz de arriba: enriquecerGenius
    // nunca lanza por falta de token (se auto-omite, ver
    // enriquecer-genius-core.mjs), así que sin este log un
    // GENIUS_ACCESS_TOKEN sin configurar queda indistinguible de "no había
    // tracks pendientes".
    if (resultadoGenius?.omitido) {
      console.warn(
        `[enriquecimiento-automatico] Genius omitido (${resultadoGenius.motivo}) — falta GENIUS_ACCESS_TOKEN en .env.local.`
      );
    }
  } while (jobEncolado);
  jobActivo = false;
  estadoActual = { activo: false, etapa: null, procesados: 0, total: 0 };
  onCambioEstado?.(estadoActual);
}

/**
 * Dispara un ciclo de enriquecimiento si no hay uno corriendo ya; si hay uno
 * corriendo, encola un segundo ciclo para cuando termine (ver comentario del
 * módulo). `contacto`: MUSICBRAINZ_CONTACT, se lo pasa tal cual a
 * enriquecerMusicbrainz (que se auto-omite si falta, sin lanzar).
 * `tokenGenius`: GENIUS_ACCESS_TOKEN, mismo criterio de auto-omisión para
 * enriquecerGenius. Un error inesperado en cualquier etapa no tira abajo el
 * servidor: se captura, se deja el estado en inactivo, y el próximo disparo
 * lo vuelve a intentar.
 *
 * Devuelve la promesa del ciclo que ESTA llamada disparó o encoló. Si no
 * había nada corriendo, es la promesa del ciclo completo (incluyendo
 * cualquier re-corrida encolada durante su ejecución) — se puede `await`
 * para saber cuándo terminó todo. Si ya había un job activo, esta llamada
 * solo encola una re-corrida y devuelve una promesa ya resuelta: no
 * representa el fin de esa re-corrida encolada, solo confirma que quedó
 * anotada (vite.config.js no espera ninguna de las dos, fire-and-forget).
 */
export function dispararEnriquecimiento(dataDir, { contacto, tokenGenius, onCambioEstado } = {}) {
  if (jobActivo) {
    jobEncolado = true;
    return Promise.resolve();
  }
  return ejecutarCiclo(dataDir, contacto, tokenGenius, onCambioEstado).catch((e) => {
    logErrorSilencioso('ciclo completo', e);
    jobActivo = false;
    jobEncolado = false;
    estadoActual = { activo: false, etapa: null, procesados: 0, total: 0 };
    onCambioEstado?.(estadoActual);
  });
}
