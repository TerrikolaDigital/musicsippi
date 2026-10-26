/**
 * Género simple: una etiqueta genérica y ancha (rock, electronic, hip-hop...)
 * como RED DE SEGURIDAD para lo que no encaja en ningún modo curado — no
 * reemplaza ni toca `ejes` (los modos son mood/contexto, curados a mano;
 * esto es genero de catálogo, la clasificación "de toda la vida"). Vive en
 * un campo aparte del track (`generoSimple`), nunca en `ejes`.
 *
 * El mapeo prioriza pocos baldes anchos sobre precisión de subgénero — es
 * intencional (pedido explícito: "la gente no busca una clasificación tan
 * profunda"), tomando el PRIMER tag de Last.fm (ya viene ordenado por
 * relevancia) que caiga en algún balde conocido.
 */

export const GENEROS_SIMPLES = [
  'rock', 'metal', 'electronic', 'hip-hop', 'pop', 'indie', 'jazz',
  'classical', 'reggae', 'latin', 'folk', 'blues', 'punk', 'rnb',
];

const TAG_A_GENERO = {
  rock: 'rock', 'alternative rock': 'rock', 'hard rock': 'rock', 'classic rock': 'rock',
  'glam rock': 'rock', 'garage rock': 'rock', 'progressive rock': 'rock', 'art rock': 'rock',
  'folk rock': 'rock', alternative: 'rock',

  metal: 'metal', 'heavy metal': 'metal', 'glam metal': 'metal', 'thrash metal': 'metal',
  'hair metal': 'metal',

  electronic: 'electronic', house: 'electronic', 'deep house': 'electronic',
  'chill house': 'electronic', 'beach house': 'electronic', edm: 'electronic',
  techno: 'electronic', trance: 'electronic', 'progressive trance': 'electronic',
  'progressive house': 'electronic', 'electro house': 'electronic', electro: 'electronic',
  dubstep: 'electronic', 'drum and bass': 'electronic', dance: 'electronic',
  chiptune: 'electronic', synthwave: 'electronic', coldwave: 'electronic',
  ambient: 'electronic', 'big room': 'electronic', hardstyle: 'electronic',
  phonk: 'electronic', 'drift phonk': 'electronic', 'brazilian phonk': 'electronic',
  disco: 'electronic',

  'hip-hop': 'hip-hop', 'hip hop': 'hip-hop', rap: 'hip-hop', trap: 'hip-hop',
  'trap nation': 'hip-hop', 'abstract hip-hop': 'hip-hop',

  pop: 'pop', 'dance-pop': 'pop', synthpop: 'pop',

  indie: 'indie', 'indie rock': 'indie', indietronica: 'indie',

  jazz: 'jazz', 'jazz-funk': 'jazz',

  classical: 'classical', orchestra: 'classical', orchestral: 'classical',
  neoclassical: 'classical',

  reggae: 'reggae', reggaeton: 'reggae', dancehall: 'reggae',

  latin: 'latin', 'latin pop': 'latin', cumbia: 'latin', salsa: 'latin',
  vallenato: 'latin', 'latin rock': 'latin',

  folk: 'folk', americana: 'folk', country: 'folk', 'singer-songwriter': 'folk',

  blues: 'blues',

  punk: 'punk', 'post-punk': 'punk', 'punk rock': 'punk',

  rnb: 'rnb', 'r&b': 'rnb', soul: 'rnb', funk: 'rnb',
};

/** `tags` = array de strings en minúscula, ya ordenados por relevancia. */
export function generoSimpleDeTags(tags) {
  for (const tag of tags ?? []) {
    const balde = TAG_A_GENERO[tag];
    if (balde) return balde;
  }
  return null;
}
