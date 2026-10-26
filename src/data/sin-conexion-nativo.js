// «Escuchar sin conexión»: puente JS con el plugin nativo. Mantiene un estado compartido
// (qué hay guardado, si hay red, tamaño) que React lee con useSyncExternalStore.
// Fuera de Android no hace nada: hayRed siempre true y nada guardado.
import { useSyncExternalStore } from 'react';
import { ReproductorNativo, esAndroid } from './nativo-movil.js';
import { leerAjustesSinConexion, fusionarEstado } from './sin-conexion.js';

const ESTADO_INICIAL = Object.freeze({
  hayRed: true,
  guardados: new Set(),
  bytesUsados: 0,
  descargando: false,
  indiceTope: -1,
  sonoridad: {},
});

let estado = ESTADO_INICIAL;
let nFavoritas = 0;
let iniciado = false;
const oyentes = new Set();

function actualizar(parcial) {
  const nuevo = fusionarEstado(estado, parcial);
  if (nuevo === estado) return; // el nativo emite eventos de red por cada cambio de señal
  estado = nuevo; // objeto nuevo en cada cambio real (useSyncExternalStore)
  oyentes.forEach((cb) => cb());
}

function aplicarSnapshot(s) {
  if (!s) return;
  actualizar({
    guardados: new Set(s.idsGuardados ?? []),
    bytesUsados: s.bytesUsados ?? 0,
    descargando: !!s.descargando,
    indiceTope: s.indiceTope ?? -1,
    sonoridad: s.sonoridad ?? {},
    ...(typeof s.hayRed === 'boolean' ? { hayRed: s.hayRed } : {}),
  });
}

/** Suscribe los eventos nativos y pide el estado inicial. Idempotente; solo Android. */
export function iniciarSinConexion() {
  if (iniciado || !esAndroid()) return;
  iniciado = true;
  ReproductorNativo.addListener('sinConexion', aplicarSnapshot);
  ReproductorNativo.addListener('red', (e) => actualizar({ hayRed: !!e?.conectada }));
  ReproductorNativo.estadoSinConexion().then(aplicarSnapshot).catch(() => {});
  // Respaldo del WebView por si el evento nativo de red se retrasa.
  window.addEventListener('online', () => actualizar({ hayRed: true }));
  window.addEventListener('offline', () => actualizar({ hayRed: false }));
}

export const obtenerEstadoSinConexion = () => estado;

export function suscribirSinConexion(cb) {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}

export const useSinConexion = () =>
  useSyncExternalStore(suscribirSinConexion, obtenerEstadoSinConexion, obtenerEstadoSinConexion);

export const estaGuardada = (videoId) => estado.guardados.has(videoId);

/** Envía al nativo la selección a guardar con los ajustes actuales. */
export async function enviarSeleccion({ ids, nFavoritas: nFav = 0 }) {
  if (!esAndroid()) return;
  nFavoritas = nFav;
  const { activado, limiteMb } = leerAjustesSinConexion();
  await ReproductorNativo.fijarSeleccionSinConexion({ ids, limiteBytes: limiteMb * 1024 * 1024, activado });
}

export const obtenerNFavoritas = () => nFavoritas;

export async function borrarGuardadas() {
  if (!esAndroid()) return;
  await ReproductorNativo.borrarSinConexion();
}
