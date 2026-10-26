import { pipeline } from '@huggingface/transformers';
import { MODELO_EMBEDDING, crearEmbeberTermino, textoDeEje } from './clasificar-embeddings-puro.mjs';

export * from './clasificar-embeddings-puro.mjs';

let extractor = null;
async function cargarExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', MODELO_EMBEDDING);
  }
  return extractor;
}

export async function embeber(texto) {
  const modelo = await cargarExtractor();
  const salida = await modelo(texto, { pooling: 'mean', normalize: true });
  return Float32Array.from(salida.data);
}

export const embeberTermino = crearEmbeberTermino(embeber);

export async function embeberEjes(ejesValidos) {
  const resultado = [];
  for (const eje of ejesValidos) {
    const emb = await embeber(textoDeEje(eje));
    resultado.push({ ejeId: eje.id, emb });
  }
  return resultado;
}
