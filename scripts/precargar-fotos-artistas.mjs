// Precarga data/artistas-deezer.json para TODOS los artistas de la
// biblioteca, no solo los que se visitaron a mano — así "Por artistas" y
// Buscar > Artistas muestran la foto real (cuando existe) desde el
// principio, en vez de ir mejorando de a uno a medida que alguien entra a
// cada página. Pega contra el propio dev server (/api/artista), que ya
// tiene toda la lógica de búsqueda + desempate por fans + cache en disco —
// este script solo decide A QUIÉN pedirle, uno por uno, con una pausa chica
// entre cada uno para no golpear la API pública de Deezer de más.
//
//   node scripts/precargar-fotos-artistas.mjs
//   node scripts/precargar-fotos-artistas.mjs --limite=100

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:5173';

function separarArtistas(nombre, artistasSolos) {
  const partes = nombre
    .split(/\s*·\s*|\s*,\s*|\s+vs\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!artistasSolos) return partes;
  const resultado = [];
  for (const parte of partes) {
    const segmentos = parte
      .split(/\s*&\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segmentos.length > 1 && artistasSolos.has(segmentos[0].toLowerCase())) {
      resultado.push(...segmentos);
    } else {
      resultado.push(parte);
    }
  }
  return resultado;
}

const biblioteca = JSON.parse(readFileSync(join(raiz, 'data', 'biblioteca.json'), 'utf8'));

const artistasSolos = new Set();
for (const t of biblioteca.tracks) {
  if (!/\s*·\s*|\s*,\s*|\s+vs\s+/.test(t.artista)) artistasSolos.add(t.artista.trim().toLowerCase());
}

const porClave = new Map();
for (const t of biblioteca.tracks) {
  for (const nombre of separarArtistas(t.artista, artistasSolos)) {
    const clave = nombre.toLowerCase();
    if (!porClave.has(clave)) porClave.set(clave, nombre);
  }
}
const todos = [...porClave.values()];

const args = process.argv.slice(2);
const limite = Number(args.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? Infinity);

const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

console.log(`Artistas en biblioteca: ${todos.length}`);
console.log('Consultando /api/artista para cada uno (salta los que ya tienen foto confirmada)...\n');

let consultados = 0;
let conFoto = 0;
let sinFoto = 0;
let errores = 0;

async function yaTieneFoto() {
  try {
    const r = await fetch(`${BASE}/api/artistas-fotos`);
    const j = await r.json();
    return new Set(Object.keys(j.fotos ?? {}));
  } catch {
    return new Set();
  }
}

const yaConfirmados = await yaTieneFoto();
const pendientes = todos.filter((n) => !yaConfirmados.has(n.toLowerCase())).slice(0, limite);
console.log(`Ya con foto confirmada: ${yaConfirmados.size}`);
console.log(`Pendientes esta corrida: ${pendientes.length}\n`);

for (const [i, nombre] of pendientes.entries()) {
  try {
    const r = await fetch(`${BASE}/api/artista?nombre=${encodeURIComponent(nombre)}`);
    const j = await r.json().catch(() => ({}));
    if (j.encontrado && j.fotoUrl) conFoto++;
    else sinFoto++;
  } catch {
    errores++;
  }
  consultados++;
  if (consultados % 20 === 0 || consultados === pendientes.length) {
    console.log(`  ${consultados}/${pendientes.length}  (${conFoto} con foto, ${sinFoto} sin, ${errores} errores)`);
  }
  await esperar(200);
}

console.log('\n=== RESUMEN ===');
console.log(`Consultados   : ${consultados}`);
console.log(`Con foto      : ${conFoto}`);
console.log(`Sin foto      : ${sinFoto}`);
console.log(`Errores       : ${errores}`);
