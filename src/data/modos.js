// Wrapper de /api/descubrir-modos y /api/confirmar-modos — ver
// docs/superpowers/plans/2026-09-05-modos-dinamicos.md (Tarea 16)
//
// `trackIds` (Tarea 18, detección incremental): opcional. Si se pasa, el
// servidor clusteriza SOLO esos tracks (p. ej. los nuevos sin modo detectados
// por `npm run importar`) en vez de la biblioteca entera, aunque la masa
// mínima se sigue midiendo contra el total real de la biblioteca del lado
// del servidor.
export async function descubrirModos(trackIds) {
  const r = await fetch('/api/descubrir-modos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackIds: trackIds ?? [] }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
  return json;
}

// Wrapper de /api/aviso-modos-nuevos (Tarea 18): GET para leer el aviso que
// dejó `npm run importar` si detectó demasiada música sin modo; POST para
// limpiarlo (al aceptar la revisión o al descartar el banner sin más — en
// ningún caso hay que insistir con el mismo aviso en la próxima carga).
export async function obtenerAvisoModosNuevos() {
  const r = await fetch('/api/aviso-modos-nuevos');
  return r.json().catch(() => null);
}

export async function limpiarAvisoModosNuevos() {
  await fetch('/api/aviso-modos-nuevos', { method: 'POST' }).catch(() => {});
}

export async function confirmarModos(payload) {
  const r = await fetch('/api/confirmar-modos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error ?? `HTTP ${r.status}`);
  // ejes.json/biblioteca.json se importan estáticos en App.jsx y cambiaron
  // por fuera del setState normal de React — mismo patrón que Backup(),
  // src/App.jsx (restaurarBackup, ~línea 6399): no hay forma de que el
  // estado ya cargado en memoria refleje el archivo nuevo sin recargar.
  window.location.reload();
  return datos;
}
