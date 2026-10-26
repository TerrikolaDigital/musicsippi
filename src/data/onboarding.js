// src/data/onboarding.js
// Despacha a la implementación servidor o local según el build — ver
// src/config/modo.js. App.jsx sigue importando de acá sin cambios.
import { MODO_LOCAL } from '../config/modo.js';
import * as servidor from './onboarding-servidor.js';
import * as local from './onboarding-local.js';

const impl = MODO_LOCAL ? local : servidor;

export const obtenerOnboardingVisto = impl.obtenerOnboardingVisto;
export const marcarOnboardingVisto = impl.marcarOnboardingVisto;
