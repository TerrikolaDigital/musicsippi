// Sincronización JS <-> reproductor nativo (Android).
//
// Con la pantalla bloqueada el nativo sigue solo (fin de pista, ⏭/⏮ del sistema, auriculares) y el
// WebView puede estar congelado o incluso recreado. La fuente de verdad en segundo plano es el
// nativo: al volver, JS lee su estado y lo ADOPTA, sin recargar nada.

/** Un comando del sistema que llega con más retraso que esto es de cuando el WebView dormía: se descarta. */
export const MAX_RETRASO_COMANDO_MS = 8000;

/**
 * ¿Hay que ignorar este comando? Solo ⏭/⏮: si llegan con horas de retraso (WebView congelado) y se
 * ejecutan al desbloquear, cambian de canción sin que nadie lo pida. Favorito/aleatorio sí se aplican
 * (el nativo ya cambió el icono; JS debe confirmar el estado).
 */
export function comandoCaducado(accion, ts, ahora = Date.now(), maximo = MAX_RETRASO_COMANDO_MS) {
  if (accion !== 'siguiente' && accion !== 'anterior') return false;
  if (!Number.isFinite(ts)) return false;
  return ahora - ts > maximo;
}

/**
 * Qué hacer con la foto del nativo ({id, indice, total, posicionMs, duracionMs, estado} o {}).
 * Devuelve null si no hay nada que adoptar: nativo vacío, o JS está cargando una pista pedida por el
 * usuario (el nativo aún tiene la vieja y no debe pisar la petición).
 */
export function planAdopcion({ nativo, videoActual, cargando }) {
  if (!nativo || !nativo.id || cargando) return null;
  return {
    id: nativo.id,
    cambioPista: nativo.id !== videoActual,
    posicionMs: Math.max(0, Number(nativo.posicionMs) || 0),
    duracionMs: Math.max(0, Number(nativo.duracionMs) || 0),
    estado: nativo.estado ?? 'pausado',
  };
}

/**
 * Índice de la cola cuya pista suena como `videoId`, buscando desde `desde` en círculo (así, con
 * duplicados, gana el más cercano hacia delante). -1 si no está. `idsDe(pista)` = ids con los que
 * puede sonar (videoId de YouTube o «local:…»).
 */
export function indiceDePista(cola, videoId, desde, idsDe) {
  const n = cola.length;
  for (let k = 0; k < n; k += 1) {
    const j = (desde + k) % n;
    if (idsDe(cola[j]).includes(videoId)) return j;
  }
  return -1;
}
