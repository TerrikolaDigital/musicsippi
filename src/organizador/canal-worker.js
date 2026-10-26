// Petición/respuesta sobre un Web Worker: cada petición lleva un id; el worker
// responde con progreso (0..n veces) y un resultado o un error del mismo id.
// Si el worker muere (sin memoria, WASM que falla), se rechaza lo pendiente y
// la siguiente petición arranca uno nuevo.
export function crearCanalWorker(crear) {
  let worker = null;
  let siguienteId = 1;
  const pendientes = new Map();

  function asegurar() {
    if (worker) return worker;
    worker = crear();
    worker.onmessage = ({ data }) => {
      const p = pendientes.get(data?.id);
      if (!p) return;
      if (data.tipo === 'progreso') {
        p.onProgreso?.(data.progreso);
        return;
      }
      pendientes.delete(data.id);
      if (data.tipo === 'resultado') p.resolve(data.resultado);
      else p.reject(new Error(data.mensaje ?? 'El organizador falló'));
    };
    worker.onerror = (ev) => caer(new Error(ev?.message ?? 'El organizador se detuvo'));
    worker.onmessageerror = () => caer(new Error('El organizador devolvió un mensaje ilegible'));
    return worker;
  }

  // Rechaza lo pendiente y descarta el worker; la siguiente petición crea otro.
  function caer(error) {
    for (const p of pendientes.values()) p.reject(error);
    pendientes.clear();
    worker?.terminate?.();
    worker = null;
  }

  function pedir(tipo, datos = {}, onProgreso) {
    const id = siguienteId++;
    return new Promise((resolve, reject) => {
      pendientes.set(id, { resolve, reject, onProgreso });
      try {
        asegurar().postMessage({ ...datos, tipo, id });
      } catch (e) {
        pendientes.delete(id);
        reject(e);
      }
    });
  }

  // Cierra el worker (y libera su modelo) sin esperar a que muera por sí solo.
  pedir.terminar = () => caer(new Error('El organizador se cerró'));
  return pedir;
}
