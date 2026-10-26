// src/movil/verTodo.js
// A dónde lleva el «Ver todo» de cada sección de Inicio.
import { pedirPestanaBiblioteca } from './biblioteca.js';

const DESTINOS = {
  seguidos: { tipo: 'pestana', pestana: 'modos' },
  artistas: { tipo: 'pestana', pestana: 'biblioteca', biblioteca: 'artistas' },
  recientes: { tipo: 'pantalla', pantalla: { tipo: 'historial' } },
  favoritas: { tipo: 'pestana', pestana: 'biblioteca', biblioteca: 'canciones', favoritas: true },
};

export function destinoVerTodo(seccion) {
  return DESTINOS[seccion] ?? null;
}

/** Navega al destino de la sección con el `nav` de useNavegacionMovil. */
export function irVerTodo(nav, seccion) {
  const d = destinoVerTodo(seccion);
  if (!d) return;
  if (d.tipo === 'pantalla') return nav.abrir(d.pantalla);
  if (d.biblioteca) pedirPestanaBiblioteca(d.biblioteca, { favoritas: !!d.favoritas });
  nav.irAPestana(d.pestana, { raiz: true });
}
