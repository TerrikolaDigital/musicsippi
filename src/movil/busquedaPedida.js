// src/movil/busquedaPedida.js
// Pedir a Buscar que se abra con el filtro «En tu biblioteca» (p. ej. la lupa de
// Biblioteca). Igual que biblioteca.js con sus pestañas: la pestaña Buscar la
// consume al montarse, así que la petición vale una sola vez.
let pedida = null;

export function pedirBusquedaEnBiblioteca() {
  pedida = { filtro: 'biblioteca' };
}

/** Devuelve la petición pendiente (y la borra) o null. */
export function tomarBusquedaPedida() {
  const p = pedida;
  pedida = null;
  return p;
}

/** Va a Buscar con el filtro puesto; el campo recibe el foco al montarse. */
export function irABuscarEnBiblioteca(nav) {
  pedirBusquedaEnBiblioteca();
  nav.irAPestana('buscar');
}
