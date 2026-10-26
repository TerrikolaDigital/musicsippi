// Wrappers de /api/* para administración — importar TuneMyMusic, restaurar backup — ver docs/superpowers/plans/2026-08-26-fase-0-capa-de-datos.md
export function importarTuneMyMusic(contenidoCsv) {
  return fetch('/api/importar-tunemymusic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contenido: contenidoCsv }),
  });
}

// Wrapper de POST /api/importar-local: `rutas` son las rutas absolutas de
// mp3 que el navegador ya juntó (file.path, ver CargarMusicaLocal en
// App.jsx) — nunca se manda contenido binario.
export function importarMusicaLocal(rutas) {
  return fetch('/api/importar-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rutas }),
  });
}

export function restaurarBackup(contenido) {
  return fetch('/api/restaurar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contenido),
  });
}

// Wrapper de /api/es-demo: true solo en el build de demo (ver vite.config.js).
export async function obtenerEsDemo() {
  const r = await fetch('/api/es-demo');
  const json = await r.json().catch(() => ({}));
  return !!json.esDemo;
}

// Wrapper de /api/reiniciar (Tarea 19, reinicio total): borra biblioteca,
// modos, historial, favoritos, overrides y vectores. La confirmación real
// pasa en el servidor (exige confirmacion === 'BORRAR' literal); acá solo se
// reenvía lo que ya validó la UI.
export async function reiniciarTodo({ borrarDescargado } = {}) {
  const r = await fetch('/api/reiniciar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmacion: 'BORRAR', borrarDescargado: !!borrarDescargado }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
  return json;
}
