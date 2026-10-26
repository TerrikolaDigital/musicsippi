// src/movil/quitarDiferido.js
// «Quitar de la biblioteca» con Deshacer: la baja real se aplica al pasar `ms` sin
// deshacer (o al forzarla con `vaciar`, p. ej. al cerrar la app). Así nada hay que
// restaurar y el journal del PC solo recibe lo que de verdad se quitó.
export function crearQuitarDiferido({ quitar, ms = 6000, programar = setTimeout, cancelar = clearTimeout, alCambiar = () => {} }) {
  let pendiente = null;
  let timer = null;

  const aplicar = async () => {
    const p = pendiente;
    if (!p) return;
    clearPendiente();
    for (const id of p.ids) await quitar(id); // secuencial: cada baja reescribe la biblioteca
  };
  function clearPendiente() {
    if (timer != null) cancelar(timer);
    timer = null;
    pendiente = null;
    alCambiar(null);
  }

  return {
    /** Programa la baja de `ids`; si había otra pendiente, esa se aplica ya. */
    async programar(ids, etiqueta) {
      await aplicar();
      pendiente = { ids: [...ids], etiqueta };
      timer = programar(() => {
        aplicar().catch(() => {});
      }, ms);
      alCambiar(pendiente);
    },
    deshacer() {
      if (pendiente) clearPendiente();
    },
    vaciar: aplicar,
    pendiente: () => pendiente,
  };
}
