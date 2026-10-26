/**
 * Deshace los modos que creó el descubrimiento automático, para poder
 * rehacerlos desde cero.
 *
 * Hace falta porque el re-descubrimiento normal solo mira lo que sigue "Sin
 * clasificar": una vez que un modo existe, nadie lo vuelve a evaluar. Si el
 * algoritmo de agrupación mejora (ver VERSION_AGRUPACION en
 * descubrir-modos.mjs), una biblioteca que ya tiene modos armados se queda
 * con los viejos para siempre. Esto los borra una vez para que el
 * descubrimiento los reconstruya con el algoritmo nuevo.
 *
 * Lo que NO toca, a propósito:
 *  - las playlists del usuario (`tipo: 'playlist'`),
 *  - los transversales (`origen: 'transversal'`), que son otro mecanismo,
 *  - los ejes del sistema.
 * Solo `origen: 'descubierto'`, que es exactamente lo que generó el algoritmo.
 */

/** ¿Este eje cuenta como "tener género"? Mismo criterio que usa el resto de
 *  la app: una playlist o un transversal no son una clasificación (por eso
 *  /api/coleccion nunca saca 'sin-clasificar'), y los del sistema tampoco. */
function esClasificacionReal(eje) {
  if (!eje || eje.sistema) return false;
  if (eje.origen === 'transversal') return false;
  return eje.tipo === 'gusto' || eje.tipo === 'funcional';
}

function marcarSinClasificar(track) {
  if ((track.ejes ?? []).some((a) => a?.ejeId === 'sin-clasificar')) return;
  track.ejes = [...(track.ejes ?? []), { ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }];
}

/**
 * Muta `ejesData` y `biblioteca` en el lugar. Devuelve
 * `{ ejesQuitados, manuales }`, donde `manuales` es
 * `[{trackId, nombre}]`: las asignaciones que había puesto una persona a
 * mano sobre un modo descubierto. Se devuelven en vez de perderse para poder
 * restaurarlas después con restaurarManuales() — el modo se rehace, pero la
 * decisión del usuario de meter ESE track ahí no la tomó ningún algoritmo.
 */
export function resetearModosDescubiertos(ejesData, biblioteca) {
  const descubiertos = new Map(
    (ejesData.ejes ?? []).filter((e) => e?.origen === 'descubierto').map((e) => [e.id, e.nombre])
  );
  if (descubiertos.size === 0) return { ejesQuitados: 0, manuales: [] };

  ejesData.ejes = (ejesData.ejes ?? []).filter((e) => !descubiertos.has(e?.id));
  const porId = new Map(ejesData.ejes.map((e) => [e.id, e]));

  const manuales = [];
  for (const track of biblioteca.tracks ?? []) {
    const propias = (track.ejes ?? []).filter((a) => descubiertos.has(a?.ejeId));
    if (propias.length === 0) continue;
    for (const a of propias) {
      if (a.origen === 'manual') manuales.push({ trackId: track.id, nombre: descubiertos.get(a.ejeId) });
    }
    track.ejes = track.ejes.filter((a) => !descubiertos.has(a?.ejeId));
    if (!track.ejes.some((a) => esClasificacionReal(porId.get(a?.ejeId)))) marcarSinClasificar(track);
  }

  return { ejesQuitados: descubiertos.size, manuales };
}

/**
 * Vuelve a poner las asignaciones manuales que devolvió
 * resetearModosDescubiertos, emparejando por NOMBRE de modo (el id cambia al
 * rehacerse). Si el modo con ese nombre ya no existe, esa asignación
 * simplemente no se restaura: no se inventa un eje para sostenerla.
 *
 * Devuelve cuántas se restauraron.
 */
export function restaurarManuales(ejesData, biblioteca, manuales) {
  if (!manuales?.length) return 0;
  const idPorNombre = new Map();
  for (const e of ejesData.ejes ?? []) {
    if (e?.origen === 'descubierto' && e.nombre && !idPorNombre.has(e.nombre)) idPorNombre.set(e.nombre, e.id);
  }
  const porTrack = new Map((biblioteca.tracks ?? []).map((t) => [t.id, t]));

  let restauradas = 0;
  for (const { trackId, nombre } of manuales) {
    const ejeId = idPorNombre.get(nombre);
    const track = porTrack.get(trackId);
    if (!ejeId || !track) continue;
    track.ejes = (track.ejes ?? []).filter((a) => a?.ejeId !== ejeId && a?.ejeId !== 'sin-clasificar');
    track.ejes.push({ ejeId, origen: 'manual', senal: 'usuario', score: 1 });
    restauradas++;
  }
  return restauradas;
}
