/**
 * Enriquecimiento de álbum/año/carátula usando las páginas `embed` públicas
 * de Spotify — SIN API, SIN credenciales, SIN login.
 *
 * Por qué existe esto y no usa `enriquecer-spotify.mjs` (que sí pega a la API
 * oficial): confirmado en esta sesión que Spotify ahora exige cuenta Premium
 * incluso para el flujo de solo-lectura (Client Credentials), así que ese
 * script quedó bloqueado (nunca llegó a generar metadata-spotify.json). Las
 * páginas `/embed/track/<id>` y `/embed/playlist/<id>` sí se sirven
 * pre-renderizadas del lado del servidor sin ninguna autenticación — ahí
 * viene un `<script id="__NEXT_DATA__">` con título, artistas, año de
 * lanzamiento y carátula.
 *
 * La limitación real: no hay buscador anónimo (probado, devuelve 403), así
 * que esto SOLO puede resolver tracks que estén en una playlist pública que
 * ya conozcamos el ID — no sirve para "buscar cualquier track". Por eso el
 * punto de entrada son las playlists del usuario, no la biblioteca entera.
 *
 *   node scripts/enriquecer-spotify-embed.mjs            # corre sobre las playlists de abajo
 *   node scripts/enriquecer-spotify-embed.mjs --informe   # solo mide el cruce, no pide nada
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';

const { dataDir } = resolverRaizYDataDir(import.meta.url);
const metaPath = join(dataDir, 'metadata-spotify.json');

const args = process.argv.slice(2);
const soloInforme = args.includes('--informe');

// Playlists del usuario compartidas para armar "Gym", "Chill", etc. — se
// reutilizan acá como fuente de metadata, no solo para crear las listas
// (eso sigue pendiente de la Fase 9, para no dejar tracks afuera).
const PLAYLISTS = [
  { nombre: 'Gym', id: '4vi9e7z8jSeP9zzE2snvG6' },
  { nombre: 'Chill', id: '6WL1haWHen3mfrokqyyrto' },
  { nombre: 'Inspiración', id: '6vYuGw1QQcmwF2T1bJSwQP' },
  { nombre: 'Dance', id: '4vtWrmNxlJSWiUTjfHTfJs' },
  { nombre: 'Rock', id: '6bFjjbWDzjhYbLWI0kjAhN' },
  { nombre: 'Rock en español', id: '4ZqrigoJWw1w0N3AUhY681' },
  { nombre: 'Melancolía', id: '0unNL1uBFX0zvLESIf6km1' },
  { nombre: 'Soundtracks', id: '4MX7hNzqT7S3Gd5Tk4XhOx' },
];

const ESPERA_MS = 700; // una request por vez, sin apurar al servidor de Spotify
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function entidadEmbed(tipo, id) {
  const r = await fetch(`https://open.spotify.com/embed/${tipo}/${id}`, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('sin __NEXT_DATA__ (¿cambió el HTML de Spotify?)');
  return JSON.parse(m[1]).props.pageProps.state.data.entity;
}

const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

// ---- normalización, igual criterio que fusionarDuplicadosCruzados/importar.mjs ----

const TRAZOS = { ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', æ: 'ae', œ: 'oe', ß: 'ss', ħ: 'h', ŧ: 't', ŋ: 'n', ı: 'i' };
function normalizar(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’`]/g, "'")
    .toLowerCase()
    .replace(/[øłđðþæœßħŧŋı]/g, (c) => TRAZOS[c])
    .trim();
}
function normTitulo(t) {
  return normalizar(
    t
      .replace(/\s*[([](feat\.|ft\.|with)\s[^)\]]*[)\]]/gi, '')
      .replace(/\s*-\s*(remaster(ed)?|radio edit|single version).*$/i, '')
      .trim()
  );
}
function primerArtista(a) {
  return normalizar(a.split(/\s*·\s*|\s*,\s*|\s+vs\s+|\s+&\s+/)[0].trim());
}

// ---- pipeline ----

const bib = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
const indice = new Map();
for (const t of bib.tracks) indice.set(`${normTitulo(t.titulo)}|||${primerArtista(t.artista)}`, t);

console.log('\nJuntando URIs de las playlists…\n');
const porUri = new Map(); // spotify:track:xxx -> { trackId, tituloBib, playlist }
for (const pl of PLAYLISTS) {
  let e;
  try {
    e = await entidadEmbed('playlist', pl.id);
  } catch (err) {
    console.log(`  ${pl.nombre.padEnd(18)} ERROR: ${err.message}`);
    continue;
  }
  let enBiblioteca = 0;
  for (const t of e.trackList ?? []) {
    const clave = `${normTitulo(t.title)}|||${primerArtista(t.subtitle ?? '')}`;
    const hit = indice.get(clave);
    if (!hit) continue;
    enBiblioteca++;
    if (!porUri.has(t.uri)) porUri.set(t.uri, { trackId: hit.id, tituloBib: hit.titulo });
  }
  console.log(`  ${e.name.padEnd(18)} ${e.trackList?.length ?? 0} tracks -> ${enBiblioteca} en tu biblioteca`);
  await esperar(ESPERA_MS);
}

console.log(`\nTracks únicos a resolver: ${porUri.size}`);

const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : { version: 1, tracks: {} };
const pendientes = [...porUri.entries()].filter(([, v]) => !meta.tracks[v.trackId]);
console.log(`Ya resueltos en corridas anteriores: ${porUri.size - pendientes.length}`);
console.log(`Pendientes esta corrida: ${pendientes.length}`);

if (soloInforme) {
  console.log('\n(--informe: no se pidió ningún track individual)');
  process.exit(0);
}

let encontrados = 0;
let sinDatos = 0;

for (const [i, [uri, info]] of pendientes.entries()) {
  const spotifyId = uri.split(':').pop();
  try {
    const t = await entidadEmbed('track', spotifyId);
    const anio = t.releaseDate?.isoString ? Number(t.releaseDate.isoString.slice(0, 4)) : null;
    const portada = t.visualIdentity?.image?.slice(-1)[0]?.url ?? null;
    meta.tracks[info.trackId] = {
      spotifyUri: uri,
      album: null, // el embed de track no trae nombre de álbum, solo año/portada
      anio,
      coverUrl: portada,
    };
    if (anio || portada) encontrados++;
    else sinDatos++;
  } catch (err) {
    meta.tracks[info.trackId] = { spotifyUri: uri, album: null, anio: null, coverUrl: null };
    sinDatos++;
  }

  if ((i + 1) % 20 === 0 || i === pendientes.length - 1) {
    console.log(`  ${i + 1}/${pendientes.length}  (${encontrados} con datos, ${sinDatos} sin)`);
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }
  await esperar(ESPERA_MS);
}

writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

console.log('\n=== RESUMEN ===\n');
const conAnio = Object.values(meta.tracks).filter((t) => t.anio).length;
const conPortada = Object.values(meta.tracks).filter((t) => t.coverUrl).length;
console.log(`Tracks con año     : ${conAnio}`);
console.log(`Tracks con portada : ${conPortada}`);
console.log(`\nGuardado en data/metadata-spotify.json`);
console.log('(GET /api/metadata ya lo combina con MusicBrainz — no hace falta tocar nada más).');
