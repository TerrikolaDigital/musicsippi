// src/movil/insertarCola.js
// «Reproducir a continuación» y «Añadir a la cola» con una o varias pistas (álbum, artista, mood).
// Puro: recibe la cola y el índice actuales y devuelve los nuevos, así toda la lista entra de
// una vez (llamar a un setter por pista con el estado de la render leía siempre la misma cola).

/** Cola vacía (nada sonando): la lista entra entera y empieza por la primera. */
function arranque(pistas) {
  return { cola: [...pistas], indice: 0 };
}

/** Inserta TODAS las pistas justo después de la actual, en su orden. Sin cola, empieza a sonar la lista. */
export function insertarDespues(cola, indice, pistas) {
  const nuevas = pistas ?? [];
  if (nuevas.length === 0) return { cola, indice };
  if (!cola?.length) return arranque(nuevas);
  const pos = Math.min(Math.max(indice, -1) + 1, cola.length);
  return { cola: [...cola.slice(0, pos), ...nuevas, ...cola.slice(pos)], indice };
}

/** Añade TODAS las pistas al final conservando el orden. Sin cola, empieza a sonar la lista. */
export function agregarAlFinal(cola, indice, pistas) {
  const nuevas = pistas ?? [];
  if (nuevas.length === 0) return { cola, indice };
  if (!cola?.length) return arranque(nuevas);
  return { cola: [...cola, ...nuevas], indice };
}
