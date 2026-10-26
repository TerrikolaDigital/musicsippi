// src/movil/organizarAuto.js
// ¿Toca organizar solo ahora? Función pura: la política del arranque automático.
export const RETRASO_ORGANIZAR_AUTO_MS = 10_000;
export const INTERVALO_ORGANIZAR_AUTO_MS = 6 * 3600_000;

/**
 * @param {object} d
 * @param {number} d.sinModo canciones sin modo ahora (la misma cuenta que usa la app)
 * @param {number} [d.restantesTrasUltima] las que quedaron sin modo tras la última pasada (si no hay
 *   más que entonces, no hay nada nuevo que intentar)
 * @param {boolean} [d.estadosAlimentables] hay estados con «Se rellena sola»: toca pasar aunque no falte ningún modo
 *   (el organizador también los alimenta con ritmo, etiquetas y escuchas)
 * @param {number} d.ahora
 * @param {number|null} [d.ultimaAuto] marca de tiempo del último intento automático
 * @param {boolean} d.organizando ya hay una pasada en marcha
 * @param {boolean} [d.bloqueadoPorBucle] la protección de reanudaciones ya saltó (intentosReanudar)
 * @param {boolean} d.modeloDisponible el modelo ya está descargado
 * @param {boolean} d.redMedida datos móviles o red desconocida (falla cerrado)
 * @returns {{organizar: boolean, motivo: string}}
 */
export function tocaOrganizarSolo({
  sinModo,
  restantesTrasUltima = null,
  estadosAlimentables = false,
  ahora,
  ultimaAuto = null,
  organizando,
  bloqueadoPorBucle = false,
  modeloDisponible,
  redMedida,
}) {
  const no = (motivo) => ({ organizar: false, motivo });
  if (!(sinModo > 0) && !estadosAlimentables) return no('nada-que-organizar');
  if (organizando) return no('ya-organizando');
  if (bloqueadoPorBucle) return no('bucle');
  if (ultimaAuto != null && ahora - ultimaAuto < INTERVALO_ORGANIZAR_AUTO_MS) return no('reciente');
  if (!estadosAlimentables && restantesTrasUltima != null && sinModo <= restantesTrasUltima) return no('sin-novedades');
  if (!modeloDisponible && redMedida) return no('esperar-wifi');
  return { organizar: true, motivo: 'auto' };
}
