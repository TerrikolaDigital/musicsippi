// Aplica el resultado del cálculo con la MISMA función que el PC
// (aplicarModosConfirmados: ids con slugificar/idUnico, fusión por nombre con
// los modos descubiertos existentes) y lo anota como POST /api/confirmar-modos.
import { aplicarModosConfirmados } from '../../scripts/lib/aplicar-modos.mjs';
import { anotarCambio } from '../data/lib/journal.js';
import { guardarVectores } from './vectores.js';
import { idsDeEstado, necesitaGenero } from './sin-modo.js';
import { resolverVetosDeGeneroNuevo } from './compatibilidad-estados.js';

export async function aplicarResultado(resultado, almacen) {
  const { modosConfirmados = [], senalPorTrack = {}, vectoresNuevos = [] } = resultado;
  if (vectoresNuevos.length) await guardarVectores(almacen, vectoresNuevos);
  if (modosConfirmados.length === 0) return { modosNuevos: [], colocadas: 0 };

  const [tracks, ejes] = await Promise.all([almacen.obtenerTodos('biblioteca'), almacen.obtenerTodos('ejes')]);
  const estados = idsDeEstado(ejes);
  const idsGenero = new Set(ejes.filter((e) => e.familia === 'genero').map((e) => e.id));
  const sinModoAntes = new Set(tracks.filter((t) => necesitaGenero(t, estados)).map((t) => t.id));
  const antes = new Map(tracks.map((t) => [t.id, JSON.stringify(t.ejes)]));
  const ejesAntes = new Map(ejes.map((e) => [e.id, JSON.stringify(e)]));
  const ejesActuales = { ejes };
  const biblioteca = { tracks };
  const { nuevosEjes } = aplicarModosConfirmados(ejesActuales, biblioteca, modosConfirmados, [], senalPorTrack);
  // R2 para música nueva: el género recién puesto no puede contradecir (veto duro) un estado que ya tenía.
  const vetados = [];
  for (const t of biblioteca.tracks) {
    const previos = new Set(JSON.parse(antes.get(t.id) ?? '[]').map((x) => x.ejeId));
    const nuevos = (t.ejes ?? []).map((x) => x.ejeId).filter((id) => !previos.has(id));
    if (!nuevos.length || !idsGenero.size) continue;
    const r = resolverVetosDeGeneroNuevo(t.ejes, nuevos, idsGenero);
    if (r.quitados.length || r.anulados.length) {
      t.ejes = r.ejes;
      for (const ejeId of [...r.quitados, ...r.anulados]) vetados.push({ trackId: t.id, ejeId });
    }
  }

  // Una lista importada convertida en modo se muta en el lugar: también hay que guardarla.
  const ejesCambiados = ejesActuales.ejes.filter((e) => ejesAntes.get(e.id) !== JSON.stringify(e));
  const cambiados = biblioteca.tracks.filter((t) => antes.get(t.id) !== JSON.stringify(t.ejes));
  if (ejesCambiados.length || cambiados.length) {
    // Primero el aviso al PC: si la app se cierra a medias, la reanudación vuelve a
    // calcular y el reenvío es idempotente allí (fusión por nombre). Al revés, las
    // canciones quedarían clasificadas aquí y el PC no se enteraría nunca.
    await anotarCambio(almacen, 'confirmar-modos', { modosConfirmados, transversalesActivados: [] });
    // Lo que R2 retiró (el estado vetado o el género que chocaba con uno puesto a mano) también debe llegar al PC.
    for (const v of vetados) await anotarCambio(almacen, 'quitar-modo', v);
  }
  if (ejesCambiados.length) await almacen.guardarVarios('ejes', ejesCambiados);
  if (cambiados.length) await almacen.guardarVarios('biblioteca', cambiados);
  const colocadas = cambiados.filter((t) => sinModoAntes.has(t.id) && !necesitaGenero(t, estados)).length;
  return { modosNuevos: nuevosEjes.map((e) => ({ id: e.id, nombre: e.nombre })), colocadas };
}
