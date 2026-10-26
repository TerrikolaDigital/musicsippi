/**
 * Unir dos modos a mano (móvil y PC): todas las canciones del modo `origenId`
 * pasan a `destinoId` sin duplicados y el origen desaparece. Reutiliza la
 * fusión de scripts/lib/fusionar-modos-duplicados.mjs (pertenencias, historial,
 * últimos modos). Muta sus argumentos.
 *
 * @returns {{ok: true, movidas: number, yaEnDestino: number, origen: object, destino: object} | {ok: false, error: string}}
 */
import { fusionarEje } from './fusionar-modos-duplicados.mjs';

// Se puede unir cualquier modo o lista (gusto, funcional, playlist) que no sea de sistema.
export const esUnible = (e) => !!e && e.tipo !== 'sistema' && !e.sistema;

export function unirModos(ejesData, biblioteca, origenId, destinoId, historial = [], ultimosModos = []) {
  if (!origenId || !destinoId || origenId === destinoId) return { ok: false, error: 'modos_iguales_o_vacios' };
  const ejes = ejesData.ejes ?? [];
  const origen = ejes.find((e) => e.id === origenId);
  const destino = ejes.find((e) => e.id === destinoId);
  if (!origen || !destino) return { ok: false, error: 'modo_no_existe' };
  if (!esUnible(origen) || !esUnible(destino)) return { ok: false, error: 'eje_no_es_modo' };
  const { movidas, yaEnLista } = fusionarEje(destino, origen, ejesData, biblioteca, historial, ultimosModos);
  // Una canción que antes solo estaba en «sin clasificar» no pierde nada: el destino ya es un modo real.
  const destinoEsModo = destino.tipo === 'gusto' || destino.tipo === 'funcional';
  for (const t of destinoEsModo ? (biblioteca.tracks ?? []) : []) {
    if (t.ejes?.some((a) => a?.ejeId === destinoId)) t.ejes = t.ejes.filter((a) => a?.ejeId !== 'sin-clasificar');
  }
  return { ok: true, movidas, yaEnDestino: yaEnLista, origen, destino };
}
