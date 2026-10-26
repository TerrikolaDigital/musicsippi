/**
 * Núcleo de enriquecimiento MusicBrainz, extraído de
 * scripts/enriquecer-musicbrainz.mjs para reuso desde el enriquecimiento
 * automático en background (scripts/lib/enriquecimiento-automatico.mjs). Ver
 * ese script para el detalle de cada decisión (por qué 1600ms, por qué
 * ConsultaAgotada en vez de null, elegirAlbumYAnio, etc.) — acá se movió el
 * cuerpo intacto a funciones reusables.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { elegirGenerosRelevantes } from './filtrar-generos-musicbrainz.mjs';
import {
  tituloParaBuscar,
  tituloSinSufijoFinal,
  escaparLucene,
  elegirCandidato,
  elegirAlbumYAnio,
} from './musicbrainz-puro.mjs';

export { tituloSinSufijoFinal } from './musicbrainz-puro.mjs';

// 1 req/s + margen (política de la API). En corridas sostenidas el servidor
// throttleó más agresivo con 1100-1300ms; 1600ms redujo la frecuencia de 503.
const ESPERA_MS = 1600;
const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

/** Se lanza cuando se agotaron los reintentos sin conseguir una respuesta válida. */
class ConsultaAgotada extends Error {}

/**
 * GET con el User-Agent exigido y reintento ante 503 (limitador de tasa del
 * servidor) o ante fallos de red. Al agotar los reintentos lanza
 * `ConsultaAgotada` en vez de devolver `null` — así quien llama distingue
 * "no encontrado de verdad" de "no se pudo ni preguntar" y no cachea lo
 * segundo como si fuera lo primero.
 */
async function pedir(url, contacto, intento = 0) {
  let r;
  try {
    r = await fetch(url, {
      headers: { 'User-Agent': `AppMusicaPersonal/0.1 (${contacto})`, Accept: 'application/json' },
    });
  } catch (e) {
    if (intento >= 5) throw new ConsultaAgotada(`fallo de red: ${e.message}`);
    await esperar(2000 * (intento + 1));
    return pedir(url, contacto, intento + 1);
  }

  if (r.status === 503) {
    if (intento >= 5) throw new ConsultaAgotada('límite de tasa persistente');
    await esperar(2000 * (intento + 1));
    return pedir(url, contacto, intento + 1);
  }
  if (!r.ok) {
    if (intento < 3) {
      await esperar(1000 * (intento + 1));
      return pedir(url, contacto, intento + 1);
    }
    throw new ConsultaAgotada(`HTTP ${r.status} persistente`);
  }
  return r.json();
}

/**
 * Consulta MusicBrainz para los tracks de `dataDir/biblioteca.json` que
 * todavía no están en `data/metadata-musicbrainz.json`, y para los artistas
 * nuevos que aparecen en esos resultados. Persiste ahí, incremental.
 *
 * `contacto`: valor de MUSICBRAINZ_CONTACT (política de la API, exige un
 * User-Agent identificable). Si faltara y hubiera tracks pendientes, no hace
 * ninguna petición y devuelve `{ omitido: true, motivo: 'falta_contacto' }`
 * — nunca lanza, para no tirar abajo el enriquecimiento automático completo
 * por una variable de entorno sin configurar.
 * `onProgreso(procesados, total)` se llama tras cada track y, en una segunda
 * pasada separada, tras cada artista consultado.
 * `limite` acota cuántos tracks se procesan en esta llamada (default: todos
 * los pendientes).
 */
