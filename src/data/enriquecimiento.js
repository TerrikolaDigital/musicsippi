// Wrapper de GET /api/canal-enriquecimiento — progreso en vivo del
// enriquecimiento automático en background. Ver
// docs/superpowers/specs/2026-09-08-enriquecimiento-automatico-design.md
export function suscribirseACanalEnriquecimiento(onEstado) {
  const es = new EventSource('/api/canal-enriquecimiento');
  es.addEventListener('estado', (e) => onEstado(JSON.parse(e.data)));
  return () => es.close();
}
