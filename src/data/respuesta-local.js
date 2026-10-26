// Los mutadores locales (biblioteca-local.js) devuelven el resultado ya
// resuelto, pero App.jsx se escribió contra fetch y hace `r.ok` / `r.json()`.
// Esta envoltura da a ese resultado la forma mínima de una Response para que el
// mismo código sirva en escritorio y en la app (antes `r.json` no existía y el
// guardado de modos acababa en un alert de error aunque se hubiera guardado).
export function comoRespuesta(valor) {
  const cuerpo = valor ?? {};
  return { ok: true, status: 200, json: async () => cuerpo };
}

/** Envuelve una función async que devuelve datos para que devuelva una «Response». */
export function envolverMutador(fn) {
  return async (...args) => comoRespuesta(await fn(...args));
}
