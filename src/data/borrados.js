// Borrados del móvil que aún no llegaron al PC (lápidas). Sin esto, una lista o una
// canción quitada en el móvil volvía a aparecer: el PC todavía la tenía y la sincronización
// (o la biblioteca que trae el build) la devolvía.

/** Ids de modos/listas que se quitaron en `cambios` (entradas del registro de cambios). */
export function ejesEliminadosEn(cambios) {
  const ids = new Set();
  for (const c of cambios ?? []) {
    if (c.endpoint === 'ejes') for (const id of c.cuerpo?.eliminados ?? []) ids.add(id);
    if (c.endpoint === 'unir-modos' && c.cuerpo?.origenId) ids.add(c.cuerpo.origenId);
  }
  return ids;
}

/** Lo borrado en el móvil y aún sin subir: {tracks, ejes} (conjuntos de ids). */
export function borradosPendientes(cambios) {
  const tracks = new Set();
  for (const c of cambios ?? []) if (c.endpoint === 'quitar-track' && c.cuerpo?.trackId) tracks.add(c.cuerpo.trackId);
  return { tracks, ejes: ejesEliminadosEn(cambios) };
}

/**
 * Lista de modos que se manda al PC en /api/ejes (que la reemplaza entera): la del móvil más los que
 * solo existen en el PC (creados allí desde la última sincronización), salvo los que el móvil quitó.
 */
export function ejesParaSubir(delMovil, delPC, eliminados = new Set()) {
  const ids = new Set(delMovil.map((e) => e.id));
  return [...delMovil, ...delPC.filter((e) => !ids.has(e.id) && !eliminados.has(e.id))];
}
