/**
 * Deja un texto listo para buscar términos adentro exigiendo palabra completa:
 * minúsculas, sin acentos, y todo lo que no sea alfanumérico convertido en
 * espacio (emojis, guiones, paréntesis, "&"). Queda envuelto en espacios para
 * que ` termino ` solo matchee una palabra entera.
 *
 * Sin esto, buscar por subcadena da falsos positivos caros: "pop" entra dentro
 * de "Instrumental POPular Songs 2026" (704 tracks en la biblioteca de prueba)
 * y marcaría como pop una lista que es justamente lo contrario.
 */
function normalizarParaBuscar(texto) {
  const limpio = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${limpio} `;
}

function contieneTermino(textoNormalizado, termino) {
  const buscado = normalizarParaBuscar(termino).trim();
  if (!buscado) return false;
  return textoNormalizado.includes(` ${buscado} `);
}

/**
 * De la evidencia más confiable a la más gruesa. Un track descrito por varias
 * señales se registra con la primera de esta lista que haya disparado: sirve
 * para auditar ("¿por qué esta canción quedó en Chill?") y para que un
 * re-descubrimiento posterior con mejor evidencia pise a una más débil.
 */
export const PRECEDENCIA_SENALES = ['genero-musicbrainz', 'genero-deezer', 'descripcion-youtube', 'patron-titulo', 'nombre-lista'];

/**
 * Combina, por track, todas las señales de género disponibles sin pedirle nada
 * al usuario ni gastar ninguna API:
 *
 *  1. MusicBrainz (metadata-musicbrainz.json: tracks[id].artistaMbid ->
 *     artistas[mbid].generos). La más confiable, pero solo cubre artistas que
 *     existen en su base: la música de fondo/lofi subida directo a YouTube no
 *     está ahí (medido: 1213 de 1324 tracks sin clasificar no tenían ni ficha).
 *  2. Descripciones de YouTube (descripciones-youtube.json), cuando el usuario
 *     configuró la clave opcional de la Data API.
 *  3. El título del track contra `vocabulario.patronesTitulo`. Lista corta y
 *     curada a propósito: un título es texto libre y cualquier término genérico
 *     ahí genera ruido.
 *  (El nombre de las listas de origen ya NO cuenta: una playlist importada «Tango»
 *  con pop dentro llenaba Tango de Madonna. 'nombre-lista' sigue en
 *  PRECEDENCIA_SENALES solo para entender datos antiguos.)
 *
 * Solo entran términos que YA están en el vocabulario: el mecanismo no inventa
 * géneros, y cuando no reconoce nada simplemente no clasifica.
 *
 * El vocabulario vive en fuentes.json, que se actualiza solo desde el repo
 * remoto (spec §4.7): ampliarlo mejora la clasificación de todas las
 * instalaciones sin sacar un instalador nuevo.
 *
 * Núcleo puro (sin fs): los datos llegan por funciones. `generosDeezerDe` (solo
 * el móvil) da géneros de Deezer ya traducidos a términos del vocabulario;
 * cuentan solo si MusicBrainz no describió al artista (`genero-deezer`, justo
 * por debajo de MusicBrainz).
 *
 * Devuelve Map<trackId, { generos, senal }>, donde `senal` es cuál de las
 * señales describió al track (la de mayor precedencia si disparó más de una),
 * o null si ninguna. Se termina guardando en el track al aplicar el modo, así
 * que después se puede saber con qué evidencia quedó clasificado.
 */
export function armarEvidenciaNucleo(
  tracks,
  fuentes,
  { generosArtistaDe = () => [], descripcionDe = () => null, generosDeezerDe = () => [], ejes = [] } = {}
) {
  const vocabulario = fuentes.vocabulario ?? {};
  const patronesTitulo = vocabulario.patronesTitulo ?? [];
  const sinonimos = vocabulario.sinonimos ?? {};
  const vocabularioConocido = [
    ...Object.keys(vocabulario.nombresHumanos ?? {}),
    ...Object.keys(sinonimos),
    ...Object.values(sinonimos),
  ];

  // Un término y su sinónimo matchean los dos el mismo texto (para la
  // comparación por palabra, "hip-hop" y "hip hop" son idénticos), así que sin
  // esto un track quedaba con las dos variantes del mismo género. Downstream
  // no rompe (contarEvidencia ya canonicaliza), pero textoDeTrack arma el
  // texto que se embebe a partir de esta lista: repetir el mismo género ahí es
  // ruido puro. Los géneros de MusicBrainz no pasan por acá: vienen de una
  // fuente externa y los canonicaliza contarEvidencia, como siempre.
  const canonizar = (termino) => sinonimos[termino] ?? termino;
  // El nombre de la lista de origen YA NO es evidencia de género: una playlist importada «Tango» con pop dentro
  // metía a Madonna en Tango. El parámetro `ejes` se sigue aceptando por compatibilidad, pero no se usa.

  const resultado = new Map();
  for (const track of tracks) {
    const generos = new Set();
    // Qué señales describieron a este track. El orden de este array ES la
    // precedencia (la primera que haya disparado es la que se registra en el
    // track), de la evidencia más confiable a la más gruesa: una ficha de
    // MusicBrainz describe al artista real; el nombre de una lista describe
    // a lo que el usuario metió adentro, que puede incluir algo que no pega.
    const senales = new Set();

    for (const g of generosArtistaDe(track.id) ?? []) {
      generos.add(g);
      senales.add('genero-musicbrainz');
    }
    if (!senales.has('genero-musicbrainz')) {
      for (const g of generosDeezerDe(track.id) ?? []) {
        generos.add(canonizar(g));
        senales.add('genero-deezer');
      }
    }

    const descripcion = descripcionDe(track.id);
    if (descripcion) {
      const texto = normalizarParaBuscar(descripcion);
      for (const termino of vocabularioConocido) {
        if (contieneTermino(texto, termino)) {
          generos.add(canonizar(termino));
          senales.add('descripcion-youtube');
        }
      }
    }

    const titulo = normalizarParaBuscar(track.titulo ?? '');
    for (const patron of patronesTitulo) {
      if (contieneTermino(titulo, patron)) {
        generos.add(canonizar(patron));
        senales.add('patron-titulo');
      }
    }

    // Se guarda el término tal cual está en el vocabulario (con guiones, "&" o
    // lo que tenga), no normalizado: contarEvidencia() lo usa después como
    // clave contra `sinonimos` para unificar variantes.
    resultado.set(track.id, {
      generos: [...generos],
      senal: PRECEDENCIA_SENALES.find((s) => senales.has(s)) ?? null,
    });
  }
  return resultado;
}

/** Se queda solo con los géneros de una evidencia ya calculada, que es la
 *  forma que consume descubrirModos(). */
export function soloGeneros(evidencia) {
  return new Map([...evidencia].map(([id, { generos }]) => [id, generos]));
}