export async function enriquecerMusicbrainz(dataDir, { contacto, onProgreso, limite = Infinity } = {}) {
  const metaPath = join(dataDir, 'metadata-musicbrainz.json');
  const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
  const meta = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, 'utf8'))
    : { version: 1, tracks: {}, artistas: {} };

  // Pendiente = nunca consultado. Con una excepción de una sola vez: un track
  // que quedó SIN ficha antes de que existiera el reintento sin sufijo nunca
  // volvería a consultarse (tener entrada en meta.tracks ya lo cuenta como
  // hecho, aunque esa entrada diga mbid:null), así que el arreglo no serviría
  // para nadie que ya haya corrido el enriquecimiento. Se los vuelve a
  // encolar una vez; `reintentoSinSufijo` queda grabado en la entrada
  // fallida, así que si vuelve a fallar no se reintenta nunca más.
  const faltaReintento = (t) => {
    const entrada = meta.tracks[t.id];
    if (!entrada) return true;
    if (entrada.mbid || entrada.reintentoSinSufijo) return false;
    return tituloSinSufijoFinal(tituloParaBuscar(t.titulo)) !== null;
  };
  const pendientes = biblioteca.tracks.filter(faltaReintento);
  const tanda = pendientes.slice(0, limite);

  if (tanda.length > 0 && !contacto) {
    return { omitido: true, motivo: 'falta_contacto' };
  }

  function guardar() {
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  const artistaNombreAMbid = new Map();
  let encontrados = 0;
  let sinResultado = 0;
  let saltados = 0;

  for (const [i, track] of tanda.entries()) {
    const tituloBuscado = tituloParaBuscar(track.titulo);
    // El título tal cual primero; solo si eso no encuentra nada se reintenta
    // sin el sufijo final entre paréntesis (ver tituloSinSufijoFinal). Como
    // el reintento solo corre sobre lo que YA falló, no puede empeorar
    // ningún match que hoy funcione, y gasta una consulta de más nada más
    // que en los tracks que de otro modo quedaban sin ficha.
    const intentos = [tituloBuscado];
    const sinSufijo = tituloSinSufijoFinal(tituloBuscado);
    if (sinSufijo) intentos.push(sinSufijo);

    let elegido = null;
    let agotada = false;
    for (const [n, titulo] of intentos.entries()) {
      // Cada consulta cuenta contra el límite de 1 req/s de MusicBrainz: la
      // espera entre el primer intento y el segundo va acá, la de después
      // del track completo sigue al final del loop de afuera.
      if (n > 0) await esperar(ESPERA_MS);
      const q = `recording:"${escaparLucene(titulo)}" AND artist:"${escaparLucene(track.artista)}"`;
      const url = 'https://musicbrainz.org/ws/2/recording/?fmt=json&limit=5&query=' + encodeURIComponent(q);
      let j;
      try {
        j = await pedir(url, contacto);
      } catch (e) {
        if (!(e instanceof ConsultaAgotada)) throw e;
        agotada = true;
        break;
      }
      const candidatos = (j?.recordings ?? []).filter((r) => (r.score ?? 0) >= 60);
      elegido = elegirCandidato(candidatos, titulo);
      if (elegido) break;
    }

    if (agotada) {
      saltados++;
      onProgreso?.(i + 1, tanda.length);
      await esperar(ESPERA_MS);
      continue;
    }

    if (elegido) {
      const { rec, exacto } = elegido;
      const { album, anio } = elegirAlbumYAnio(rec.releases);
      const artista = rec['artist-credit']?.[0]?.artist;

      meta.tracks[track.id] = {
        mbid: rec.id,
        score: rec.score,
        tituloAproximado: !exacto,
        album,
        anio,
        duracionMs: rec.length ?? null,
        artistaMbid: artista?.id ?? null,
      };
      if (artista?.id && !meta.artistas[artista.id]) {
        artistaNombreAMbid.set(artista.id, artista.name);
      }
      encontrados++;
    } else {
      // `reintentoSinSufijo` marca que ya se probó también sin el sufijo, para
      // que este track no vuelva a encolarse en cada arranque (ver
      // `faltaReintento` arriba).
      meta.tracks[track.id] = { mbid: null, album: null, anio: null, reintentoSinSufijo: true };
      sinResultado++;
    }

    if ((i + 1) % 20 === 0 || i === tanda.length - 1) guardar();
    onProgreso?.(i + 1, tanda.length);
    await esperar(ESPERA_MS);
  }

  // Bug real (verificado contra datos de producción, 2026-09-12): acá solo
  // entraban los artistas descubiertos EN ESTA corrida. Si esta función se
  // corta (se cierra la app, se reinicia) a mitad del loop de géneros de
  // abajo, los artistas que faltaban quedaban con el MBID ya guardado en
  // `meta.tracks` pero sin género para siempre — sus tracks ya cuentan como
  // "hechos" (tienen entrada en meta.tracks) así que ninguna corrida futura
  // los vuelve a poner en `tanda`, y por lo tanto nunca reaparecían acá. Se
  // suma cualquier MBID ya conocido de una corrida anterior que siga sin
  // género en meta.artistas, no solo los nuevos de esta tanda.
  for (const t of Object.values(meta.tracks)) {
    if (t?.artistaMbid && !meta.artistas[t.artistaMbid] && !artistaNombreAMbid.has(t.artistaMbid)) {
      artistaNombreAMbid.set(t.artistaMbid, undefined);
    }
  }
  const idsNuevos = [...artistaNombreAMbid.keys()];
  for (const [i, mbid] of idsNuevos.entries()) {
    const url = `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json&inc=genres`;
    let j;
    try {
      j = await pedir(url, contacto);
    } catch (e) {
      if (!(e instanceof ConsultaAgotada)) throw e;
      onProgreso?.(i + 1, idsNuevos.length);
      await esperar(ESPERA_MS);
      continue;
    }
    meta.artistas[mbid] = {
      nombre: j?.name ?? artistaNombreAMbid.get(mbid),
      generos: elegirGenerosRelevantes(j?.genres ?? []),
    };
    if ((i + 1) % 20 === 0 || i === idsNuevos.length - 1) guardar();
    onProgreso?.(i + 1, idsNuevos.length);
    await esperar(ESPERA_MS);
  }

  guardar();
  return { total: tanda.length, encontrados, sinResultado, saltados, artistasNuevos: idsNuevos.length };
}

