// Wrapper de /api/fuentes/* — ver docs/superpowers/plans/2026-09-05-modos-dinamicos.md (Tarea 11)
export async function actualizarFuentes() {
  const r = await fetch('/api/fuentes/actualizar', { method: 'POST' });
  return r.json();
}

export async function cargarFuentesManual(objetoFuentes) {
  const r = await fetch('/api/fuentes/cargar-manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(objetoFuentes),
  });
  return r.json();
}
