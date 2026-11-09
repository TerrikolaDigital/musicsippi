// src/movil/repetirUna.js
// «Repetir esta canción» solo vale para la canción que suena al activarlo. Si el
// usuario pasa a otra (siguiente, anterior, tocar otra, gesto, pantalla de bloqueo),
// se desactiva solo. Al acabar de forma natural la misma canción se repite, así que
// ahí el id no cambia y esta regla no interviene.

/**
 * ¿Hay que apagar «repetir» tras el cambio de canción actual?
 * `idAnterior` null = aún no sonaba nada (arranque o sesión restaurada): se conserva.
 */
export function repeticionSeCancela({ repetir, idAnterior, idNuevo }) {
  if (!repetir) return false;
  if (idAnterior == null) return false;
  return idAnterior !== (idNuevo ?? null);
}

/** «Aleatorio» y «Repetir» se excluyen: una sesión guardada con los dos conserva «Repetir». */
export const aleatorioRestaurado = (sesion) => !sesion?.repetir && (sesion?.aleatorio ?? true);

/** Cómo queda «Repetir» al fijar «Aleatorio»: encenderlo lo apaga, apagarlo no lo toca. */
export const repetirSegunAleatorio = (aleatorio, repetir) => repetir && !aleatorio;
