import { writeFileSync, renameSync } from 'node:fs';

/**
 * Escritura atómica: se escribe a un temporal y se renombra.
 *
 * `writeFileSync` trunca y después escribe: si el proceso muere en el medio (corte,
 * kill, disco lleno, antivirus con el handle tomado) el archivo queda a la mitad y
 * deja de ser JSON válido. Como `App.jsx` importa estos archivos estáticamente, eso
 * no rompe un endpoint: rompe el arranque de la app entera. Y no hay repositorio
 * git del que recuperar las asignaciones manuales.
 *
 * `rename` dentro del mismo volumen es atómico: o está el archivo viejo o el nuevo.
 *
 * Movido acá desde vite.config.js (donde vivía como función local) para que
 * también lo use el enriquecimiento automático en background
 * (scripts/lib/enriquecimiento-automatico.mjs), que persiste ejes.json y
 * biblioteca.json fuera de un request HTTP.
 */
export function escribirAtomico(path, datos) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(datos, null, 2), 'utf8');
  renameSync(tmp, path);
}
