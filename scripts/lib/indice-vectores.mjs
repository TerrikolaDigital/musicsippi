import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { similitudCoseno } from './similitud.mjs';

export { similitudCoseno };

export const MODELO_EMBEDDING = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const DIMS = 384;

function hashTexto(texto) {
  return createHash('sha1').update(texto).digest('hex');
}

function rutaIndice(dataDir) { return join(dataDir, 'vectores-indice.json'); }
function rutaBin(dataDir) { return join(dataDir, 'vectores.bin'); }

export function cargarIndice(dataDir) {
  const ruta = rutaIndice(dataDir);
  if (!existsSync(ruta)) {
    return { version: 1, modelo: MODELO_EMBEDDING, dims: DIMS, tracks: {} };
  }
  const indice = JSON.parse(readFileSync(ruta, 'utf8'));
  if (indice.modelo !== MODELO_EMBEDDING) {
    return { version: 1, modelo: MODELO_EMBEDDING, dims: DIMS, tracks: {} };
  }
  return indice;
}

function leerBin(dataDir) {
  const ruta = rutaBin(dataDir);
  return existsSync(ruta) ? readFileSync(ruta) : Buffer.alloc(0);
}

export async function asegurarVectores(dataDir, tracks, textoDeTrack, embeber) {
  const indiceViejo = cargarIndice(dataDir);
  const binViejo = leerBin(dataDir);
  const porTrackId = new Map();

  for (const track of tracks) {
    const entrada = indiceViejo.tracks[track.id];
    if (!entrada) continue;
    const texto = textoDeTrack(track);
    if (hashTexto(texto) !== entrada.hash) continue;
    const byteOffset = entrada.offset * indiceViejo.dims * 4;
    const vista = new Float32Array(binViejo.buffer, binViejo.byteOffset + byteOffset, indiceViejo.dims);
    porTrackId.set(track.id, { hash: entrada.hash, vector: Float32Array.from(vista) });
  }

  for (const track of tracks) {
    if (porTrackId.has(track.id)) continue;
    const texto = textoDeTrack(track);
    const hash = hashTexto(texto);
    const vector = await embeber(texto);
    porTrackId.set(track.id, { hash, vector });
  }

  // Las canciones que no se pasaron conservan su vector: hay llamadores que solo
  // pasan una parte (p. ej. las «sin clasificar» del enriquecimiento automático)
  // y antes el índice se reescribía solo con ellas.
  if (binViejo.length > 0) {
    for (const [trackId, entrada] of Object.entries(indiceViejo.tracks)) {
      if (porTrackId.has(trackId)) continue;
      const byteOffset = entrada.offset * indiceViejo.dims * 4;
      if (byteOffset + indiceViejo.dims * 4 > binViejo.length) continue;
      const vista = new Float32Array(binViejo.buffer, binViejo.byteOffset + byteOffset, indiceViejo.dims);
      porTrackId.set(trackId, { hash: entrada.hash, vector: Float32Array.from(vista) });
    }
  }

  let dims = DIMS;
  let trackIdDims = null;
  for (const [trackId, { vector }] of porTrackId) {
    if (trackIdDims === null) {
      dims = vector.length;
      trackIdDims = trackId;
      continue;
    }
    if (vector.length !== dims) {
      throw new Error(
        `Inconsistencia de dims en indice-vectores: el track "${trackIdDims}" tiene vectores de largo ${dims} `
        + `pero el track "${trackId}" tiene largo ${vector.length}. Probablemente el modelo de embedding cambio `
        + `mientras un indice viejo con otras dims seguia vigente. Abortando para no corromper vectores.bin.`,
      );
    }
  }
  const indiceNuevo = { version: 1, modelo: MODELO_EMBEDDING, dims, tracks: {} };
  const partes = [];
  let offset = 0;
  for (const [trackId, { hash, vector }] of porTrackId) {
    indiceNuevo.tracks[trackId] = { offset, hash };
    partes.push(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength));
    offset++;
  }

  writeFileSync(rutaBin(dataDir), Buffer.concat(partes));
  writeFileSync(rutaIndice(dataDir), JSON.stringify(indiceNuevo, null, 2));
  return indiceNuevo;
}

export function vectorDe(dataDir, trackId, indice) {
  const idx = indice ?? cargarIndice(dataDir);
  const entrada = idx.tracks[trackId];
  if (!entrada) return null;
  const bin = leerBin(dataDir);
  const byteOffset = entrada.offset * idx.dims * 4;
  return Float32Array.from(new Float32Array(bin.buffer, bin.byteOffset + byteOffset, idx.dims));
}

export function centroideDe(dataDir, trackIds, indice) {
  const idx = indice ?? cargarIndice(dataDir);
  const suma = new Float32Array(idx.dims);
  let n = 0;
  for (const trackId of trackIds) {
    const v = vectorDe(dataDir, trackId, idx);
    if (!v) continue;
    for (let i = 0; i < idx.dims; i++) suma[i] += v[i];
    n++;
  }
  if (n === 0) return null;
  for (let i = 0; i < idx.dims; i++) suma[i] /= n;
  return suma;
}

export function masCercanos(dataDir, vector, n, filtro, indice) {
  const idx = indice ?? cargarIndice(dataDir);
  const bin = leerBin(dataDir);
  const resultados = [];
  for (const [trackId, entrada] of Object.entries(idx.tracks)) {
    if (filtro && !filtro(trackId)) continue;
    const byteOffset = entrada.offset * idx.dims * 4;
    const v = new Float32Array(bin.buffer, bin.byteOffset + byteOffset, idx.dims);
    resultados.push({ trackId, score: similitudCoseno(vector, v) });
  }
  resultados.sort((a, b) => b.score - a.score);
  return resultados.slice(0, n);
}
