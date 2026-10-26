// src/data/recalificar-moods-movil.js
// «Recalificar moods» en el móvil (reglas R1-R9 de la auditoría): una sola vez al abrir, con copia previa en la
// configuración local y «Deshacer», anotando los cambios al registro para el PC. Guarda la lista de lo que salió o
// cambió para la pantalla Ajustes › «Revisar moods», donde cada canción se puede devolver con un toque.
// Trabaja contra un `almacen` con la interfaz de db.js (en los tests, almacen-memoria.js).
import { ESTADOS, GENEROS, ID_BSO, VERSION_ESQUEMA_MOODS, esquemaDeEjes, musicbrainzDeMovil } from '../organizador/migrar-moods.js';
import { SENAL_RECALIFICAR, accionesDeJournal, recalificarMoods } from '../organizador/recalificar-moods.js';
import { crearIndiceVecinos } from '../organizador/senales-estados.js';
import { perdonarEnEstado } from '../organizador/alimentar-estados.js';
import { CLAVE_CAMBIOS, anotarCambio } from './lib/journal.js';
import { CLAVE_COPIA_PREVIA, CLAVE_ESQUEMA } from './migrar-moods-movil.js';

export const CLAVE_RECALIFICACION = 'recalificacionMoods';
export const CLAVE_COPIA_RECALIFICACION = 'copiaPreRecalificacionMoods';
export const CLAVE_REVISION = 'revisionMoods';

const IDS_GENERO = new Set(GENEROS.map((g) => g.id));
const IDS_ESTADO = new Set(ESTADOS.map((e) => e.id));

/** Anota al registro del PC la diferencia entre las pertenencias de una canción antes y después. */
async function anotarDiferencias(almacen, trackId, antes, despues) {
  const a = new Set((antes ?? []).map((x) => x.ejeId));
  const d = new Set((despues ?? []).map((x) => x.ejeId));
  const esMood = (id) => id && id !== 'sin-clasificar' && id !== 'favoritos';
  for (const ejeId of a) if (esMood(ejeId) && !d.has(ejeId)) await anotarCambio(almacen, 'quitar-modo', { trackId, ejeId });
  for (const ejeId of d) if (esMood(ejeId) && !a.has(ejeId)) await anotarCambio(almacen, 'asignar', { trackId, ejeId });
}

/**
 * Recalifica una sola vez. Devuelve { hecho, motivo?, cambiadas?, aLista? }.
 * `vecinos`/`bpm` se leen de los almacenes (vectores del organizador, tempo de Deezer si lo hay).
 */
