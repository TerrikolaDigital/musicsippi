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
 * Lo que sigue en el formato de las pendientes del servicio nativo. Él solo sabe resolver YouTube: se
 * corta en la primera pista local para no saltarse canciones (esa y las siguientes las entrega JS).
 */
export function pendientesParaNativo(lista, esLocal) {
  const corte = lista.findIndex((p) => esLocal(p.videoId));
  return (corte === -1 ? lista : lista.slice(0, corte)).map((p) => ({
    id: p.videoId,
    titulo: p.titulo ?? '',
    artista: p.artista ?? '',
    portadaUrl: p.portadaUrl ?? null,
  }));
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
    respaldo: !!nativo.respaldo,
    senalDebil: nativo.senalDebil ?? null,
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

/**
 * Debounce «trailing»: aplica solo el último valor recibido tras `esperaMs` sin valores nuevos.
 * Al despertar el WebView llegan en ráfaga las transiciones atrasadas; solo importa la última.
 */
export function crearCoalescedor(aplicar, esperaMs, { programar = setTimeout, cancelar = clearTimeout } = {}) {
  let temporizador = null;
  return (valor) => {
    if (temporizador !== null) cancelar(temporizador);
    temporizador = programar(() => {
      temporizador = null;
      aplicar(valor);
    }, esperaMs);
  };
}

/**
 * ¿A qué pista de la cola nativa pertenece la metadata que publica App? Devuelve su id, o null si
 * todavía no hay a quién dársela.
 *
 * App publica título/artista de SU pista actual, y lo hace antes de que el nativo cambie de pista
 * (resolver tarda, el salto es asíncrono, con la pantalla bloqueada el nativo va por libre). Si esa
 * metadata se aplica «a la que suene ahora», se pega a la pista vieja: luego, al volver a ella con ⏮,
 * la pantalla de bloqueo enseña el título de otra canción con la duración de la que suena.
 *
 * - `trackIdMeta`: trackId de la pista que describe la metadata (null si App no lo indica).
 * - `idNativo`/`trackIdNativo`: la pista que JS sabe que tiene (o va a tener) el nativo.
 */
export function destinoMetadata({ trackIdMeta, idNativo, trackIdNativo }) {
  if (!idNativo) return null;
  if (trackIdMeta == null && trackIdNativo == null) return idNativo; // sin datos: como antes
  if (trackIdMeta == null || trackIdNativo == null) return null; // no se puede comprobar: se espera
  return String(trackIdMeta) === String(trackIdNativo) ? idNativo : null;
}
