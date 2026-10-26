// Porcentaje de descarga del modelo a partir de los eventos `progress_callback`
// de @huggingface/transformers (uno por archivo: modelo, tokenizer, config).
export function crearSeguimientoDescarga() {
  const archivos = new Map(); // file -> {loaded, total}
  return function seguir(evento) {
    if (!evento?.file) return null;
    const previo = archivos.get(evento.file) ?? { loaded: 0, total: 0 };
    if (evento.status === 'progress') {
      archivos.set(evento.file, { loaded: evento.loaded ?? 0, total: evento.total ?? previo.total });
    } else if (evento.status === 'done') {
      archivos.set(evento.file, { loaded: previo.total, total: previo.total });
    } else {
      archivos.set(evento.file, previo);
      return null;
    }
    let cargado = 0;
    let total = 0;
    for (const a of archivos.values()) {
      cargado += a.loaded;
      total += a.total;
    }
    return total > 0 ? Math.round((cargado / total) * 100) : null;
  };
}