/**
 * Vuelve a consultar el género de TODOS los artistas ya cacheados en
 * meta.artistas (no solo los nuevos), y reemplaza `generos` por la versión
 * filtrada (elegirGenerosRelevantes). Hace falta porque los géneros ya
 * guardados se persistieron ANTES de que existiera este filtro: no tienen
 * el conteo de votos guardado, así que no hay forma de filtrarlos sin
 * volver a pedírselos a la API.
 *
 * Mismo criterio que enriquecerMusicbrainz: sin `contacto`, y habiendo
 * artistas para procesar, no hace ninguna petición y devuelve
 * `{ omitido: true, motivo: 'falta_contacto' }`.
 *
 * Un artista cuya consulta agota los reintentos se salta (se queda con sus
 * géneros de antes, sin filtrar) y no corta el resto del lote — se
 * reintentará en la próxima corrida de esta función.
 */
export async function refiltrarGenerosArtistasExistentes(dataDir, { contacto, onProgreso } = {}) {
  const metaPath = join(dataDir, 'metadata-musicbrainz.json');
  const meta = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, 'utf8'))
    : { version: 1, tracks: {}, artistas: {} };
  const mbids = Object.keys(meta.artistas);
  if (mbids.length === 0) return { total: 0, procesados: 0, saltados: 0 };
  if (!contacto) return { omitido: true, motivo: 'falta_contacto' };

  function guardar() {
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  let procesados = 0;
  let saltados = 0;
  for (const [i, mbid] of mbids.entries()) {
    const url = `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json&inc=genres`;
    let j;
    try {
      j = await pedir(url, contacto);
    } catch (e) {
      if (!(e instanceof ConsultaAgotada)) throw e;
      saltados++;
      onProgreso?.(i + 1, mbids.length);
      await esperar(ESPERA_MS);
      continue;
    }
    meta.artistas[mbid] = {
      nombre: j?.name ?? meta.artistas[mbid]?.nombre,
      generos: elegirGenerosRelevantes(j?.genres ?? []),
    };
    procesados++;
    if ((i + 1) % 20 === 0 || i === mbids.length - 1) guardar();
    onProgreso?.(i + 1, mbids.length);
    await esperar(ESPERA_MS);
  }

  guardar();
  return { total: mbids.length, procesados, saltados };
}
