// Wrappers de /api/onboarding-visto — ver docs/superpowers/plans/2026-08-26-fase-0-capa-de-datos.md
export async function obtenerOnboardingVisto() {
  const r = await fetch('/api/onboarding-visto');
  const json = await r.json();
  return json.visto;
}

export function marcarOnboardingVisto() {
  return fetch('/api/onboarding-visto', { method: 'POST' });
}
