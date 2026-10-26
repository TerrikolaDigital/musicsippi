/**
 * Núcleo de enriquecimiento Deezer, extraído de scripts/enriquecer-deezer.mjs
 * para que tanto el script de terminal como el enriquecimiento automático en
 * background (scripts/lib/enriquecimiento-automatico.mjs) llamen la misma
 * lógica. Ver ese script para el detalle de cada decisión (placeholder de
 * foto, merge sin reemplazo, etc.) — acá se conserva el comportamiento
 * intacto, solo se movió el cuerpo a una función reusable.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

// Deezer devuelve una URL de foto incluso para artistas sin foto real: esa
// URL redirige (302) a un path que contiene el MD5 del string vacío
// ("d41d8cd98f00b204e9800998ecf8427e"), el id que usan para el placeholder
// gris genérico — el JSON de /search no lo distingue de ninguna otra forma.
const PLACEHOLDER_DEEZER = 'd41d8cd98f00b204e9800998ecf8427e';

async function esFotoPlaceholder(url, cachePlaceholder) {
  if (!url) return false;
  if (cachePlaceholder.has(url)) return cachePlaceholder.get(url);
  let esPlaceholder = false;
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    if (r.status >= 300 && r.status < 400) {
      esPlaceholder = (r.headers.get('location') || '').includes(PLACEHOLDER_DEEZER);
    }
  } catch {
    esPlaceholder = false;
  }
  cachePlaceholder.set(url, esPlaceholder);
  return esPlaceholder;
}

async function buscar(track, intento = 0) {
  const q = encodeURIComponent(`${track.artista} ${track.titulo}`);
  const r = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`);
  if (r.status === 429) {
    const espera = 3 + intento * 2;
    await esperar(espera * 1000);
    return intento < 3 ? buscar(track, intento + 1) : null;
  }
  if (!r.ok) return null;
  const j = await r.json();
  return j.data?.[0] ?? null;
}

/**
 * Consulta Deezer para los tracks de `dataDir/biblioteca.json` que todavía no
 * tienen `coverUrl` en `data/metadata-deezer.json`, y persiste el resultado
 * ahí (merge, no reemplazo: un track puede ya traer album/año/duración
 * escritos por /api/artista, pisar el objeto entero los borraría).
 *
 * `onProgreso(procesados, total)` se llama después de cada track. `limite`
 * (default: todos los pendientes) sirve para pruebas o corridas acotadas.
 * Un fallo de red en un track (fetch que rechaza, no solo un status no-ok)
 * NO se cachea: el track queda pendiente para la próxima corrida en vez de
 * marcarse "sin resultado" para siempre por una falla pasajera — corre sin
 * supervisión en background, a diferencia del script de terminal donde
 * el usuario podía simplemente volver a correrlo a mano.
 *
 * Devuelve `{ total, encontrados, sinResultado }`.
 */
export async function enriquecerDeezer(dataDir, { onProgreso, limite = Infinity } = {}) {
  const metaPath = join(dataDir, 'metadata-deezer.json');
  const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : { version: 1, tracks: {} };

  const pendientes = biblioteca.tracks.filter(
    (t) => !Object.hasOwn(meta.tracks, t.id) || !Object.hasOwn(meta.tracks[t.id], 'coverUrl')
  );
  const tanda = pendientes.slice(0, limite);

  const cachePlaceholder = new Map();
  let encontrados = 0;
  let sinResultado = 0;

  function guardar() {
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  for (const [i, track] of tanda.entries()) {
    let item;
    try {
      item = await buscar(track);
    } catch {
      onProgreso?.(i + 1, tanda.length);
      await esperar(150);
      continue;
    }

    const previo = meta.tracks[track.id] ?? {};
    if (item) {
      const fotoCruda = item.artist?.picture_big ?? item.artist?.picture_medium ?? null;
      meta.tracks[track.id] = {
        ...previo,
        coverUrl: item.album?.cover_big ?? item.album?.cover_medium ?? null,
        fotoArtista: (await esFotoPlaceholder(fotoCruda, cachePlaceholder)) ? null : fotoCruda,
      };
      encontrados++;
    } else {
      meta.tracks[track.id] = { ...previo, coverUrl: null, fotoArtista: previo.fotoArtista ?? null };
      sinResultado++;
    }

    if ((i + 1) % 25 === 0 || i + 1 === tanda.length) guardar();
    onProgreso?.(i + 1, tanda.length);
    await esperar(150);
  }

  guardar();
  return { total: tanda.length, encontrados, sinResultado };
}
