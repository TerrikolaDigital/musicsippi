// src/data/onboarding-local.js
// Implementación local usando IndexedDB — reemplaza los wrappers de /api/onboarding-visto
import { obtenerValorConfig, guardarValorConfig } from './lib/db.js';

export async function obtenerOnboardingVisto() {
  return obtenerValorConfig('onboardingVisto', false);
}

export function marcarOnboardingVisto() {
  return guardarValorConfig('onboardingVisto', true);
}
