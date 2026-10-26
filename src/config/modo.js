// src/config/modo.js
// Distingue el build de escritorio/dev (servidor propio en localhost) del
// build móvil standalone (sin servidor, todo en IndexedDB) — se fija en
// build-time con VITE_MODO_LOCAL (.env.movil), no en runtime: nunca hay un
// servidor al que preguntarle "¿existís?" en el build móvil real.
export const MODO_LOCAL = import.meta.env.VITE_MODO_LOCAL === 'true';
