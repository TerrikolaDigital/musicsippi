/**
 * Completa carátulas que la búsqueda normal de Deezer no encontró (canciones marcadas «sin resultado»), con una
 * búsqueda más flexible pero una aceptación ESTRICTA (ver lib/portadas-deezer-estricto.mjs).
 *
 *   node scripts/completar-portadas-deezer-estricto.mjs                 → SIMULA: no escribe en los datos; deja el informe
 *   node scripts/completar-portadas-deezer-estricto.mjs --informe=ruta  → dónde dejar el informe (JSON)
 *   node scripts/completar-portadas-deezer-estricto.mjs --aplicar       → aplica a metadata-deezer.json (con copia antes)
 *   --limite=N para probar con N canciones.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { esCoincidencia, limpiarTitulo, artistasDe } from './lib/portadas-deezer-estricto.mjs';

const { dataDir } = resolverRaizYDataDir(import.meta.url);
const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const limite = Number(args.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? Infinity);
const informePath = args.find((a) => a.startsWith('--informe='))?.split('=')[1] ?? 'informe-portadas-deezer-estricto.json';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const metaPath = join(dataDir, 'metadata-deezer.json');
const biblioteca = JSON.parse(readFileSync(join(dataDir, 'biblioteca.json'), 'utf8'));
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const pendientes = biblioteca.tracks.filter((t) => !meta.tracks[t.trackIdReal ?? t.id]?.coverUrl && !t.coverUrl).slice(0, limite);

async function buscar(q, intento = 0) {
  const r = await fetch(`https://api.deezer.com/search?limit=5&q=${encodeURIComponent(q)}`);
  if (r.status === 429) {
    await esperar((3 + intento * 2) * 1000);
    return intento < 3 ? buscar(q, intento + 1) : [];
  }
  if (!r.ok) return [];
  return (await r.json()).data ?? [];
}

console.log(`${aplicar ? 'APLICANDO' : 'SIMULANDO'} sobre ${pendientes.length} canciones sin carátula (${dataDir})`);
const aceptadas = [];
let sin = 0;
for (const [i, t] of pendientes.entries()) {
  const art = artistasDe(t.artista)[0] ?? t.artista;
  let hallado = null;
  for (const q of [`${art} ${limpiarTitulo(t.titulo)}`, `artist:"${art}" track:"${limpiarTitulo(t.titulo)}"`]) {
    try {
      const res = await buscar(q);
      const candidatos = res.filter((it) => esCoincidencia(t, it) && (it.album?.cover_big || it.album?.cover_medium));
      for (const it of candidatos) {
        const u = it.album.cover_big ?? it.album.cover_medium;
        const h = await fetch(u, { method: 'HEAD', redirect: 'manual' }).catch(() => null);
        if (!(h && h.status >= 300 && h.status < 400 && (h.headers.get('location') || '').includes('d41d8cd98f00b204e9800998ecf8427e'))) {
          hallado = it; // la primera carátula real (no la gris genérica)
          break;
        }
      }
    } catch {
      // se intenta con la siguiente consulta
    }
    await esperar(150);
    if (hallado) break;
  }
  if (hallado) {
    aceptadas.push({
      id: t.id,
      trackIdReal: t.trackIdReal ?? null,
      cancion: `${t.artista} — ${t.titulo}`,
      deezer: `${hallado.artist.name} — ${hallado.title}`,
      album: hallado.album.title,
      coverUrl: hallado.album.cover_big ?? hallado.album.cover_medium,
    });
  } else {
    sin++;
  }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${pendientes.length} · aceptadas ${aceptadas.length}`);
}

writeFileSync(informePath, JSON.stringify({ revisadas: pendientes.length, aceptadas: aceptadas.length, sinCoincidenciaFiable: sin, lista: aceptadas }, null, 2), 'utf8');
console.log(`\nAceptadas con coincidencia fiable: ${aceptadas.length} · sin coincidencia fiable: ${sin}`);
console.log(`Informe: ${informePath}`);

if (aplicar && aceptadas.length) {
  const copia = `${metaPath}.antes-estricto-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  copyFileSync(metaPath, copia);
  for (const a of aceptadas) {
    const id = a.trackIdReal ?? a.id;
    meta.tracks[id] = { ...(meta.tracks[id] ?? {}), coverUrl: a.coverUrl, fotoArtista: meta.tracks[id]?.fotoArtista ?? null };
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  console.log(`Aplicado. Copia previa: ${copia}`);
} else if (!aplicar) {
  console.log('Simulación: no se ha escrito nada en los datos.');
}
