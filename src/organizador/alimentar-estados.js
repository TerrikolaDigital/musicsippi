// src/organizador/alimentar-estados.js
// Paso «alimentar estados» del organizador del móvil (tras el cálculo de géneros): lee las señales guardadas en
// IndexedDB, decide con la función pura de senales-estados.js y anota lo que entra (también para el PC).
// Claves de configuración:
//   usoEstados          { trackId: { estadoId: saldo } }  escuchas desde los chips de «¿Cómo te sientes?»
//   exclusionesEstados  { trackId: [estadoId] }           estados de los que el usuario la quitó a mano
import { anotarCambio } from '../data/lib/journal.js';
import { alimentarEstados, aplicarPropuestas, etiquetasEfectivas, sumarUso } from './senales-estados.js';
import { ID_BSO, esBandaSonora } from './migrar-moods.js';

/** Nombres de género que se conocen de una canción (MusicBrainz, Deezer y la evidencia del PC), sin repetir. */
export function generosDeRegistro(r) {
  const brutos = [r?.generosMB, r?.generosDeezer, r?.mbCancion?.generos, r?.mbAlbum?.generos, r?.evidenciaPC?.generos].flatMap((l) => (Array.isArray(l) ? l : []));
  return [...new Set(brutos.map((g) => (typeof g === 'string' ? g : g?.nombre ?? g?.name ?? '')).filter(Boolean))];
}

export const CLAVE_USO_ESTADOS = 'usoEstados';
export const CLAVE_EXCLUSIONES_ESTADOS = 'exclusionesEstados';

/** Anota que el usuario quitó la canción de ese estado: no se vuelve a meter sola. */
export async function excluirDeEstado(almacen, trackId, estadoId) {
  const ex = await almacen.obtenerValorConfig(CLAVE_EXCLUSIONES_ESTADOS, {});
  if ((ex[trackId] ?? []).includes(estadoId)) return;
  await almacen.guardarValorConfig(CLAVE_EXCLUSIONES_ESTADOS, { ...ex, [trackId]: [...(ex[trackId] ?? []), estadoId] });
}

/** Si el usuario la pone a mano de nuevo, deja de estar excluida (lo manual manda). */
export async function perdonarEnEstado(almacen, trackId, estadoId) {
  const ex = await almacen.obtenerValorConfig(CLAVE_EXCLUSIONES_ESTADOS, {});
  if (!(ex[trackId] ?? []).includes(estadoId)) return;
  const resto = ex[trackId].filter((id) => id !== estadoId);
  const nuevo = { ...ex };
  if (resto.length) nuevo[trackId] = resto;
  else delete nuevo[trackId];
  await almacen.guardarValorConfig(CLAVE_EXCLUSIONES_ESTADOS, nuevo);
}

/** Suma o resta una escucha (fracción 0–1 oída de la canción) al saldo de esa canción en ese estado. */
export async function registrarUsoEstado(almacen, trackId, estadoId, fraccion) {
  const uso = await almacen.obtenerValorConfig(CLAVE_USO_ESTADOS, {});
  const nuevo = sumarUso(uso, trackId, estadoId, fraccion);
  if (nuevo !== uso) await almacen.guardarValorConfig(CLAVE_USO_ESTADOS, nuevo);
}

/**
 * Bandas sonoras para canciones nuevas: álbum de banda sonora o compositor de cine. Se SUMA al género que ya
 * tengan (no se quita nada) y respeta si el usuario la quitó a mano. Solo si el mood ya existe (móvil reorganizado).
 * Devuelve { agregadas }.
 */
