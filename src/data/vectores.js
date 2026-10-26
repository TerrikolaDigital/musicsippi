// Wrapper de /api/cercanos — ver docs/superpowers/plans/2026-09-05-modos-dinamicos.md
export async function obtenerCercanos(trackId, n = 20) {
  const r = await fetch(`/api/cercanos?trackId=${encodeURIComponent(trackId)}&n=${n}`);
  if (!r.ok) return { cercanos: [] };
  return r.json();
}