export async function recalificarMovil(almacen, { metadata = null, ahora = () => new Date() } = {}) {
  if (await almacen.obtenerValorConfig(CLAVE_RECALIFICACION, null)) return { hecho: false, motivo: 'ya-hecha' };
  const [tracks, ejes, generos, metas, vectores, cambios, copia] = await Promise.all([
    almacen.obtenerTodos('biblioteca'),
    almacen.obtenerTodos('ejes'),
    almacen.obtenerTodos('generos'),
    almacen.obtenerTodos('metadataLocal'),
    almacen.obtenerTodos('vectores'),
    almacen.obtenerValorConfig(CLAVE_CAMBIOS, []),
    almacen.obtenerValorConfig(CLAVE_COPIA_PREVIA, null),
  ]);
  const esquema = esquemaDeEjes(ejes, await almacen.obtenerValorConfig(CLAVE_ESQUEMA, 0));
  if (esquema < VERSION_ESQUEMA_MOODS) return { hecho: false, motivo: 'sin-migrar' };
  if (tracks.length === 0) return { hecho: false, motivo: 'sin-canciones' };

  const albumes = {};
  const bpm = {};
  for (const m of metas) {
    if (typeof m.album === 'string' && m.album) albumes[m.trackId] = m.album;
    if (m.bpm > 0) bpm[m.trackId] = m.bpm;
  }
  const { plan, tracks: nuevas } = recalificarMoods({
    tracks,
    ejes,
    copiaPrevia: copia?.biblioteca ? { tracks: copia.biblioteca, ejes: copia.ejes ?? [] } : null,
    musicbrainz: musicbrainzDeMovil({ tracks, generos, metadata }),
    albumes,
    bpm,
    vecinos: vectores.length ? crearIndiceVecinos(vectores) : null,
    accionesUsuario: accionesDeJournal(cambios),
  });
  const originales = new Map(tracks.map((t) => [t.id, t]));
  const aGuardar = nuevas.filter((t) => t !== originales.get(t.id));
  const marca = { fecha: ahora().toISOString(), cambios: plan.cambios.length, aLista: plan.resumen.aLista, avisos: plan.avisos };
  if (aGuardar.length === 0) {
    await almacen.guardarValorConfig(CLAVE_RECALIFICACION, marca);
    return { hecho: true, cambiadas: 0, aLista: 0 };
  }
  // Copia previa (solo de las canciones que cambian) ANTES de escribir nada.
  await almacen.guardarValorConfig(CLAVE_COPIA_RECALIFICACION, { fecha: marca.fecha, ejesPrevios: Object.fromEntries(aGuardar.map((t) => [t.id, originales.get(t.id).ejes ?? []])) });
  try {
    await almacen.guardarVarios('biblioteca', aGuardar);
    for (const t of aGuardar) await anotarDiferencias(almacen, t.id, originales.get(t.id).ejes, t.ejes);
    await almacen.guardarValorConfig(CLAVE_REVISION, { fecha: marca.fecha, cambios: plan.cambios, devueltos: {} });
    await almacen.guardarValorConfig(CLAVE_RECALIFICACION, marca);
  } catch (e) {
    await almacen.guardarVarios('biblioteca', aGuardar.map((t) => originales.get(t.id)));
    await almacen.guardarValorConfig(CLAVE_COPIA_RECALIFICACION, null);
    throw e;
  }
  return { hecho: true, cambiadas: plan.cambios.length, aLista: plan.resumen.aLista };
}

export async function hayCopiaRecalificacion(almacen) {
  const c = await almacen.obtenerValorConfig(CLAVE_COPIA_RECALIFICACION, null);
  return c ? { fecha: c.fecha, canciones: Object.keys(c.ejesPrevios).length } : null;
}

/** Vuelve las canciones tocadas a como estaban antes de recalificar (y se lo anota al PC). */
export async function deshacerRecalificacion(almacen) {
  const c = await almacen.obtenerValorConfig(CLAVE_COPIA_RECALIFICACION, null);
  if (!c) throw new Error('No hay copia de seguridad que restaurar.');
  const tracks = await almacen.obtenerTodos('biblioteca');
  const restauradas = [];
  for (const t of tracks) {
    const previos = c.ejesPrevios[t.id];
    if (!previos) continue;
    restauradas.push({ antes: t, nueva: { ...t, ejes: previos } });
  }
  await almacen.guardarVarios('biblioteca', restauradas.map((r) => r.nueva));
  for (const r of restauradas) await anotarDiferencias(almacen, r.antes.id, r.antes.ejes, r.nueva.ejes);
  await almacen.guardarValorConfig(CLAVE_COPIA_RECALIFICACION, null);
  await almacen.guardarValorConfig(CLAVE_REVISION, null);
  return { canciones: restauradas.length };
}

export async function leerRevision(almacen) {
  const r = await almacen.obtenerValorConfig(CLAVE_REVISION, null);
  return r?.cambios?.length ? r : null;
}

const claveItem = (trackId, ejeId) => `${trackId}|${ejeId}`;

/**
 * Lo que enseña «Revisar moods», agrupado por mood: canciones que salieron de él (o cuyo género cambió desde él) y
 * géneros nuevos que se les puso. [{ ejeId, nombre, familia, items:[{trackId, artista, titulo, tipo:'salio'|'entro', motivo, haciaEjeId, devuelto}] }]
 */
