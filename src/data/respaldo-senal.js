// Música guardada de respaldo para cuando falla la señal (metro, túnel). La reproduce el servicio
// nativo con el WebView dormido; aquí solo se elige cuál y en qué orden.
// Ver docs/superpowers/specs/2026-10-27-senal-intermitente-design.md (D2).

export const MAX_RESPALDO = 30;
export const AVISO_SENAL = 'Sin señal: sonando música guardada';

/** Texto de la franja mientras dura el modo sin señal. */
export const textoFranjaSenal = ({ esperando } = {}) =>
  esperando ? 'Sin señal: la música sigue al volver la señal' : AVISO_SENAL;

function barajar(lista, azar) {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i -= 1) {
    const j = Math.floor(azar() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * Guardadas en orden de preferencia: del mood que suena; luego las que comparten mood con la cola
 * (álbum, lista, artista); luego cualquier guardada (mejor otro mood que silencio). Cada nivel
 * barajado, con lo escuchado hace poco al final. `recientes` = trackIds, el más reciente primero.
 */
export function calcularRespaldo({ tracks, cola, ejeId, guardados, videoIdDe, recientes = [], azar = Math.random, max = MAX_RESPALDO }) {
  const vistos = new Set();
  const candidatos = [];
  for (const t of tracks ?? []) {
    const v = videoIdDe(t);
    if (!v || !guardados?.has(v) || vistos.has(v)) continue;
    vistos.add(v);
    candidatos.push(t);
  }
  if (candidatos.length === 0) return [];
  const ejesDe = (t) => (t.ejes ?? []).map((a) => a.ejeId).filter((e) => e && e !== 'sin-clasificar');
  const ejesCola = new Set((cola ?? []).flatMap(ejesDe));
  const niveles = [[], [], []];
  for (const t of candidatos) {
    const ejes = ejesDe(t);
    if (ejeId && ejes.includes(ejeId)) niveles[0].push(t);
    else if (ejes.some((e) => ejesCola.has(e))) niveles[1].push(t);
    else niveles[2].push(t);
  }
  const reciente = new Set(recientes);
  return niveles
    .flatMap((nivel) => {
      const b = barajar(nivel, azar);
      return [...b.filter((t) => !reciente.has(t.id)), ...b.filter((t) => reciente.has(t.id))];
    })
    .slice(0, max);
}
