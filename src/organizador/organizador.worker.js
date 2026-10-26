// Web Worker del organizador: el modelo y el cálculo no bloquean la interfaz
// ni la música. Mensajes: «medir» (diagnóstico, Task 1) y «calcular».
import { crearEmbeberTransformers, DTYPE_MOVIL } from './modelo.js';
import { calcularOrganizacion } from './calculo.js';

function percentil(ordenados, p) {
  return Math.round(ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * p))]);
}

self.onmessage = async ({ data }) => {
  const { tipo, id } = data;
  const avisar = (progreso) => self.postMessage({ tipo: 'progreso', id, progreso });
  try {
    const dtype = data.dtype ?? DTYPE_MOVIL;
    const embeber = crearEmbeberTransformers({
      dtype,
      onDescarga: (descarga) => avisar({ fase: 'preparando', descarga }),
    });
    if (tipo === 'calcular') {
      avisar({ fase: 'preparando' });
      await embeber('preparar el organizador');
      const resultado = await calcularOrganizacion(data.entrada, { embeber, onProgreso: avisar });
      self.postMessage({ tipo: 'resultado', id, resultado });
      return;
    }
    if (tipo === 'vectores') {
      // Vectores de toda la biblioteca: cada lote vuelve en el progreso para guardarse al momento (reanudable).
      avisar({ fase: 'preparando' });
      await embeber('preparar el organizador');
      const lote = data.lote ?? 25;
      for (let i = 0; i < data.items.length; i += lote) {
        const hechos = [];
        for (const it of data.items.slice(i, i + lote)) hechos.push({ trackId: it.trackId, hash: it.hash, vector: await embeber(it.texto) });
        avisar({ fase: 'vectores', hechas: Math.min(i + lote, data.items.length), total: data.items.length, lote: hechos });
      }
      self.postMessage({ tipo: 'resultado', id, resultado: { n: data.items.length } });
      return;
    }
    if (tipo === 'medir') {
      const t0 = performance.now();
      await embeber('calentar el modelo');
      const cargaMs = Math.round(performance.now() - t0);
      const tiempos = [];
      for (const texto of data.textos) {
        const t = performance.now();
        await embeber(texto);
        tiempos.push(performance.now() - t);
      }
      tiempos.sort((a, b) => a - b);
      self.postMessage({
        tipo: 'resultado',
        id,
        resultado: { dtype, cargaMs, medianaMs: percentil(tiempos, 0.5), p90Ms: percentil(tiempos, 0.9), n: tiempos.length },
      });
      return;
    }
    throw new Error(`Mensaje desconocido para el organizador: ${tipo}`);
  } catch (e) {
    self.postMessage({ tipo: 'error', id, mensaje: e?.message ?? String(e) });
  }
};
