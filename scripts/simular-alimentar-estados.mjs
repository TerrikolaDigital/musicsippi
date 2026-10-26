/**
 * SIMULACIÓN de «alimentar estados» (ver src/organizador/senales-estados.js). SOLO LEE `--data` y SOLO IMPRIME:
 * no escribe nada en esa carpeta (la base que usa es un almacén en memoria). Hace peticiones reales a Deezer
 * (bpm) y MusicBrainz (canción/álbum) solo para una MUESTRA y extrapola.
 *
 *   node scripts/simular-alimentar-estados.mjs --data "$APPDATA/Musicsippi/data" [--muestra 200] [--cache <archivo>]
 *
 * --vectores-todos: calcula en Node (modelo del PC) los vectores que falten de TODA la biblioteca, como haría el móvil;
 *          sin esta opción se usan solo los vectores que ya existen en --data. Los géneros del texto salen de MusicBrainz
 *          (artista) del PC: es una aproximación.
 * --cache: archivo JSON (fuera de --data) donde guardar/reutilizar lo consultado, para repetir la simulación
 *          sin volver a pedirlo todo. Sin esta opción no se escribe nada en ningún sitio.
 * Si los datos aún no están migrados a moods, se simula DESPUÉS de la migración (en memoria, nada se aplica).
 * Uso (escuchas desde los chips) no existe todavía en los datos: no cuenta en la simulación.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aplicarPlan, planificarMigracion } from '../src/organizador/migrar-moods.js';
import { crearAlmacenMemoria } from '../src/data/lib/almacen-memoria.js';
import { enriquecerMusicbrainzDetallePendientes, enriquecerRitmoPendientes } from '../src/organizador/enriquecer-movil.js';
import { alimentarEstadosPendientes } from '../src/organizador/alimentar-estados.js';
import { alimentarEstados, estadosPorEtiquetas, estadosAlimentables } from '../src/organizador/senales-estados.js';
import { coberturaDeMuestra, formatearCobertura, formatearEstados, muestrear } from './lib/simulacion-senales.mjs';

const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));
const args = process.argv.slice(2);
const valor = (nombre, porDefecto = null) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
if (!valor('--data')) {
  console.error('Falta --data <carpeta de datos>. Esta simulación no adivina la carpeta para no tocar nada por error.');
  process.exit(1);
}
const dataDir = resolve(valor('--data'));
const nMuestra = Number(valor('--muestra', 200));
const rutaCache = valor('--cache') ? resolve(valor('--cache')) : null;
if (rutaCache && rutaCache.startsWith(dataDir)) {
  console.error('--cache no puede estar dentro de --data (esa carpeta es de solo lectura).');
  process.exit(1);
}

// --- Datos ----------------------------------------------------------------------------------------
const rutaMb = join(dataDir, 'metadata-musicbrainz.json');
const biblioteca = leer(join(dataDir, 'biblioteca.json'));
let ejesData = leer(join(dataDir, 'ejes.json'));
const mbPC = existsSync(rutaMb) ? leer(rutaMb) : null;
let tracks = biblioteca.tracks;
const migrado = ejesData.ejes.some((e) => e.familia === 'estado');
if (!migrado) {
  const plan = planificarMigracion({ tracks, ejes: ejesData.ejes, musicbrainz: mbPC });
  ({ ejesData, tracks } = aplicarPlan(ejesData, tracks, plan));
}

// Vectores del PC (vectores-indice.json + vectores.bin): los mismos que tendría el móvil tras organizar.
const vectores = [];
const rutaIndice = join(dataDir, 'vectores-indice.json');
const rutaBin = join(dataDir, 'vectores.bin');
if (existsSync(rutaIndice) && existsSync(rutaBin)) {
  const indice = leer(rutaIndice);
  const bin = readFileSync(rutaBin);
  const todo = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  for (const [trackId, { offset }] of Object.entries(indice.tracks)) vectores.push({ trackId, vector: todo.slice(offset * indice.dims, (offset + 1) * indice.dims) });
}

if (args.includes('--vectores-todos')) {
  const { embeber } = await import('./lib/clasificar-embeddings.mjs');
  const { textoDeTrack } = await import('./lib/clasificar-embeddings-puro.mjs');
  const { hashTexto } = await import('../src/organizador/vectores.js');
  const tengo = new Set(vectores.map((v) => v.trackId));
  const generosDe = (t) => mbPC?.artistas?.[mbPC?.tracks?.[t.id]?.artistaMbid]?.generos ?? [];
  let hechos = 0;
  void hashTexto;
  for (const t of tracks) {
    if (tengo.has(t.id)) continue;
    vectores.push({ trackId: t.id, vector: await embeber(textoDeTrack(t, { generos: generosDe(t) })) });
    if (++hechos % 500 === 0) console.error(`  vectores: ${hechos}`);
  }
  console.error(`Vectores calculados en Node: ${hechos}`);
}

// --- Muestra y consultas reales -----------------------------------------------------------------
const muestra = muestrear(tracks, nMuestra);
const idsMuestra = new Set(muestra.map((t) => t.id));
const cache = rutaCache && existsSync(rutaCache) ? leer(rutaCache) : { metas: [], generos: [], rgMB: {} };

const metasIniciales = [...cache.metas];
const generosIniciales = [...cache.generos];
const idsEnCache = new Set(cache.generos.map((g) => g.trackId));
// Lo que el PC ya sabe de MusicBrainz ahorra la búsqueda de la grabación (mismo dato que tendría el móvil si lo recibiera).
for (const t of muestra) {
  const m = mbPC?.tracks?.[t.id];
  if (m?.mbid && !idsEnCache.has(t.id)) generosIniciales.push({ trackId: t.id, recordingMbid: m.mbid });
  if (m?.album) metasIniciales.push({ trackId: t.id, album: m.album });
}
const almacen = crearAlmacenMemoria({
  biblioteca: muestra,
  metadataLocal: dedupe(metasIniciales),
  generos: dedupe(generosIniciales),
});
if (Object.keys(cache.rgMB).length) await almacen.guardarValorConfig('releaseGroupsMB', cache.rgMB);

function dedupe(registros) {
  const porId = new Map();
  for (const r of registros) porId.set(r.trackId, { ...porId.get(r.trackId), ...r });
  return [...porId.values()];
}

const http = {
  async get(url, { headers = {} } = {}) {
    const r = await fetch(url, { headers });
    return { status: r.status, texto: await r.text(), url };
  },
};
const progreso = (nombre) => {
  let ultimo = 0;
  return (hechas, total) => {
    if (hechas - ultimo >= 20 || hechas === total) {
      ultimo = hechas;
      console.error(`  ${nombre}: ${hechas}/${total}`);
    }
  };
};

console.error(`Datos: ${dataDir} · ${tracks.length} canciones${migrado ? '' : ' (simulando tras la migración a moods)'} · muestra ${muestra.length}`);
const t0 = Date.now();
const [ritmo, mb] = await Promise.all([
  enriquecerRitmoPendientes({ almacen, http, max: muestra.length, onProgreso: progreso('Deezer bpm') }),
  enriquecerMusicbrainzDetallePendientes({ almacen, http, max: muestra.length, onProgreso: progreso('MusicBrainz') }),
]);
console.error(`Consultas hechas en ${Math.round((Date.now() - t0) / 1000)} s · Deezer ${JSON.stringify(ritmo)} · MusicBrainz ${JSON.stringify(mb)}`);

const metasM = new Map((await almacen.obtenerTodos('metadataLocal')).map((m) => [m.trackId, m]));
const registrosM = new Map((await almacen.obtenerTodos('generos')).map((r) => [r.trackId, r]));
if (rutaCache) {
  writeFileSync(rutaCache, JSON.stringify({ metas: [...metasM.values()], generos: [...registrosM.values()], rgMB: await almacen.obtenerValorConfig('releaseGroupsMB', {}) }));
}

// --- Cobertura ---------------------------------------------------------------------------------
const conGeneroArtista = new Set();
for (const t of muestra) {
  const m = mbPC?.tracks?.[t.id];
  if (m?.artistaMbid && mbPC.artistas?.[m.artistaMbid]?.generos?.length) conGeneroArtista.add(t.id);
}
const cobertura = coberturaDeMuestra({ muestra, metas: metasM, registros: registrosM, conGeneroArtista, estadosPorEtiquetas });

// --- Alimentar estados: biblioteca entera, con lo consultado solo en la muestra ----------------
const simulacion = crearAlmacenMemoria({
  biblioteca: tracks,
  ejes: ejesData.ejes,
  metadataLocal: [...metasM.values()],
  generos: [...registrosM.values()],
  vectores,
});
const r = await alimentarEstadosPendientes({ almacen: simulacion });
// Sin red: solo género + parecido (+ uso, que aún no existe), sobre la biblioteca ENTERA y sin extrapolar.
const sinRed = alimentarEstados({ tracks, ejes: ejesData.ejes, vectores });
const enMuestra = (await simulacion.obtenerTodos('biblioteca'));
const candidatas = tracks.filter((t) => (t.ejes ?? []).some((x) => x.ejeId !== 'sin-clasificar' && x.ejeId !== 'favoritos')).length;
const candidatasMuestra = muestra.filter((t) => (t.ejes ?? []).some((x) => x.ejeId !== 'sin-clasificar' && x.ejeId !== 'favoritos')).length;
const factor = candidatasMuestra ? candidatas / candidatasMuestra : 0;
void enMuestra;
void idsMuestra;

console.log(`Datos: ${dataDir}`);
console.log('Modo: SIMULACIÓN (no se escribe nada en --data)');
console.log('');
for (const l of formatearCobertura(cobertura)) console.log(l);
console.log('');
console.log(`Vectores del PC disponibles: ${vectores.length} de ${tracks.length} canciones (señal «parecido»).`);
console.log('Estados que se rellenan solos:', estadosAlimentables(ejesData.ejes).map((e) => e.nombre).join(', ') || '(ninguno)');
console.log('');
for (const l of formatearEstados({ porEstado: r.porEstado, factor, totalCandidatas: candidatas, muestra: candidatasMuestra, base: sinRed.porEstado })) console.log(l);
console.log('');
const combos = (porEstado) => Object.entries(porEstado).map(([, e]) => `  ${e.nombre.padEnd(14)} ${Object.entries(e.porCombinacion).map(([c, k]) => `${c}: ${k}`).join(' · ') || '—'}`);
console.log('COMBINACIONES de señales con las que entran (muestra con red):');
for (const l of combos(r.porEstado)) console.log(l);
console.log('');
console.log(`SIN consultar nada (solo género + parecido), biblioteca entera: ${sinRed.propuestas.length} pertenencias`);
for (const l of combos(sinRed.porEstado)) console.log(l);
console.log('');
console.log(`Total: ${r.agregadas} pertenencias con lo consultado (de ellas ${sinRed.propuestas.length} no necesitan red) → ≈ ${Math.round(sinRed.propuestas.length + (r.agregadas - sinRed.propuestas.length) * factor)} en toda la biblioteca al terminar de consultar bpm y etiquetas.`);
console.log('Nota: bpm y etiquetas solo existen en la muestra (la extrapolación asume la misma cobertura); género + parecido sí cubren toda la biblioteca.');
