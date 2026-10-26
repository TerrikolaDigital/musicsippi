/**
 * Enriquecimiento contra la API de Genius (api.genius.com) — busca cada track
 * y guarda el id/URL de su página en Genius, para uso futuro (no se muestra
 * en la UI todavía). No devuelve letra: la API de Genius solo da metadata y
 * anotaciones, la letra en sí requeriría scrapear la página, algo que la API
 * no ofrece oficialmente.
 *
 * Requiere un Client Access Token generado en https://genius.com/api-clients
 * (no hace falta el flujo OAuth completo para búsqueda de solo lectura).
 *
 * Es incremental: lo ya consultado queda en data/metadata-genius.json y no se
 * vuelve a pedir. Se puede cortar con Ctrl+C y retomar sin perder trabajo.
 *
 * Mismo criterio que enriquecer-musicbrainz-core.mjs: sin distinguir "no
 * encontrado" real de "no se pudo ni preguntar" se corre el riesgo de cachear
 * un fallo de red como si fuera un track sin ficha en Genius para siempre —
 * por eso `ConsultaAgotada` en vez de devolver null tras agotar reintentos.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Genius no publica un límite estricto por segundo como MusicBrainz, pero la
// práctica común para evitar 429 es no ráfaguear: 400ms entre pedidos alcanza
// para un enriquecimiento incremental sin apurar nada.
const ESPERA_MS = 400;
const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

/** Se lanza cuando se agotaron los reintentos sin conseguir una respuesta válida. */
class ConsultaAgotada extends Error {}

async function pedir(url, token, intento = 0) {
  let r;
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    if (intento >= 5) throw new ConsultaAgotada(`fallo de red: ${e.message}`);
    await esperar(2000 * (intento + 1));
    return pedir(url, token, intento + 1);
  }

  if (r.status === 429) {
    if (intento >= 5) throw new ConsultaAgotada('límite de tasa persistente');
    await esperar(2000 * (intento + 1));
    return pedir(url, token, intento + 1);
  }
  if (!r.ok) {
    if (intento < 3) {
      await esperar(1000 * (intento + 1));
      return pedir(url, token, intento + 1);
    }
    throw new ConsultaAgotada(`HTTP ${r.status} persistente`);
  }
  return r.json();
}

function normalizar(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Genius es un buscador de texto completo, no un índice preciso como
 * MusicBrainz — no hace falta la limpieza agresiva de sufijos de edición que
 * usa enriquecer-musicbrainz-core.mjs. Igual se valida el artista del primer
 * resultado contra el de la biblioteca antes de aceptarlo, para no guardar
 * un match falso solo porque Genius devolvió *algo*.
 */
function elegirHit(hits, artistaBuscado) {
  const objetivo = normalizar(artistaBuscado);
  const conArtistaValido = hits.find((h) => normalizar(h.result?.primary_artist?.name).includes(objetivo) || objetivo.includes(normalizar(h.result?.primary_artist?.name)));
  return conArtistaValido?.result ?? null;
}

/**
 * Consulta Genius para los tracks de `dataDir/biblioteca.json` que todavía no
 * están en `data/metadata-genius.json`. Persiste ahí, incremental.
 *
 * `token`: GENIUS_ACCESS_TOKEN. Si faltara y hubiera tracks pendientes, no
 * hace ninguna petición y devuelve `{ omitido: true, motivo: 'falta_token' }`
 * — nunca lanza, para no tirar abajo el enriquecimiento automático completo
 * por una variable de entorno sin configurar (mismo criterio que MusicBrainz).
 */
export async function enriquecerGenius(dataDir, { token, onProgreso, limite = Infinity } = {}) {
  const metaPath = join(dataDir, 'metadata-genius.json');
  const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
  const meta = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, 'utf8'))
    : { version: 1, tracks: {} };

  const pendientes = biblioteca.tracks.filter((t) => !meta.tracks[t.id]);
  const tanda = pendientes.slice(0, limite);

  if (tanda.length > 0 && !token) {
    return { omitido: true, motivo: 'falta_token' };
  }

  function guardar() {
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  let encontrados = 0;
  let sinResultado = 0;
  let saltados = 0;

  for (const [i, track] of tanda.entries()) {
    const q = `${track.artista} ${track.titulo}`.trim();
    const url = 'https://api.genius.com/search?q=' + encodeURIComponent(q);

    let j;
    try {
      j = await pedir(url, token);
    } catch (e) {
      if (!(e instanceof ConsultaAgotada)) throw e;
      saltados++;
      onProgreso?.(i + 1, tanda.length);
      await esperar(ESPERA_MS);
      continue;
    }

    const hits = j?.response?.hits ?? [];
    const resultado = elegirHit(hits, track.artista);

    if (resultado) {
      meta.tracks[track.id] = {
        geniusId: resultado.id,
        url: resultado.url,
      };
      encontrados++;
    } else {
      meta.tracks[track.id] = { geniusId: null, url: null };
      sinResultado++;
    }

    if ((i + 1) % 20 === 0 || i === tanda.length - 1) guardar();
    onProgreso?.(i + 1, tanda.length);
    await esperar(ESPERA_MS);
  }

  guardar();
  return { total: tanda.length, encontrados, sinResultado, saltados };
}
