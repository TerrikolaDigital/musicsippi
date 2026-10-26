// Registro de cambios del móvil para el PC: cada entrada es una llamada a un
// endpoint que el PC ya tiene (ver sincronizar-movil.js, que las reenvía en orden).
export const CLAVE_CAMBIOS = 'cambiosPendientes';

// Leer-modificar-escribir sobre una sola clave de configuración: se serializa para
// que dos escritores a la vez (anotar mientras se descarta lo ya enviado) no se pisen.
let cola = Promise.resolve();
function serializar(tarea) {
  const hecha = cola.then(tarea);
  cola = hecha.catch(() => {});
  return hecha;
}

export function anotarCambio(almacen, endpoint, cuerpo, ahora = Date.now()) {
  return serializar(async () => {
    const pendientes = await almacen.obtenerValorConfig(CLAVE_CAMBIOS, []);
    pendientes.push({ endpoint, cuerpo, ts: ahora });
    await almacen.guardarValorConfig(CLAVE_CAMBIOS, pendientes);
  });
}

/** Quita del registro los primeros `n` (los que el PC ya aplicó). */
export function descartarCambios(almacen, n) {
  return serializar(async () => {
    const pendientes = await almacen.obtenerValorConfig(CLAVE_CAMBIOS, []);
    await almacen.guardarValorConfig(CLAVE_CAMBIOS, pendientes.slice(n));
  });
}
