/**
 * Importador de bibliotecas -> biblioteca.json
 *
 * Pipeline completo (orden real de este archivo, de arriba a abajo):
 *   1. Parseo de las 3 fuentes (Spotify/Amazon/YouTube) + clasificacion por
 *      anclas (clasificar(), sobre ejes.json) inline por cada linea.
 *   2. Fusion de duplicados cruzados entre fuentes (fusionarDuplicadosCruzados).
 *   3. Propagacion de sugerencias unanimes por artista (propagarSugerenciasUnanimes).
 *   4. Resolucion contra YouTube, pasada barata/sin cuota (resolverPendientes,
 *      Tarea 6) — solo sobre lo que no esta en cache-youtube.json.
 *   5. Enriquecimiento por descripcion de YouTube, pasada ampliada (Tarea 7)
 *      SOLO sobre el residuo real: tracks sin evidencia de genero ni de
 *      MusicBrainz ni de la pasada barata de arriba.
 *   6. Clasificacion semantica local por embeddings, por track (Tarea 4).
 *   7. Medicion de residuo para deteccion incremental (Tarea 18): deja
 *      aviso-modos-nuevos.json si sobra suficiente musica sin modo.
 *   8. Poda de ejes/listas que quedaron sin ningun track.
 *
 * MusicBrainz (album/anio/generos de artista) NO corre dentro de este
 * pipeline: vive en scripts/enriquecer-musicbrainz.mjs, un script standalone
 * que hay que correr a mano aparte (rate limit de 1 req/s de la propia API,
 * ~50 min para la biblioteca completa — no tiene sentido bloquear cada
 * importacion con eso). Su salida, data/metadata-musicbrainz.json, es leida
 * por los pasos 5 y 6 de arriba SI YA EXISTE (existsSync + fallback vacio):
 * si todavia no se corrio, esos pasos simplemente tienen menos evidencia
 * disponible, nunca fallan por su ausencia.
 *
 * Los ejes se leen de data/ejes.json en tiempo de ejecucion; este script no
 * conoce ningun eje por nombre. Agregar o quitar un eje NO requiere tocar codigo.
 *
 * Reimportar recalcula las asignaciones `auto` desde cero, pero preserva las
 * `manual` de la biblioteca anterior (contrato en docs/modelo-datos.md, 2.3).
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { idTrack } from './lib/id-track.mjs';
import {
  normalizar,
  limpiarTitulo,
  clasificar,
  propagarSugerenciasUnanimes,
  podarEjesVacios,
} from './lib/clasificar.mjs';
import { fusionarDuplicadosCruzados } from './lib/fusionar-duplicados.mjs';
import { resolverPendientes } from './lib/resolver-innertube.mjs';
import { enriquecerPorDescripcionYoutube } from './lib/enriquecer-descripcion-youtube.mjs';
import { ejesClasificables, embeberEjes, embeber, clasificarPorEmbeddings } from './lib/clasificar-embeddings.mjs';
import { asegurarVectores, vectorDe } from './lib/indice-vectores.mjs';
import { calcularMasaMinima } from './lib/descubrir-modos.mjs';
import { cargarFuentes } from './lib/fuentes.mjs';
import { crearTextoDeVector } from './lib/generos-por-track.mjs';
import { construirContratos, verificarContrato } from './lib/contratos-externos.mjs';

const sinResolver = process.argv.includes('--sin-resolver');

const { dataDir } = resolverRaizYDataDir(import.meta.url);

const FUENTES = [
  { id: 'spotify', archivo: 'My Spotify Library.txt' },
  { id: 'amazon', archivo: 'My Amazon Music Library.txt' },
  { id: 'youtube', archivo: 'My YouTube Library.txt' },
];

/** Separa "Artista - Titulo". YouTube usa " · " para colaboraciones. */
function parsearLinea(linea, fuente) {
  const texto = linea.trim();
  if (!texto) return null;

  // YouTube: entradas sin separador son suscripciones a canales, no tracks.
  const tieneSeparador = texto.includes(' - ');
  if (!tieneSeparador) {
    return { tipo: 'canal', nombre: texto, fuente };
  }

  const [artistaRaw, tituloRaw] = texto.split(/ - (.+)/s);
  const artista = artistaRaw.trim();
  const titulo = (tituloRaw ?? '').trim();

  // Spotify exporta episodios de podcast con el artista literal "null".
  if (artista === 'null') {
    return { tipo: 'podcast', nombre: titulo, fuente };
  }
  if (!titulo) return null;

  return { tipo: 'track', artista, titulo, fuente };
}

