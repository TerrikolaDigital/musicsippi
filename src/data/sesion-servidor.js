// Wrappers de /api/* para historial y últimos modos de la sesión — ver docs/superpowers/plans/2026-08-26-fase-0-capa-de-datos.md
export function migrarHistorial(entradas) {
  return fetch('/api/historial/migrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entradas }),
  });
}

export function migrarUltimosModos(ids) {
  return fetch('/api/ultimos-modos/migrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export function registrarReproduccion(entrada) {
  return fetch('/api/historial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entrada),
  });
}

export async function obtenerHistorial() {
  const r = await fetch('/api/historial');
  return r.json();
}

export async function obtenerUltimosModos() {
  const r = await fetch('/api/ultimos-modos');
  return r.json();
}

export function guardarUltimoModoUsado(ejeId) {
  return fetch('/api/ultimos-modos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ejeId }),
  });
}
