// src/movil/inicio/claves.js
// Normalización de nombres y títulos para cruzar lo de fuera (Deezer) con la biblioteca.

export const norm = (t) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/\b(feat|ft|with)\b.*$/, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SEPARADOR = /\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\by\b|\bx\b)\s*/i;

/** «Ana, Beto feat. Cris» -> ['Ana', 'Beto', 'Cris'] */
export const artistasDe = (texto) =>
  String(texto ?? '')
    .split(SEPARADOR)
    .map((s) => s.trim())
    .filter(Boolean);

export const claveCancion = (artista, titulo) => `${norm(artistasDe(artista)[0] ?? artista)}|${norm(titulo)}`;

/** Conjuntos de la biblioteca para filtrar lo que ya se tiene. */
export function indiceBiblioteca(tracks) {
  const canciones = new Set();
  const artistas = new Set();
  for (const t of tracks ?? []) {
    canciones.add(claveCancion(t.artista, t.titulo));
    for (const a of artistasDe(t.artista)) artistas.add(norm(a));
  }
  return { canciones, artistas };
}

/** Reparte en turnos: un elemento de cada lista por vuelta, sin repetir clave y hasta `max`. */
export function entrelazar(listas, clave, max) {
  const vistos = new Set();
  const salida = [];
  const n = Math.max(0, ...listas.map((l) => l.length));
  for (let i = 0; i < n && salida.length < max; i++) {
    for (const l of listas) {
      const x = l[i];
      if (!x) continue;
      const k = clave(x);
      if (vistos.has(k)) continue;
      vistos.add(k);
      salida.push(x);
      if (salida.length >= max) break;
    }
  }
  return salida;
}