/**
 * Lee de la biblioteca anterior las asignaciones con origen "manual".
 *
 * La clave es `track.id` (sha1 de artista+titulo normalizados), que es estable entre
 * corridas: mientras la linea siga en algun export, el track vuelve a caer en el mismo id
 * y recupera su asignacion. Devuelve Map<trackId, asignaciones[]>.
 *
 * Descarta las que apuntan a un eje que ya no existe en ejes.json: si el eje se elimino
 * de verdad, sus asignaciones se van con el (modelo-datos 3) y el track vuelve a la
 * bandeja de sin-clasificar en vez de quedar colgado de un eje fantasma. Un eje
 * desactivado (`activo: false`) sigue existiendo, asi que esas si se conservan.
 */
function leerAsignacionesManuales(path, ejesExistentes) {
  if (!existsSync(path)) return { manuales: new Map(), ejesHuerfanos: [] };

  let previa;
  try {
    previa = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    // Sobrescribir a ciegas destruiria trabajo manual que no se puede recuperar de
    // ninguna otra fuente. Es mejor abortar y que el usuario decida.
    throw new Error(
      `data/biblioteca.json existe pero no se puede parsear: ${e.message}\n` +
        'Puede contener asignaciones manuales que esta corrida borraria. ' +
        'Revisalo o movelo a un costado antes de reimportar.'
    );
  }

  const manuales = new Map();
  const ejesHuerfanos = new Set();

  for (const track of previa.tracks ?? []) {
    const propias = [];
    for (const a of track.ejes ?? []) {
      if (a.origen !== 'manual') continue;
      if (!ejesExistentes.has(a.ejeId)) {
        ejesHuerfanos.add(a.ejeId);
        continue;
      }
      propias.push(a);
    }
    if (propias.length > 0) manuales.set(track.id, propias);
  }

  return { manuales, ejesHuerfanos: [...ejesHuerfanos] };
}

/**
 * Combina las asignaciones auto recien calculadas con las manuales preservadas.
 *
 * La manual manda: si el mismo eje llega por las dos vias se queda la manual (conserva
 * su senal y score de usuario), y sin-clasificar se descarta porque el track ya tiene
 * dueno elegido a mano. Es el mismo criterio que aplica POST /api/asignar al guardar.
 */
function combinar(auto, manuales) {
  if (manuales.length === 0) return auto;

  const yaAsignados = new Set(manuales.map((a) => a.ejeId));
  const autoUtiles = auto.filter(
    (a) => a.ejeId !== 'sin-clasificar' && !yaAsignados.has(a.ejeId)
  );
  return [...autoUtiles, ...manuales];
}

// fusionarDuplicadosCruzados y sus helpers viven en
// scripts/lib/fusionar-duplicados.mjs (extraídos de acá para que el import
// hecho desde la app también los use, ver aplicarFilasTuneMyMusic).

// ---- Pipeline ----

const { ejes } = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8'));

const bibliotecaPath = join(dataDir, 'biblioteca.json');
const { manuales, ejesHuerfanos } = leerAsignacionesManuales(
  bibliotecaPath,
  new Set(ejes.map((e) => e.id))
);
const manualesAplicadas = new Set();

const tracks = new Map();
const canales = [];
const podcasts = [];
const stats = {};

for (const fuente of FUENTES) {
  const lineas = readFileSync(join(dataDir, fuente.archivo), 'utf8').split(/\r?\n/);
  const s = { lineas: 0, tracks: 0, canales: 0, podcasts: 0, duplicados: 0 };

  for (const linea of lineas) {
    if (!linea.trim()) continue;
    s.lineas++;

    const item = parsearLinea(linea, fuente.id);
    if (!item) continue;

    if (item.tipo === 'canal') {
      canales.push(item);
      s.canales++;
      continue;
    }
    if (item.tipo === 'podcast') {
      podcasts.push(item);
      s.podcasts++;
      continue;
    }

    const titulo = limpiarTitulo(item.titulo);
    const id = idTrack(item.artista, titulo);

    const existente = tracks.get(id);
    if (existente) {
      // Mismo track en otra fuente (o duplicado dentro del mismo archivo).
      if (!existente.fuentes.includes(fuente.id)) existente.fuentes.push(fuente.id);
      s.duplicados++;
      continue;
    }

    const manualesDelTrack = manuales.get(id) ?? [];
    if (manualesDelTrack.length > 0) manualesAplicadas.add(id);

    tracks.set(id, {
      id,
      artista: item.artista,
      titulo,
      fuentes: [fuente.id],
      // Consulta para el motor de reproduccion; YouTube es la fuente primaria.
      youtubeQuery: `${item.artista} ${titulo}`,
      youtubeVideoId: null,
      ejes: combinar(clasificar({ artista: item.artista, titulo }, ejes), manualesDelTrack),
    });
    s.tracks++;
  }

  stats[fuente.id] = s;
}

