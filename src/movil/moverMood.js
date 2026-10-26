// src/movil/moverMood.js
// «Mover a otro mood…» del ⋯ de una canción. Puro: decide de qué moods se quita y a cuál se añade.
// Mover es poner el destino y quitar la canción de los moods ACTUALES DE LA MISMA FAMILIA que el destino
// (un género por otro género, un estado por otro estado), para que mover un género no te quite estados.
import { familiaDe } from './modos.js';

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Moods a los que se puede mover: los de gusto/funcional activos y no de sistema (aunque estén vacíos). */
export function destinosDeMover(ejes) {
  return (ejes ?? []).filter((e) => (e.tipo === 'gusto' || e.tipo === 'funcional') && !e.sistema && e.activo !== false);
}

/** {poner, quitar}: `quitar` son los ids de la misma familia que `destino` en los que ya está la canción. */
export function planMover(ejesDeLaCancion, destino, ejes) {
  const ids = new Set((ejesDeLaCancion ?? []).map((x) => x.ejeId));
  const fam = familiaDe(destino);
  const quitar = destinosDeMover(ejes)
    .filter((e) => e.id !== destino.id && ids.has(e.id) && familiaDe(e) === fam)
    .map((e) => e.id);
  return { poner: destino.id, quitar };
}

/** Filtra por texto (sin tildes ni mayúsculas) y ordena A–Z. */
export function buscarDestinos(ejes, texto) {
  const q = sinTildes(texto).trim();
  const colador = new Intl.Collator('es', { sensitivity: 'base' });
  return [...ejes]
    .filter((e) => !q || sinTildes(e.nombre).includes(q))
    .sort((a, b) => colador.compare(a.nombre ?? '', b.nombre ?? ''));
}

/** Pasos que deshacen un movimiento: volver a poner lo quitado y quitar lo puesto. */
export const deshacerMover = ({ poner, quitar }) => ({ poner: quitar, quitar: poner });

export const UMBRAL_BUSCADOR = 8; // a partir de aquí la lista lleva buscador
