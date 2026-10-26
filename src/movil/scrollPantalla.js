// src/movil/scrollPantalla.js
// Regla de desplazamiento al cambiar de pantalla: toda pantalla nueva empieza arriba;
// al VOLVER atrás (misma pestaña, pila más corta) se recupera donde se dejó.
// Sin React ni DOM: ShellMovil lee/escribe el scroll real.

/** ¿Es una vuelta atrás? Misma pestaña y menos pantallas apiladas que antes. */
export function esVuelta(anterior, actual) {
  return !!anterior && anterior.pestana === actual.pestana && actual.profundidad < anterior.profundidad;
}

export function crearMemoriaScroll() {
  const guardadas = new Map();
  return {
    /** Al dejar una pantalla: recuerda en qué punto estaba. */
    salir(clave, y) {
      guardadas.set(clave, y);
    },
    /** Al entrar en una pantalla: dónde debe quedar el scroll. */
    entrar(clave, vuelta) {
      return vuelta ? (guardadas.get(clave) ?? 0) : 0;
    },
    olvidar(clave) {
      guardadas.delete(clave);
    },
  };
}