export function agruparRevision(revision, ejes = []) {
  const nombres = new Map(ejes.map((e) => [e.id, e.nombre]));
  const orden = [...ESTADOS.map((e) => e.id), ...GENEROS.map((g) => g.id)];
  const grupos = new Map();
  const grupo = (ejeId) => {
    if (!grupos.has(ejeId)) grupos.set(ejeId, { ejeId, nombre: nombres.get(ejeId) ?? ejeId, familia: IDS_ESTADO.has(ejeId) ? 'estado' : 'genero', items: [] });
    return grupos.get(ejeId);
  };
  for (const c of revision?.cambios ?? []) {
    const devuelto = (ejeId) => !!revision.devueltos?.[claveItem(c.id, ejeId)];
    for (const s of c.sale) {
      grupo(s.ejeId).items.push({ trackId: c.id, artista: c.artista, titulo: c.titulo, tipo: 'salio', motivo: s.motivo, haciaEjeId: c.genero?.de === s.ejeId ? c.genero.a : null, devuelto: devuelto(s.ejeId) });
    }
    // Un género nuevo sobre una canción que no tenía: se puede quitar con un toque.
    if (c.genero && !c.genero.de) {
      grupo(c.genero.a).items.push({ trackId: c.id, artista: c.artista, titulo: c.titulo, tipo: 'entro', motivo: c.entra.find((e) => e.ejeId === c.genero.a)?.motivo ?? 'cambio-de-genero', haciaEjeId: null, devuelto: devuelto(c.genero.a) });
    }
  }
  const pos = (id) => (orden.indexOf(id) === -1 ? 99 : orden.indexOf(id));
  return [...grupos.values()].sort((a, z) => pos(a.ejeId) - pos(z.ejeId));
}

/**
 * Devuelve una canción a lo que tenía: `salio` -> vuelve a ese mood (como decisión tuya: no se vuelve a quitar sola) y,
 * si era un género, se retira el que se le puso; `entro` -> se quita el género nuevo. Se anota al PC.
 */
export async function devolverCancion(almacen, trackId, ejeId, tipo = 'salio') {
  const revision = await almacen.obtenerValorConfig(CLAVE_REVISION, null);
  const t = await almacen.obtenerPorClave('biblioteca', trackId);
  if (!revision || !t) throw new Error('Esa canción ya no está en la lista de cambios.');
  const antes = t.ejes ?? [];
  let ejes;
  if (tipo === 'entro') {
    ejes = antes.filter((x) => x.ejeId !== ejeId);
  } else {
    const recalificado = (x) => IDS_GENERO.has(x.ejeId) && x.ejeId !== ID_BSO && x.senal === SENAL_RECALIFICAR;
    const base = IDS_GENERO.has(ejeId) && ejeId !== ID_BSO ? antes.filter((x) => !recalificado(x)) : antes;
    ejes = [...base.filter((x) => x.ejeId !== ejeId && x.ejeId !== 'sin-clasificar'), { ejeId, origen: 'manual', senal: 'usuario', score: 1 }];
    if (IDS_ESTADO.has(ejeId)) await perdonarEnEstado(almacen, trackId, ejeId);
  }
  if (!ejes.some((x) => x.ejeId !== 'sin-clasificar' && x.ejeId !== 'favoritos') && !ejes.some((x) => x.ejeId === 'sin-clasificar')) {
    ejes = [...ejes, { ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }];
  }
  await almacen.guardarRegistro('biblioteca', { ...t, ejes });
  await anotarDiferencias(almacen, trackId, antes, ejes);
  await almacen.guardarValorConfig(CLAVE_REVISION, { ...revision, devueltos: { ...revision.devueltos, [claveItem(trackId, ejeId)]: true } });
  return { ejes };
}
