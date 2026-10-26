/**
 * Tercera pasada automática de clasificación (después de clasificar() y
 * propagarSugerenciasUnanimes): para lo que sigue en sin-clasificar y ya
 * tiene un video de YouTube resuelto, trae título+descripción+keywords+canal
 * vía InnerTube (gratis, sin cuota, pero cara: ~350ms por track porque usa
 * getInfo() en vez de la búsqueda que ya trae la pasada barata) y prueba
 * clasificarPorDescripcionYoutube() — ver el comentario largo en clasificar.mjs
 * sobre por qué el vocabulario es deliberadamente chico.
 *
 * Solo corre para tracks que, después de MusicBrainz (metadata-musicbrainz.json)
 * y de la pasada barata de YouTube (resolucion-youtube.json, ver
 * resolver-innertube.mjs), siguen sin ninguna evidencia de género — así el
 * costo caro es proporcional al residuo, no al tamaño de la biblioteca.
 *
 * Cachea las descripciones ya consultadas en disco (data/descripciones-youtube.json)
 * para que reimportar no vuelva a pedirle lo mismo a YouTube.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Innertube } from 'youtubei.js';
import { clasificarPorDescripcionYoutube } from './clasificar.mjs';
import { resolverDataDir } from './data-dir.mjs';

const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

/** ¿El artista del track ya tiene géneros conocidos por MusicBrainz? */
function tieneGeneroMusicBrainz(trackId, mbTracks, mbArtistas) {
  const artistaMbid = mbTracks[trackId]?.artistaMbid;
  const generos = artistaMbid ? mbArtistas[artistaMbid]?.generos : null;
  return Boolean(generos?.length);
}

/**
 * ¿La pasada barata (resolucion-youtube.json, Tarea 6) ya trae señal de
 * género suficiente? Reusa el mismo vocabulario/función que clasifica la
 * pasada cara (clasificarPorDescripcionYoutube) sobre título+canal+descripción
 * de la búsqueda — si eso ya alcanza para clasificar, no hace falta pagar el
 * getInfo() caro para este track.
 */
function tieneGeneroPorResolucionBarata(trackId, resolucionYoutube) {
  const r = resolucionYoutube[trackId];
  if (!r) return false;
  const texto = [r.titulo, r.canal, r.descripcion].filter(Boolean).join(' ').toLowerCase();
  return Boolean(clasificarPorDescripcionYoutube(texto));
}

export async function enriquecerPorDescripcionYoutube(
  tracks,
  cacheYoutube,
  descCachePath,
  {
    onProgreso,
    esperaMs = 250,
    limite = Infinity,
    mbTracks = {},
    mbArtistas = {},
    resolucionYoutube = {},
  } = {}
) {
  const descCache = existsSync(descCachePath) ? JSON.parse(readFileSync(descCachePath, 'utf8')) : {};

  const candidatos = tracks.filter(
    (t) =>
      t.ejes.some((a) => a.ejeId === 'sin-clasificar') &&
      cacheYoutube[t.id] &&
      descCache[t.id] === undefined &&
      !tieneGeneroMusicBrainz(t.id, mbTracks, mbArtistas) &&
      !tieneGeneroPorResolucionBarata(t.id, resolucionYoutube)
  );
  const pendientes = candidatos.slice(0, limite);

  if (pendientes.length > 0) {
    const yt = await Innertube.create({ generate_session_locally: true });
    for (const [i, t] of pendientes.entries()) {
      try {
        const info = await yt.getBasicInfo(cacheYoutube[t.id]);
        const b = info.basic_info ?? {};
        const canal = b.channel?.name ?? b.author ?? '';
        descCache[t.id] = [b.title, (b.keywords ?? []).join(' '), canal, b.category, b.short_description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
      } catch {
        descCache[t.id] = '';
      }
      onProgreso?.(i + 1, pendientes.length);
      if ((i + 1) % 25 === 0) writeFileSync(descCachePath, JSON.stringify(descCache), 'utf8');
      await esperar(esperaMs);
    }
    writeFileSync(descCachePath, JSON.stringify(descCache), 'utf8');
  }

  let aplicados = 0;
  for (const t of tracks) {
    if (!t.ejes.some((a) => a.ejeId === 'sin-clasificar')) continue;
    const ejeId = clasificarPorDescripcionYoutube(descCache[t.id]);
    if (!ejeId) continue;
    t.ejes = t.ejes.filter((a) => a.ejeId !== 'sin-clasificar');
    t.ejes.push({ ejeId, origen: 'auto', senal: 'descripcion-youtube', score: 0.8 });
    aplicados++;
  }

  return { aplicados, consultados: pendientes.length };
}

/**
 * CLI para probar esta pasada de forma aislada, sin correr todo `npm run
 * importar`:
 *
 *   node scripts/lib/enriquecer-descripcion-youtube.mjs --limite=10
 *
 * Carga los mismos archivos que importar.mjs le pasaría en producción
 * (biblioteca, cache de YouTube, MusicBrainz, resolución barata) y aplica el
 * resultado a biblioteca.json solo si hubo clasificaciones nuevas.
 */
async function ejecutarComoCLI() {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dataDir = resolverDataDir(raiz);

  const args = process.argv.slice(2);
  const limite = Number(args.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? Infinity);

  const leerJsonSiExiste = (ruta, porDefecto) =>
    existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : porDefecto;

  const bibliotecaPath = join(dataDir, 'biblioteca.json');
  const biblioteca = JSON.parse(readFileSync(bibliotecaPath, 'utf8'));
  const cacheYoutube = leerJsonSiExiste(join(dataDir, 'cache-youtube.json'), {});
  const mb = leerJsonSiExiste(join(dataDir, 'metadata-musicbrainz.json'), { tracks: {}, artistas: {} });
  const resolucionYoutube = leerJsonSiExiste(join(dataDir, 'resolucion-youtube.json'), {});

  const { aplicados, consultados } = await enriquecerPorDescripcionYoutube(
    biblioteca.tracks,
    cacheYoutube,
    join(dataDir, 'descripciones-youtube.json'),
    {
      limite,
      mbTracks: mb.tracks ?? {},
      mbArtistas: mb.artistas ?? {},
      resolucionYoutube,
      onProgreso(i, total) {
        console.log(`  ${i}/${total}`);
      },
    }
  );

  console.log(`\nConsultados a YouTube: ${consultados}`);
  console.log(`Clasificados: ${aplicados}`);
  if (aplicados > 0) {
    writeFileSync(bibliotecaPath, JSON.stringify(biblioteca, null, 2), 'utf8');
    console.log('biblioteca.json actualizado.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await ejecutarComoCLI();
}