export async function colocarBandasSonorasPendientes({ almacen }) {
  const ejes = await almacen.obtenerTodos('ejes');
  const eje = ejes.find((e) => e.id === ID_BSO);
  if (!eje || eje.activo === false) return { agregadas: 0 };
  const [tracks, metas, exclusiones] = await Promise.all([
    almacen.obtenerTodos('biblioteca'),
    almacen.obtenerTodos('metadataLocal'),
    almacen.obtenerValorConfig(CLAVE_EXCLUSIONES_ESTADOS, {}),
  ]);
  const albumes = new Map(metas.map((m) => [m.trackId, m.album]));
  const nuevas = [];
  for (const t of tracks) {
    if ((t.ejes ?? []).some((x) => x.ejeId === ID_BSO)) continue;
    if ((exclusiones[t.id] ?? []).includes(ID_BSO)) continue;
    if (!esBandaSonora(t.artista, albumes.get(t.id))) continue;
    nuevas.push({ ...t, ejes: [...(t.ejes ?? []).filter((x) => x.ejeId !== 'sin-clasificar'), { ejeId: ID_BSO, origen: 'auto', senal: 'patron-titulo', score: 1 }] });
  }
  if (nuevas.length === 0) return { agregadas: 0 };
  // Primero el aviso al PC (idempotente allí: fusión por nombre), luego los datos locales.
  await anotarCambio(almacen, 'confirmar-modos', { modosConfirmados: [{ nombre: eje.nombre, trackIds: nuevas.map((t) => t.id) }], transversalesActivados: [] });
  await almacen.guardarVarios('biblioteca', nuevas);
  return { agregadas: nuevas.length };
}

/** Paso del organizador: estados por señales + Bandas sonoras. Devuelve { agregadas, porEstado }. */
export async function alimentarEstadosPendientes({ almacen }) {
  const r = await alimentarSenalesPendientes({ almacen });
  const b = await colocarBandasSonorasPendientes({ almacen });
  return b.agregadas ? { ...r, agregadas: r.agregadas + b.agregadas } : r;
}

/**
 * Lee todo, decide y guarda. Devuelve { agregadas, porEstado } (agregadas = pertenencias nuevas).
 * `leerVectores()` devuelve [{trackId, vector}]; por defecto, el store `vectores`.
 */
async function alimentarSenalesPendientes({ almacen }) {
  const [tracks, ejes, registros, metas, vectores, uso, exclusiones] = await Promise.all([
    almacen.obtenerTodos('biblioteca'),
    almacen.obtenerTodos('ejes'),
    almacen.obtenerTodos('generos'),
    almacen.obtenerTodos('metadataLocal'),
    almacen.obtenerTodos('vectores'),
    almacen.obtenerValorConfig(CLAVE_USO_ESTADOS, {}),
    almacen.obtenerValorConfig(CLAVE_EXCLUSIONES_ESTADOS, {}),
  ]);
  const bpm = {};
  for (const m of metas) if (m.bpm > 0) bpm[m.trackId] = m.bpm;
  const etiquetas = {};
  for (const r of registros) {
    const e = etiquetasEfectivas(r);
    if (e.length) etiquetas[r.trackId] = e;
  }
  const generos = {};
  for (const r of registros) {
    const g = generosDeRegistro(r);
    if (g.length) generos[r.trackId] = g;
  }
  const albumes = {};
  for (const m of metas) if (typeof m.album === 'string' && m.album) albumes[m.trackId] = m.album;
  const { propuestas, porEstado } = alimentarEstados({ tracks, ejes, bpm, etiquetas, vectores, uso, exclusiones, generos, albumes });
  if (propuestas.length === 0) return { agregadas: 0, porEstado };

  const nuevas = aplicarPropuestas(tracks, propuestas);
  const antes = new Map(tracks.map((t) => [t.id, t.ejes?.length ?? 0]));
  const cambiadas = nuevas.filter((t) => (t.ejes?.length ?? 0) !== antes.get(t.id));
  // Primero el aviso al PC (idempotente allí: fusión por nombre), luego los datos locales.
  const nombres = new Map(ejes.map((e) => [e.id, e.nombre]));
  const porNombre = new Map();
  for (const p of propuestas) {
    const nombre = nombres.get(p.estadoId);
    if (!porNombre.has(nombre)) porNombre.set(nombre, []);
    porNombre.get(nombre).push(p.trackId);
  }
  await anotarCambio(almacen, 'confirmar-modos', {
    modosConfirmados: [...porNombre].map(([nombre, trackIds]) => ({ nombre, trackIds })),
    transversalesActivados: [],
  });
  await almacen.guardarVarios('biblioteca', cambiadas);
  return { agregadas: propuestas.length, porEstado };
}
