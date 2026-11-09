// Qué se guarda de la cola al cerrar la app y cómo se recupera al reabrirla.
//
// De la biblioteca se guardan solo ids: al restaurar se resuelven contra la biblioteca actual, así
// una edición o fusión de duplicados no deja la cola apuntando a una copia vieja. Las canciones de
// FUERA de la biblioteca (provisionales de Deezer, vistas previas, búsquedas) no se pueden resolver
// así, por eso se guardan enteras en `provisionales`. Sin eso se perdían al reabrir y, si la que
// sonaba era una de ellas, la cola volvía a empezar por la primera.

/** Campos del eje activo que hay que conservar (p. ej. `origenArtista` de la cola de un artista). */
function ejeParaGuardar(eje) {
  if (!eje) return null;
  if (eje.id) return null; // un modo real se recupera por id
  return { ...eje };
}

/** Datos que se escriben en localStorage. `enBiblioteca(id)` dice si el id se resuelve solo. */
export function datosSesion({ cola, trackActual, ejeActivo, ejeVista, tiempo, aleatorio, repetir }, enBiblioteca) {
  const provisionales = {};
  for (const t of cola) {
    if (t?.id && !enBiblioteca(t.id)) provisionales[t.id] = t;
  }
  return {
    colaIds: cola.map((t) => t.id),
    provisionales,
    trackActualId: trackActual?.id ?? null,
    ejeActivoId: ejeActivo?.id ?? null,
    ejeActivoNombre: ejeActivo?.nombre ?? null,
    ejeActivoExtra: ejeParaGuardar(ejeActivo),
    ejeVistaId: ejeVista?.id ?? null,
    ejeVistaNombre: ejeVista?.nombre ?? null,
    tiempo,
    aleatorio,
    repetir,
  };
}

/** Cola restaurada: cada id se busca en la biblioteca y, si no está, en las provisionales guardadas. */
export function colaRestaurada(s, porId) {
  const provisionales = s?.provisionales && typeof s.provisionales === 'object' ? s.provisionales : {};
  return (s?.colaIds ?? []).map((id) => porId.get(id) ?? provisionales[id] ?? null).filter(Boolean);
}

/** Eje activo restaurado sin id (cola de búsqueda, de artista…), con sus campos extra. */
export function ejeSinIdRestaurado(s) {
  if (s?.ejeActivoExtra && typeof s.ejeActivoExtra === 'object') return { ...s.ejeActivoExtra };
  return s?.ejeActivoNombre ? { nombre: s.ejeActivoNombre } : null;
}
