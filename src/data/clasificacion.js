// Wrapper de /api/sugerencia-clasificacion — ver
// docs/superpowers/plans/2026-09-05-modos-dinamicos.md (Tarea 17).
// `asignarEje`/`quitarModo` (el resto del flujo de aprobar/elegir otro/saltar
// de ClasificacionAsistida) ya existen en src/data/biblioteca-servidor.js y
// se consumen desde src/App.jsx via asignarManual — no hace falta otro
// wrapper para eso.
export async function obtenerSugerenciasClasificacion(trackIds) {
  const r = await fetch('/api/sugerencia-clasificacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackIds: trackIds ?? [] }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
  return json.sugerencias ?? [];
}