const cacheYoutubePath = join(dataDir, 'cache-youtube.json');
const cacheYoutube = existsSync(cacheYoutubePath)
  ? JSON.parse(readFileSync(cacheYoutubePath, 'utf8'))
  : {};
const idsFusionados = fusionarDuplicadosCruzados(tracks, cacheYoutube);

// Segunda pasada automática: un track sin-clasificar cuyo artista tiene TODAS
// sus demás apariciones en un único modo se asigna ahí también, sin esperar
// un clic — el usuario final de la app no va a correr nada a mano, así que
// lo que se pueda inferir sin ambigüedad tiene que resolverse solo acá.
const tracksArray = [...tracks.values()];
const propagadas = propagarSugerenciasUnanimes(tracksArray, ejes);

const biblioteca = {
  version: 1,
  generado: new Date().toISOString(),
  totalTracks: tracks.size,
  tracks: tracksArray,
};

writeFileSync(bibliotecaPath, JSON.stringify(biblioteca, null, 2), 'utf8');
writeFileSync(
  join(dataDir, 'descartados.json'),
  JSON.stringify({ canales, podcasts }, null, 2),
  'utf8'
);

// ---- Reporte ----

console.log('\n=== IMPORTACION ===\n');
for (const [id, s] of Object.entries(stats)) {
  console.log(
    `${id.padEnd(8)} ${String(s.lineas).padStart(5)} lineas -> ` +
      `${String(s.tracks).padStart(4)} tracks nuevos, ` +
      `${s.duplicados} dup, ${s.canales} canales, ${s.podcasts} podcasts`
  );
}
console.log(`\nTotal tracks unicos: ${tracks.size}`);

if (idsFusionados.size > 0) {
  console.log('\n=== DUPLICADOS FUSIONADOS ===\n');
  console.log(
    `${idsFusionados.size} entradas fusionadas por ser el mismo tema acreditado ` +
      `distinto entre fuentes (mismo titulo/artista base, credito de colaboracion ` +
      `formateado distinto) — ver fusionarDuplicadosCruzados().`
  );
}

if (propagadas > 0) {
  console.log('\n=== SUGERENCIAS DE ARTISTA APLICADAS SOLAS ===\n');
  console.log(
    `${propagadas} tracks salieron de sin-clasificar porque su artista tiene ` +
      `TODAS sus demas apariciones en un unico modo — ver propagarSugerenciasUnanimes().`
  );
}

// Las manuales son el trabajo mas caro de la biblioteca: si se pierde alguna, hay que verlo.
if (manuales.size > 0 || ejesHuerfanos.length > 0) {
  const preservadas = [...manualesAplicadas].reduce(
    (n, id) => n + manuales.get(id).length,
    0
  );
  console.log('\n=== ASIGNACIONES MANUALES ===\n');
  console.log(`Preservadas: ${preservadas} en ${manualesAplicadas.size} tracks`);

  // Un id "perdido" que en realidad se fusiono a otro no es una perdida real:
  // su asignacion manual sigue viva, colgada del id ganador (fusionarDuplicadosCruzados
  // le da preferencia a origen:'manual' al unir ejes). Sin este chequeo, cada
  // reimportacion reportaria una perdida falsa por cada duplicado fusionado.
  const perdidas = [...manuales.keys()].filter(
    (id) => !manualesAplicadas.has(id) && !idsFusionados.has(id)
  );
  if (perdidas.length > 0) {
    console.log(
      `Descartadas: ${perdidas.length} tracks que ya no aparecen en ningun export ` +
        `(${perdidas.slice(0, 5).join(', ')}${perdidas.length > 5 ? ', ...' : ''})`
    );
  }
  if (ejesHuerfanos.length > 0) {
    console.log(`Descartadas por eje inexistente: ${ejesHuerfanos.join(', ')}`);
  }
}

const porEje = new Map();
for (const t of tracks.values()) {
  for (const a of t.ejes) porEje.set(a.ejeId, (porEje.get(a.ejeId) ?? 0) + 1);
}

