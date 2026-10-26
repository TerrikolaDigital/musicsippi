// Subida al PC del registro de cambios del móvil (la usa sincronizar-movil.js).

/** Altas de canciones: si el PC las rechaza no se descartan (si no, la canción se perdería). */
const ENDPOINTS_ALTA = new Set(['importar-tunemymusic', 'agregar-track', 'agregar-album']);

/**
 * Sube al PC los cambios hechos en el móvil, en orden. Un fallo de red corta
 * (lo que quede se reenvía la próxima vez); si el PC rechaza uno (p. ej. la
 * canción ya no existe allí) se salta, salvo las altas de canciones: ante el
 * primer rechazo de una alta se corta ahí y esa y las siguientes quedan en el
 * registro para reintentar. Devuelve cuántos aplicó el PC y si hubo rechazo.
 */
export async function subirCambiosAlPC(base, { enviar, obtener, descartar }) {
  const pendientes = await obtener();
  let procesados = 0;
  let aplicados = 0;
  let altaRechazada = false;
  for (const c of pendientes) {
    let cuerpo = c.cuerpo;
    // /api/ejes reemplaza la lista entera: se combina con la del PC para no
    // borrar los modos que se crearon allí desde la última sincronización.
    if (c.endpoint === 'ejes') {
      const { datos } = await enviar(base, 'GET', 'biblioteca-fresca');
      const delMovil = new Map(cuerpo.ejes.map((e) => [e.id, e]));
      const soloPC = (datos?.ejes ?? []).filter((e) => !delMovil.has(e.id));
      cuerpo = { ...cuerpo, ejes: [...cuerpo.ejes, ...soloPC] };
    }
    const { status } = await enviar(base, 'POST', c.endpoint, cuerpo);
    if (status >= 200 && status < 300) {
      aplicados += 1;
    } else {
      console.warn('[sincronizar] el PC rechazó', c.endpoint, status);
      if (ENDPOINTS_ALTA.has(c.endpoint)) {
        altaRechazada = true;
        break;
      }
    }
    procesados += 1;
  }
  await descartar(procesados);
  return { aplicados, altaRechazada };
}
