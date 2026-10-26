/**
 * MEDICIÓN (no escribe biblioteca.json): para cada track en "sin-clasificar",
 * trae título+descripción del video de YouTube ya resuelto (vía InnerTube,
 * gratis, sin cuota) y busca un vocabulario curado de alta precisión —no todo
 * tagsLastfm: se midió en una muestra de 60 que tags genéricos ("house",
 * "dance", "trap", "club", "soul", "sad") están contaminados por hashtag-soup
 * de SEO que los canales tipo "Magic Records" pegan en TODOS sus videos sin
 * relación con el género real, y producen falsos positivos (p. ej. "Public
 * Enemy" -> melancolico por matchear "sad" en texto no relacionado).
 * Solo sobreviven frases compuestas/nicho que un canal no pondría si no
 * aplican de verdad.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Innertube } from 'youtubei.js';

const bib = JSON.parse(readFileSync('data/biblioteca.json', 'utf8'));
const cache = JSON.parse(readFileSync('data/cache-youtube.json', 'utf8'));

const cachePath = 'data/descripciones-youtube.json';
const descCache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

const VOCAB = {
  'phonk-gym': ['phonk', 'drift phonk', 'brazilian phonk', 'hard bass', 'hardbass'],
  worship: ['gospel', 'worship music', 'christian music'],
  'covers-piano': ['piano cover', 'lofi instrumental', 'lo-fi instrumental', 'piano version'],
  eurodance: ['eurodance', 'eurotrance'],
};

const sinClasificar = bib.tracks.filter((t) => t.ejes.some((e) => e.ejeId === 'sin-clasificar'));
console.log(`Sin clasificar: ${sinClasificar.length}\n`);

const yt = await Innertube.create({ generate_session_locally: true });
const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

const resultado = []; // { id, artista, titulo, ejeId, match }
let consultados = 0;
let sinVideoId = 0;

for (const [i, t] of sinClasificar.entries()) {
  const videoId = cache[t.id];
  if (!videoId) {
    sinVideoId++;
    continue;
  }

  let texto = descCache[t.id];
  if (texto === undefined) {
    try {
      const info = await yt.getBasicInfo(videoId);
      texto = `${info.basic_info.title ?? ''} ${info.basic_info.short_description ?? ''}`.toLowerCase();
      descCache[t.id] = texto;
      consultados++;
    } catch {
      texto = '';
      descCache[t.id] = '';
    }
    await esperar(250);
    if (consultados % 30 === 0 && consultados > 0) {
      writeFileSync(cachePath, JSON.stringify(descCache), 'utf8');
      console.log(`  ${i + 1}/${sinClasificar.length} revisados…`);
    }
  }

  for (const [ejeId, frases] of Object.entries(VOCAB)) {
    const match = frases.find((f) => texto.includes(f));
    if (match) {
      resultado.push({ id: t.id, artista: t.artista, titulo: t.titulo, ejeId, match });
      break; // primera categoria que matchea, no se acumulan varias
    }
  }
}

writeFileSync(cachePath, JSON.stringify(descCache), 'utf8');

console.log(`\nConsultados nuevos a YouTube: ${consultados}`);
console.log(`Sin videoId en cache (se saltearon): ${sinVideoId}`);
console.log(`\nCon match de alta precision: ${resultado.length} / ${sinClasificar.length}\n`);

const porEje = new Map();
for (const r of resultado) porEje.set(r.ejeId, (porEje.get(r.ejeId) ?? 0) + 1);
console.log('Por eje:', JSON.stringify([...porEje.entries()]));

writeFileSync('data/candidatos-genero-yt.json', JSON.stringify(resultado, null, 2), 'utf8');
console.log('\nCandidatos guardados en data/candidatos-genero-yt.json para revisión manual.\n');
console.log(resultado.map((r) => `[${r.ejeId} <- "${r.match}"]  ${r.artista} — ${r.titulo}`).join('\n'));