console.log('\n=== DISTRIBUCION POR EJE ===\n');
for (const eje of ejes) {
  const n = porEje.get(eje.id) ?? 0;
  if (n === 0) continue;
  const pct = ((100 * n) / tracks.size).toFixed(1);
  const marca = eje.tipo === 'funcional' ? 'F' : eje.tipo === 'sistema' ? '!' : ' ';
  console.log(`${marca} ${eje.nombre.padEnd(42)} ${String(n).padStart(4)}  ${pct.padStart(5)}%`);
}
console.log('\n(F = modo funcional, ! = requiere revision manual)');

// ---- Resolución contra YouTube (InnerTube, sin cuota) ----
//
// Antes esto quedaba en manos del usuario ("corré npm run resolver después"):
// un paso manual que se olvida. Ahora el propio import lo dispara solo al
// final — es la misma resolverPendientes() que usa resolver-youtube.mjs, así
// que el comportamiento (incremental, resumible, sin cachear "sin resultado")
// es idéntico. `--sin-resolver` lo saltea si alguna vez hace falta correr
// solo la importación (por ejemplo, para revisar la clasificación antes de
// gastar tiempo resolviendo).
//
// fuentesActuales se carga acá (antes de todo el bloque) porque la
// verificación de contrato de YouTube (más abajo, antes de la pasada de
// descripciones) la necesita, y la detección incremental del final del
// archivo también — una sola carga para las dos, en vez de leer
// fuentes.json dos veces en la misma corrida.
const fuentesActuales = cargarFuentes(dataDir);
if (!sinResolver) {
  const cachePath = join(dataDir, 'cache-youtube.json');
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const pendientesYt = biblioteca.tracks.filter((t) => !Object.hasOwn(cache, t.id));

  if (pendientesYt.length === 0) {
    console.log('\n=== RESOLUCIÓN YOUTUBE ===\n\nNada pendiente — ya está todo resuelto.');
  } else {
    console.log(`\n=== RESOLUCIÓN YOUTUBE ===\n\nResolviendo ${pendientesYt.length} tracks nuevos contra YouTube…`);

    // Mismo patrón de relectura-antes-de-escribir que resolver-youtube.mjs:
    // el servidor de dev puede estar resolviendo tracks en paralelo mientras
    // esto corre, y no hay que pisarle el trabajo.
    function guardarCacheYt() {
      const actual = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
      Object.assign(actual, cache);
      writeFileSync(cachePath, JSON.stringify(actual, null, 2), 'utf8');
    }
    process.on('SIGINT', () => {
      console.log('\n\nInterrumpido — guardando lo resuelto hasta acá…');
      guardarCacheYt();
      process.exit(0);
    });

    const { encontrados, sinResultado, errores } = await resolverPendientes(pendientesYt, cache, {
      onProgreso(i, total) {
        if (i % 20 === 0 || i === total) {
          console.log(`  ${i}/${total}`);
          guardarCacheYt();
        }
      },
    });
    guardarCacheYt();

    console.log(
      `\nEncontrados: ${encontrados} | sin resultado: ${sinResultado} (se reintentan solos la próxima vez) | errores: ${errores}`
    );
  }

  // ---- Clasificación por descripción de YouTube (tercera pasada) ----
  //
  // Corre DESPUÉS de resolver arriba porque necesita el videoId ya
  // cacheado — antes no hay nada que consultar. Bajo el mismo `if
  // (!sinResolver)`: si se pidió saltear YouTube, tampoco hay nada nuevo
  // resuelto para esta pasada.
  const cachePath2 = join(dataDir, 'cache-youtube.json');
  const cacheFinal = existsSync(cachePath2) ? JSON.parse(readFileSync(cachePath2, 'utf8')) : {};
  // mbMetaParaDescripcion/resolucionYoutube: mismos archivos que lee la
  // clasificación semántica más abajo (metadata-musicbrainz.json,
  // resolucion-youtube.json de la pasada barata) — se leen acá también para
  // que el filtro de candidatos de la pasada CARA (getInfo, ~350ms c/u) se
  // reduzca al residuo real: tracks sin ninguna evidencia de género todavía,
  // ni de MusicBrainz ni de la búsqueda barata de YouTube.
  const mbMetaParaDescripcion = existsSync(join(dataDir, 'metadata-musicbrainz.json'))
    ? JSON.parse(readFileSync(join(dataDir, 'metadata-musicbrainz.json'), 'utf8'))
    : { tracks: {}, artistas: {} };
  const resolucionYoutubePath = join(dataDir, 'resolucion-youtube.json');
  const resolucionYoutube = existsSync(resolucionYoutubePath)
    ? JSON.parse(readFileSync(resolucionYoutubePath, 'utf8'))
    : {};
  // Verificación de contrato (Tarea 21) — antes de disparar la pasada CARA de
  // getInfo (~350ms por track, cientos de tracks), una sola consulta de
  // prueba fija y conocida (dQw4w9WgXcQ, la misma que usa `npm run
  // diagnostico`) contra youtube-getinfo. El catch por-track de
  // enriquecerPorDescripcionYoutube (lib/enriquecer-descripcion-youtube.mjs)
  // es correcto para que un video puntual no disponible no rompa nada — pero
  // por sí solo no distingue eso de un cambio de forma en la respuesta de
  // YouTube (p. ej. basic_info.channel.name movido de lugar), que degradaría
  // TODA la pasada en silencio, track por track, sin que nadie se entere.
  // Si el contrato está roto, se avisa fuerte acá y se saltea la pasada
  // completa para esta corrida (no per-track: no tiene sentido gastar tiempo
  // reintentando cientos de veces un contrato que ya sabemos que falló).
  let saltarDescripcionYoutube = false;
  if (fuentesActuales) {
    try {
      const contratoGetInfo = construirContratos(fuentesActuales).find((c) => c.fuente === 'youtube-getinfo');
      const resultadoContrato = await verificarContrato(contratoGetInfo);
      if (!resultadoContrato.ok) {
        console.log(
          `\n⚠️  === CONTRATO YOUTUBE ROTO (getInfo) ===\n\n` +
            `La consulta de prueba contra YouTube no devolvió los campos esperados` +
            `${resultadoContrato.error ? ` (${resultadoContrato.error})` : ` — faltan: ${resultadoContrato.camposFaltantes.join(', ')}`}.\n` +
            `Se saltea la clasificación por descripción de YouTube en esta corrida — probablemente YouTube cambió de forma.\n` +
            `Correr "npm run diagnostico" para más detalle.\n`
        );
        saltarDescripcionYoutube = true;
      }
    } catch (e) {
      // Defensivo: un problema en la propia verificación (p. ej. fuentes.json
      // con una forma inesperada para youtube.getInfo) no debe tirar abajo
      // toda la importación — se avisa y se sigue como si no se hubiese
      // podido verificar.
      console.log(`\n⚠️  No se pudo verificar el contrato de YouTube antes de enriquecer (${e.message}) — se continúa igual.`);
    }
  }

  let aplicadasPorDescripcion = 0;
  let consultados = 0;
  if (!saltarDescripcionYoutube) {
    ({ aplicados: aplicadasPorDescripcion, consultados } = await enriquecerPorDescripcionYoutube(
      biblioteca.tracks,
      cacheFinal,
      join(dataDir, 'descripciones-youtube.json'),
      {
        mbTracks: mbMetaParaDescripcion.tracks ?? {},
        mbArtistas: mbMetaParaDescripcion.artistas ?? {},
        resolucionYoutube,
        onProgreso(i, total) {
          if (i % 30 === 0 || i === total) console.log(`  descripciones ${i}/${total}`);
        },
      }
    ));
  }
  if (consultados > 0) {
    console.log(`\n=== CLASIFICACIÓN POR DESCRIPCIÓN DE YOUTUBE ===\n`);
    console.log(`Descripciones nuevas consultadas: ${consultados}`);
    console.log(`Tracks clasificados: ${aplicadasPorDescripcion}`);
  }
  if (aplicadasPorDescripcion > 0) {
    writeFileSync(bibliotecaPath, JSON.stringify(biblioteca, null, 2), 'utf8');
  }
}

