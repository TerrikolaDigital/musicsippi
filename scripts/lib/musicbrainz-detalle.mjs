/**
 * Géneros y etiquetas de MusicBrainz por CANCIÓN (recording) y por ÁLBUM (release-group), además del artista.
 * Puro (sin red ni disco): lo comparten el enriquecimiento del móvil (src/organizador/enriquecer-movil.js) y la
 * simulación (scripts/simular-alimentar-estados.mjs).
 * Prioridad al decidir géneros: canción > álbum > artista (ver generosMBEfectivos).
 */
export const AGENTE_MB_DETALLE = 'Musicsippi/1.0 ( terrikoladigital@gmail.com )';
/** MusicBrainz pide como máximo 1 petición por segundo. */
export const ESPERA_MB_DETALLE_MS = 1000;

export const URL_RECORDING = (mbid) => `https://musicbrainz.org/ws/2/recording/${mbid}?inc=genres+tags+releases+release-groups&fmt=json`;
export const URL_RELEASE_GROUP = (mbid) => `https://musicbrainz.org/ws/2/release-group/${mbid}?inc=genres+tags&fmt=json`;

const ordenar = (lista) =>
  [...(lista ?? [])]
    .map((x) => ({ name: String(x?.name ?? '').toLowerCase().trim(), count: x?.count ?? 0 }))
    .filter((x) => x.name)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

/**
 * Resumen de una ficha de recording o release-group. En canciones y álbumes casi todos los votos son 1 (a
 * diferencia de los artistas), así que aquí basta 1 voto; se conservan los 3 géneros con más votos.
 * `tags` son todas las etiquetas (sirven para las de ánimo: happy, sad, chill…).
 */
export function resumirFicha(json) {
  const generos = ordenar(json?.genres).slice(0, 3).map((g) => g.name);
  const tags = [...new Set(ordenar(json?.tags).map((g) => g.name))];
  return { generos, tags };
}

const PRIMARIO_PREFERIDO = { Album: 0, EP: 1, Single: 2 };

/**
 * Release-group de una canción a partir de los `releases` de su ficha: el álbum original (no recopilatorio,
 * directo, remix ni banda sonora si hay alternativa) con título igual al `albumPreferido` si se conoce.
 */
export function elegirReleaseGroup(releases, albumPreferido = null) {
  const objetivo = String(albumPreferido ?? '').toLowerCase().trim();
  const candidatos = (releases ?? [])
    .map((r) => ({ id: r['release-group']?.id, titulo: String(r['release-group']?.title ?? r.title ?? '').toLowerCase().trim(), rg: r['release-group'] ?? {}, fecha: r.date ?? '9999' }))
    .filter((c) => c.id);
  if (candidatos.length === 0) return null;
  const puntuar = (c) => {
    let p = PRIMARIO_PREFERIDO[c.rg['primary-type']] ?? 3;
    if ((c.rg['secondary-types'] ?? []).length) p += 5;
    if (objetivo && c.titulo === objetivo) p -= 10;
    return p;
  };
  return candidatos.sort((a, b) => puntuar(a) - puntuar(b) || a.fecha.localeCompare(b.fecha))[0].id;
}

/** Géneros que se usan para clasificar una canción: canción, si no álbum, si no artista. */
export function generosMBEfectivos(registro) {
  const c = registro?.mbCancion?.generos;
  if (c?.length) return c;
  const a = registro?.mbAlbum?.generos;
  if (a?.length) return a;
  return registro?.generosMB ?? [];
}
