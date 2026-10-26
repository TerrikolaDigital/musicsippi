// Modelo de embeddings del organizador del móvil: el MISMO que el PC
// (scripts/lib/clasificar-embeddings.mjs) pero cuantizado, descargado la
// primera vez de huggingface.co y guardado por la librería en la Cache API.
import { crearSeguimientoDescarga } from './descarga.js';

export const MODELO = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
// q8 validado en Node con la biblioteca real; medición en el Xiaomi pendiente
// (ver docs/app-android.md, «Organizador en el móvil»).
export const DTYPE_MOVIL = 'q8';
const ARCHIVOS = { q8: 'model_quantized.onnx', q4: 'model_q4.onnx', fp32: 'model.onnx' };
export const ARCHIVO_MODELO = ARCHIVOS[DTYPE_MOVIL];

const extractores = new Map(); // dtype -> Promise<pipeline>
// Quien escucha la descarga en curso, por dtype: cada embeber nuevo (uno por
// mensaje del worker) toma el relevo, aunque la carga ya la iniciara otro.
const oyentesDescarga = new Map();

function cargar(dtype, onDescarga) {
  oyentesDescarga.set(dtype, onDescarga);
  if (!extractores.has(dtype)) {
    const promesa = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const seguir = crearSeguimientoDescarga();
      return pipeline('feature-extraction', MODELO, {
        dtype,
        progress_callback: (evento) => {
          const pct = seguir(evento);
          if (pct !== null) oyentesDescarga.get(dtype)?.(pct);
        },
      });
    })();
    // Un fallo (sin red a mitad de la descarga) no se queda cacheado.
    promesa.catch(() => extractores.delete(dtype));
    extractores.set(dtype, promesa);
  }
  return extractores.get(dtype);
}

export function crearEmbeberTransformers({ dtype = DTYPE_MOVIL, onDescarga = () => {} } = {}) {
  return async function embeber(texto) {
    const extractor = await cargar(dtype, onDescarga);
    const salida = await extractor(texto, { pooling: 'mean', normalize: true });
    return Float32Array.from(salida.data);
  };
}