// ---- Clasificación semántica local (embeddings, sin API/costo) ----
//
// No depende de YouTube ni de ninguna clave — corre siempre, incluso con
// --sin-resolver. Mismo criterio de automatización que propagarSugerenciasUnanimes
// más arriba: el usuario final no va a correr nada a mano, así que lo que el
// modelo pueda inferir con confianza real se aplica solo. Embebe por TRACK,
// no por artista: textoDeTrack() arma el documento de cada track con lo que
// ya haya en caché de otras fuentes — géneros de MusicBrainz
// (metadata-musicbrainz.json) y título+descripción de YouTube
// (descripciones-youtube.json) — sin disparar ninguna llamada de red nueva
// desde acá. Los vectores quedan persistidos (ver lib/indice-vectores.mjs) y
// solo se recalculan los tracks cuyo texto cambió desde la corrida anterior.
// Ver lib/clasificar-embeddings.mjs sobre por qué el umbral es conservador.
{
  const sinClasificarEmb = biblioteca.tracks.filter((t) => t.ejes.some((e) => e.ejeId === 'sin-clasificar'));
  if (sinClasificarEmb.length > 0) {
    console.log(`\n=== CLASIFICACIÓN SEMÁNTICA LOCAL (${sinClasificarEmb.length} tracks) ===\n`);

    const textoDeTrackConExtras = crearTextoDeVector(dataDir, biblioteca.tracks, cargarFuentes(dataDir));

    const indiceVec = await asegurarVectores(dataDir, biblioteca.tracks, textoDeTrackConExtras, embeber);
    const embEjes = await embeberEjes(ejesClasificables(ejes));

    let aplicadosEmb = 0;
    let iEmb = 0;
    for (const t of sinClasificarEmb) {
      iEmb++;
      const vector = vectorDe(dataDir, t.id, indiceVec);
      const resultado = vector ? clasificarPorEmbeddings(vector, embEjes) : null;
      if (iEmb % 40 === 0 || iEmb === sinClasificarEmb.length) console.log(`  ${iEmb}/${sinClasificarEmb.length}`);
      if (!resultado) continue;
      t.ejes = t.ejes.filter((a) => a.ejeId !== 'sin-clasificar');
      t.ejes.push({ ejeId: resultado.ejeId, origen: 'auto', senal: 'ia-embeddings', score: resultado.confianza });
      aplicadosEmb++;
    }
    console.log(`Tracks clasificados: ${aplicadosEmb}`);
    if (aplicadosEmb > 0) {
      writeFileSync(bibliotecaPath, JSON.stringify(biblioteca, null, 2), 'utf8');
    }
  }
}

