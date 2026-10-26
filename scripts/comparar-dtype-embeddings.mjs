// scripts/comparar-dtype-embeddings.mjs
// ¿El modelo cuantizado del móvil da los mismos modos que el fp32 del PC?
// Compara vectores de canciones reales y la agrupación de términos de género
// (agruparTerminos, umbral 0.5) con uno y otro.
//   node scripts/comparar-dtype-embeddings.mjs q8
import { pipeline } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { cargarFuentes } from './lib/fuentes.mjs';
import { armarGenerosPorTrack } from './lib/generos-por-track.mjs';
import { similitudCoseno } from './lib/indice-vectores.mjs';
import { textoDeTrack } from './lib/clasificar-embeddings.mjs';
import { agruparTerminos } from './lib/descubrir-modos.mjs';

const dtype = process.argv[2] ?? 'q8';
const MODELO = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const { dataDir } = resolverRaizYDataDir(import.meta.url);
const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
const fuentes = cargarFuentes(dataDir);
if (!fuentes) throw new Error(`No hay fuentes.json válido en ${dataDir}`);
const generos = armarGenerosPorTrack(dataDir, biblioteca.tracks, fuentes);
const muestra = biblioteca.tracks.slice(0, 200);
const terminos = [...new Set([...generos.values()].flat())].slice(0, 150);

const aEmbeber = (extractor) => async (texto) =>
  Float32Array.from((await extractor(texto, { pooling: 'mean', normalize: true })).data);
const aTermino = (embeber) => {
  let base = null;
  return async (termino) => {
    base ??= await embeber('género musical:');
    const v = await embeber(`género musical: ${termino}`);
    return v.map((x, i) => x - base[i]);
  };
};

const ref = aEmbeber(await pipeline('feature-extraction', MODELO, { dtype: 'fp32' }));
const cuant = aEmbeber(await pipeline('feature-extraction', MODELO, { dtype }));

let suma = 0;
let minimo = 1;
for (const t of muestra) {
  const texto = textoDeTrack(t, { generos: generos.get(t.id) ?? [] });
  const s = similitudCoseno(await ref(texto), await cuant(texto));
  suma += s;
  minimo = Math.min(minimo, s);
}

const conFrecuencia = terminos.map((termino) => ({ termino, frecuencia: 1 }));
const gruposRef = await agruparTerminos(conFrecuencia, aTermino(ref), 0.5);
const gruposCuant = await agruparTerminos(conFrecuencia, aTermino(cuant), 0.5);
const grupoDe = (grupos) => {
  const m = new Map();
  grupos.forEach((g, i) => g.terminos.forEach(({ termino }) => m.set(termino, i)));
  return m;
};
const a = grupoDe(gruposRef);
const b = grupoDe(gruposCuant);
let iguales = 0;
let pares = 0;
for (let i = 0; i < terminos.length; i++) {
  for (let j = i + 1; j < terminos.length; j++) {
    pares += 1;
    const juntosA = a.get(terminos[i]) === a.get(terminos[j]);
    const juntosB = b.get(terminos[i]) === b.get(terminos[j]);
    if (juntosA === juntosB) iguales += 1;
  }
}
console.log({
  dtype,
  canciones: muestra.length,
  cosenoMedio: Number((suma / muestra.length).toFixed(4)),
  cosenoMinimo: Number(minimo.toFixed(4)),
  gruposFp32: gruposRef.length,
  gruposCuantizado: gruposCuant.length,
  acuerdoParejas: Number((iguales / Math.max(1, pares)).toFixed(4)),
});
