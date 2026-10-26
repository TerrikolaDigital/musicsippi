/**
 * Precarga en background la FOTO de cada artista distinto de la biblioteca
 * que todavía no tiene una — separado del perfil completo que ya cachea
 * GET /api/artista en artistas-deezer.json (álbumes/top/similares, mucho más
 * pesado: 4 pedidos a Deezer por artista en vez de 2). Acá solo interesa la
 * miniatura para las tarjetas con avatar (Home, buscador), que hasta ahora
 * quedaban con iniciales hasta que alguien visitaba la página de ese artista
 * (ver GET /api/artistas-fotos en vite.config.js).
 *
 * Guarda en su propio archivo (data/fotos-artistas.json), NO en
 * artistas-deezer.json: escribir ahí una entrada sin albumes/canciones/
 * similares rompería el chequeo `!cache.artistas[artistaId]` de GET
 * /api/artista (asumiría "ya resuelto" y nunca completaría el perfil real al
 * visitar la página). GET /api/artistas-fotos combina ambas fuentes, dándole
 * prioridad a artistas-deezer.json cuando un artista ya tiene perfil completo.
 *
 * Mismo criterio de desambiguación que GET /api/artista (ver el comentario
 * largo ahí): solo cuenta un resultado con nombre EXACTO, elegido por
 * nb_fan. Sin match exacto (nombres caseros que Deezer no tiene — "Lowfie",
 * "Chilled Pig") se cachea `null` a propósito para no reintentar cada ciclo
 * — mismo trato que sinResultado en enriquecer-deezer-core.mjs.
 *
 * separarArtistas: mismo split que App.jsx (·, coma, " vs ") para no
 * intentar buscar "Zedd · Troye Sivan" como un solo artista. Sin la rama de
 * "&" con desambiguación por artistasSolos — es una heurística pensada para
 * agrupar la biblioteca, no para decidir qué buscar en Deezer, y equivocarse
 * ahí como mucho deja una foto sin precargar (se completa igual al visitar
 * la página del artista).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { escribirAtomico } from './escribir-atomico.mjs';

const esperar = (ms) => new Promise((res) => setTimeout(res, ms));
const TAMANO_SILUETA_DEEZER = 32022;

function separarArtistas(nombre) {
  return nombre
    .split(/\s*·\s*|\s*,\s*|\s+vs\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fotoDeezerValida(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!r.ok) return url; // no se pudo verificar: se deja como está, no se descarta de más
    const buf = await r.arrayBuffer();
    return buf.byteLength === TAMANO_SILUETA_DEEZER ? null : url;
  } catch {
    return url;
  }
}

async function fetchDeezerJson(url, intentos = 3) {
  let ultimoError;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || (r.status !== 429 && r.status < 500)) return r.json();
      ultimoError = new Error(`HTTP ${r.status}`);
    } catch (e) {
      ultimoError = e;
    }
    if (i < intentos - 1) await esperar(300 * (i + 1));
  }
  throw ultimoError;
}

async function resolverFoto(nombre) {
  const claveNombre = nombre.toLowerCase();
  const q = encodeURIComponent(nombre);
  const j = await fetchDeezerJson(`https://api.deezer.com/search/artist?q=${q}&limit=10`);
  const candidatos = (j.data ?? []).filter((a) => a.name.toLowerCase() === claveNombre);
  const mejor = candidatos.sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0];
  if (!mejor) return null;
  const detalle = await fetchDeezerJson(`https://api.deezer.com/artist/${mejor.id}`);
  if (detalle.error) return null;
  return fotoDeezerValida(detalle.picture_xl ?? detalle.picture_big ?? null);
}

/**
 * `onProgreso(procesados, total)` se llama después de cada artista. `limite`
 * (default: todos los pendientes) sirve para pruebas o corridas acotadas.
 * Un fallo de red en un artista NO se cachea: queda pendiente para la
 * próxima corrida en vez de marcarse "sin foto" para siempre por una falla
 * pasajera — mismo criterio que enriquecerDeezer con los tracks.
 *
 * Devuelve `{ total, encontrados, sinResultado }`.
 */
export async function enriquecerFotosArtistas(dataDir, { onProgreso, limite = Infinity } = {}) {
  const cachePath = join(dataDir, 'fotos-artistas.json');
  const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { fotos: {} };

  const nombresDistintos = new Set();
  for (const t of biblioteca.tracks) {
    for (const nombre of separarArtistas(t.artista)) nombresDistintos.add(nombre);
  }
  const pendientes = [...nombresDistintos].filter((n) => !Object.hasOwn(cache.fotos, n.toLowerCase()));
  const tanda = pendientes.slice(0, limite);

  let encontrados = 0;
  let sinResultado = 0;

  for (const [i, nombre] of tanda.entries()) {
    try {
      const foto = await resolverFoto(nombre);
      cache.fotos[nombre.toLowerCase()] = foto;
      if (foto) encontrados++;
      else sinResultado++;
    } catch {
      onProgreso?.(i + 1, tanda.length);
      await esperar(150);
      continue;
    }
    if ((i + 1) % 25 === 0 || i + 1 === tanda.length) escribirAtomico(cachePath, cache);
    onProgreso?.(i + 1, tanda.length);
    await esperar(150);
  }

  escribirAtomico(cachePath, cache);
  return { total: tanda.length, encontrados, sinResultado };
}