// ---- Detección incremental (Tarea 18) ----
//
// Este pipeline (npm run importar, contra data/*.txt) corre fuera del
// navegador: a diferencia de importar-tunemymusic.mjs (Tarea 16, que sí tiene
// una pantalla abierta para proponer modos en el momento), acá no hay nadie
// mirando. Si después de la clasificación por embeddings de más arriba quedó
// mucha música sin ningún modo real, se deja un aviso en disco — la próxima
// vez que se abra la app, un banner lo recoge y ofrece revisar solo eso
// nuevo (ver /api/aviso-modos-nuevos en vite.config.js y el banner en
// src/App.jsx). Mismo filtro que `pendientesDeClasificar`/`tracksPendientes`
// en src/App.jsx (con el `!t.generoSimple` incluido) para que el número que
// ve la persona acá coincida con el que ve en Configuración → Administrar.
{
  if (fuentesActuales) {
    const sinModo = biblioteca.tracks.filter(
      (t) => t.ejes.some((a) => a.ejeId === 'sin-clasificar') && !t.generoSimple
    );
    const masaMinima = calcularMasaMinima(biblioteca.tracks.length, fuentesActuales.umbrales);
    const avisoPath = join(dataDir, 'aviso-modos-nuevos.json');
    if (sinModo.length >= masaMinima) {
      writeFileSync(
        avisoPath,
        JSON.stringify({ cantidad: sinModo.length, trackIds: sinModo.map((t) => t.id) }, null, 2),
        'utf8'
      );
      console.log(
        `\n=== MODOS NUEVOS ===\n\n${sinModo.length} tracks no entran en ningún modo — se dejó aviso en ` +
          'data/aviso-modos-nuevos.json para que la app lo ofrezca revisar.'
      );
    } else if (existsSync(avisoPath)) {
      // Ya no hay suficiente residuo (se clasificó a mano, o el eje se creó
      // desde otro lado) — no dejar un aviso viejo colgado ofreciendo revisar
      // tracks que ya no son un residuo real.
      rmSync(avisoPath);
    }
  }
}

// Listas/modos que quedaron sin ningún track (p. ej. un eje cuyas anclas ya
// no matchean nada tras editar ejes.json a mano) se borran solos.
const podado = podarEjesVacios(ejes, biblioteca.tracks);
if (podado.podados.length > 0) {
  console.log(`\n=== LISTAS/MODOS VACÍOS ELIMINADOS ===\n\n${podado.podados.join(', ')}`);
  writeFileSync(join(dataDir, 'ejes.json'), JSON.stringify({ ejes: podado.ejes }, null, 2), 'utf8');
}
