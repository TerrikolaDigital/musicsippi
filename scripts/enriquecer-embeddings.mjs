/**
 * Corre la clasificación semántica local (ver lib/clasificar-embeddings.mjs)
 * contra los tracks "sin-clasificar" y aplica directo a biblioteca.json lo
 * que superó el umbral de confianza del modelo. Sin archivo de revisión manual
 * — solo se aplica lo que el modelo categorizó con confianza alta.
 *
 * Embebe por TRACK (no por artista): el documento de cada track junta lo que
 * ya haya en caché de otras fuentes — géneros de MusicBrainz
 * (data/metadata-musicbrainz.json) y título+descripción de YouTube
 * (data/descripciones-youtube.json) — vía textoDeTrack(). No dispara ninguna
 * llamada de red nueva: si esos caches todavía no existen o el track no está
 * en ellos, simplemente se embebe con lo que haya (como mínimo, artista y
 * título). Los vectores quedan persistidos en data/vectores-indice.json +
 * data/vectores.bin (ver lib/indice-vectores.mjs) y solo se recalculan los
 * tracks cuyo texto cambió desde la corrida anterior.
 *
 * Se puede correr suelto para vaciar el backlog actual, pero el lugar donde
 * de verdad importa es adentro de importar.mjs (ver ahí) — así corre solo en
 * cada importación, para cualquier usuario de la app, sin que nadie tenga
 * que acordarse de ejecutar nada.
 *
 *   node scripts/enriquecer-embeddings.mjs
 *   node scripts/enriquecer-embeddings.mjs --informe   # no clasifica nada, solo el plan
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { ejesClasificables, embeberEjes, embeber, clasificarPorEmbeddings } from './lib/clasificar-embeddings.mjs';
import { asegurarVectores, vectorDe } from './lib/indice-vectores.mjs';
import { crearTextoDeVector } from './lib/generos-por-track.mjs';
import { cargarFuentes } from './lib/fuentes.mjs';

const { dataDir } = resolverRaizYDataDir(import.meta.url);
const bibliotecaPath = join(dataDir, 'biblioteca.json');

const soloInforme = process.argv.includes('--informe');

const biblioteca = JSON.parse(readFileSync(bibliotecaPath, 'utf8'));
const ejesData = JSON.parse(readFileSync(join(dataDir, 'ejes.json'), 'utf8'));
const ejesValidos = ejesClasificables(ejesData.ejes);

// Mismo texto de vector que la app (ver crearTextoDeVector); los caches solo se leen.
const textoDeTrackConExtras = crearTextoDeVector(dataDir, biblioteca.tracks, cargarFuentes(dataDir));

const sinClasificar = biblioteca.tracks.filter((t) => t.ejes.some((e) => e.ejeId === 'sin-clasificar'));

console.log(`\nSin clasificar : ${sinClasificar.length} tracks`);
console.log(`Ejes candidatos: ${ejesValidos.length}`);

if (soloInforme) {
  console.log('\n(--informe: no se corrió el modelo)');
  process.exit(0);
}

if (sinClasificar.length === 0) {
  console.log('\nNada para clasificar.');
  process.exit(0);
}

console.log('\nCargando modelo local (primera vez puede tardar por la descarga)…');
const indice = await asegurarVectores(dataDir, biblioteca.tracks, textoDeTrackConExtras, embeber);
const embEjes = await embeberEjes(ejesValidos);
console.log('Modelo listo. Clasificando…\n');

let aplicados = 0;
let sinMatch = 0;
let i = 0;

for (const track of sinClasificar) {
  i++;
  const vector = vectorDe(dataDir, track.id, indice);
  const resultado = vector ? clasificarPorEmbeddings(vector, embEjes) : null;
  if (!resultado) {
    sinMatch++;
  } else {
    track.ejes = track.ejes.filter((a) => a.ejeId !== 'sin-clasificar');
    track.ejes.push({ ejeId: resultado.ejeId, origen: 'auto', senal: 'ia-embeddings', score: resultado.confianza });
    aplicados++;
  }
  if (i % 40 === 0 || i === sinClasificar.length) console.log(`  ${i}/${sinClasificar.length}`);
}

if (aplicados > 0) {
  writeFileSync(bibliotecaPath, JSON.stringify(biblioteca, null, 2), 'utf8');
}

console.log('\n=== RESUMEN ===\n');
console.log(`Tracks sin match confiable    : ${sinMatch}`);
console.log(`Tracks aplicados a biblioteca : ${aplicados}`);
