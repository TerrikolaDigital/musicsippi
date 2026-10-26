// Deezer devuelve una URL de foto de artista incluso cuando NO tiene una
// foto real: esa URL redirige (302) a un path que contiene
// "d41d8cd98f00b204e9800998ecf8427e" (el MD5 del string vacío, usado como
// id de la imagen placeholder gris genérica). El JSON de /search no lo
// distingue de una foto real de ninguna otra forma — solo siguiendo el
// redirect se nota. Este script recorre las fotoArtista ya guardadas en
// cache, las resuelve con HEAD, y pone en null las que sean el placeholder.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PLACEHOLDER = 'd41d8cd98f00b204e9800998ecf8427e';
const rutaMeta = join(process.cwd(), 'data', 'metadata-deezer.json');
const meta = JSON.parse(readFileSync(rutaMeta, 'utf8'));

const urls = new Set();
for (const k in meta.tracks) {
  const u = meta.tracks[k].fotoArtista;
  if (u) urls.add(u);
}

async function esPlaceholder(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location') || '';
      return loc.includes(PLACEHOLDER);
    }
    return false;
  } catch {
    return false;
  }
}

const lista = [...urls];
const malas = new Set();
const CONCURRENCIA = 12;
let i = 0;
let procesados = 0;

async function trabajador() {
  while (i < lista.length) {
    const idx = i++;
    const url = lista[idx];
    if (await esPlaceholder(url)) malas.add(url);
    procesados++;
    if (procesados % 100 === 0 || procesados === lista.length) {
      console.log(`  ${procesados}/${lista.length}  (${malas.size} placeholder detectados hasta ahora)`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));

console.log(`\n${malas.size} de ${lista.length} fotoArtista son el placeholder gris genérico.`);

let limpiados = 0;
for (const k in meta.tracks) {
  if (meta.tracks[k].fotoArtista && malas.has(meta.tracks[k].fotoArtista)) {
    meta.tracks[k].fotoArtista = null;
    limpiados++;
  }
}

writeFileSync(rutaMeta, JSON.stringify(meta, null, 2));
console.log(`Limpiados ${limpiados} tracks en data/metadata-deezer.json.`);
