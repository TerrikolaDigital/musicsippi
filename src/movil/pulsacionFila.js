// src/movil/pulsacionLarga.js
// Pulsación larga sobre una fila de canción: si el dedo sigue quieto `retardo` ms
// (se mueve como mucho `tolerancia` px) dispara `alDisparar` con una vibración corta.
// Cualquier desplazamiento la cancela, así que un scroll vertical no abre el menú.
// Sin DOM: el reloj y la vibración se inyectan para poder probarlo en node.
export function crearPulsacionLarga({
  alDisparar,
  retardo = 500,
  tolerancia = 10,
  programar = setTimeout,
  cancelar = clearTimeout,
  vibrar = () => navigator.vibrate?.(15),
}) {
  let timer = null;
  let origen = null;
  let disparada = false;

  const parar = () => {
    if (timer != null) cancelar(timer);
    timer = null;
    origen = null;
  };

  return {
    /** Al bajar el dedo: arranca el reloj y olvida una pulsación larga anterior. */
    inicio(x, y) {
      parar();
      disparada = false;
      origen = { x, y };
      timer = programar(() => {
        timer = null;
        origen = null;
        disparada = true;
        vibrar();
        alDisparar();
      }, retardo);
    },
    /** Al mover el dedo: si se aleja demasiado, ya no es una pulsación larga. */
    mover(x, y) {
      if (origen && Math.hypot(x - origen.x, y - origen.y) > tolerancia) parar();
    },
    /** Al levantar el dedo, cancelar o salir de la fila. */
    fin: parar,
    /** ¿Se disparó la pulsación larga en este toque? Sirve para no tratarlo también como toque normal. */
    fueDisparada() {
      return disparada;
    },
  };
}
