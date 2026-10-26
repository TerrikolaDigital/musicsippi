/**
 * Normalización, id estable y clasificación automática contra los ejes.
 *
 * Extraído de importar.mjs para que el servidor de desarrollo (vite.config.js,
 * POST /api/agregar-track) pueda clasificar un track agregado a mano con
 * EXACTAMENTE la misma lógica que usa la importación masiva — dos
 * implementaciones del mismo criterio se desincronizan solas con el tiempo.
 * Sin efectos de lado (no toca disco): solo funciones puras sobre strings.
 */

/**
 * Letras con trazo incorporado al glifo. NFD las deja intactas porque no son
 * "base + diacritico combinable", asi que hay que mapearlas a mano: sin esto el
 * ancla "ChillOut" nunca alcanza al artista real "ChillØut".
 */
const TRAZOS = {
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ħ: 'h',
  ŧ: 't',
  ŋ: 'n',
  ı: 'i',
};

/**
 * Quita diacriticos y baja a minusculas, para comparar "Café Tacvba" con "Cafe Tacvba".
 * Tambien unifica el apostrofo tipografico del ingles (U+2019, "you'll") con el recto.
 * Hoy ningun artista lo usa, pero cinco anclas si lo llevan recto ("Guns N' Roses",
 * "S'Express", "Stereo MC's", "D'Michel Leb", "Ted D'souza"): el dia que un export
 * escriba una de esas con la comilla curva, el match fallaria en silencio.
 */
export function normalizar(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’`]/g, "'")
    .toLowerCase()
    .replace(/[øłđðþæœßħŧŋı]/g, (c) => TRAZOS[c])
    .trim();
}

/** Limpia sufijos de plataforma que ensucian la busqueda en YouTube. */
export function limpiarTitulo(titulo) {
  return (
    titulo
      .replace(/\s*\[(Explicit|Clean)\]\s*/gi, ' ')
      .replace(/\s*\(Official (Music )?Video\)\s*/gi, ' ')
      .replace(/\s*\(Official Audio\)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      // Videos de YouTube suelen escribir el título entre comillas ("Moby -
      // 'Extreme Ways' (Official Video)") — sin esto, el recuperado por CSV
      // ("'Extreme Ways'") y el que ya viene limpio de Spotify ("Extreme
      // Ways") arman dos tracks case-por-comillas en vez de uno. Solo cuando
      // las comillas envuelven el título ENTERO (no una legítimo adentro,
      // ej. Sam Smith - "I'm Not The Only One" con un apóstrofo interno que
      // no tapa los dos extremos).
      .replace(/^['"“”‘’]+(.*)['"“”‘’]+$/, '$1')
      .trim()
  );
}

/**
 * Separadores de credito. Los fuertes solo aparecen entre artistas distintos; los
 * debiles tambien viven dentro de un nombre propio ("Years & Years", "Chase & Status"),
 * asi que se aplican en una segunda pasada que agrega claves sin quitar las anteriores.
 */
const SEP_FUERTE = /\s*(?:[,;/()·]|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|:)\s*/;
const SEP_DEBIL = /\s*(?:&|\+|\bx\b|\bvs\.?\b|\band\b|\bwith\b|\by\b)\s*/;

/**
 * Alias explicitos: un mismo acto publicado bajo dos nombres, donde el corto no es
 * segmento del largo. Es el unico caso en que un ancla mas larga debe capturar un
 * nombre mas corto, y no se puede deducir del texto. Clave y valor van normalizados.
 */
const ALIAS = { 'lady a': 'lady antebellum' };

/**
 * Descompone el credito de un track en las claves por las que puede reclamarlo un ancla.
 *
 * Reemplaza al viejo `includes()` bidireccional, que unia por subcadena y mandaba 15
 * artistas a ejes ajenos: "Sia" caia en latin-pop porque "Enrique Igle-sia-s" la
 * contiene, "Fatboy Slim" en eurodance por "f-atb-oy", "Selena Gomez" en britpop por
 * la banda "Gomez". El ancla ahora tiene que igualar un credito entero, no un fragmento.
 *
 * Se conservan las colaboraciones ("Calvin Harris · Dua Lipa" cuenta para las dos) y
 * los nombres decorados: el prefijo "The" es opcional a ambos lados, y los parentesis
 * y dos puntos cortan credito ("Brock Hewitt: Stories in Sound" -> "brock hewitt").
 */
export function clavesDeArtista(nombre) {
  const claves = new Set();

  const agregar = (s) => {
    const v = s.trim();
    if (!v) return;
    claves.add(v);
    const sinThe = v.replace(/^the\s+/, '').trim();
    if (sinThe) claves.add(sinThe);
  };

  const norm = normalizar(nombre);
  agregar(norm);
  for (const fuerte of norm.split(SEP_FUERTE)) {
    agregar(fuerte);
    for (const debil of fuerte.split(SEP_DEBIL)) agregar(debil);
  }
  for (const c of [...claves]) if (ALIAS[c]) agregar(ALIAS[c]);

  return claves;
}

/** Un ancla matchea si iguala algun credito completo del track. */
export function anclaMatchea(claves, ancla) {
  const an = normalizar(ancla);
  if (claves.has(an)) return true;
  const sinThe = an.replace(/^the\s+/, '').trim();
  return sinThe !== an && claves.has(sinThe);
}

/**
 * Clasifica un track contra los ejes.
 * Los ejes NO son excluyentes: un remix de Madonna puede caer en disco-club y pop-dance.
 *
 * Precedencia: el artista es senal fuerte y el titulo solo desempata. Sin esta regla,
 * anclas genericas de titulo ("acoustic", "piano version") se comen tracks que ya
 * tenian dueno claro por artista: en la primera corrida, 103 de 144 tracks de
 * melancolico eran en realidad covers-piano de Edward Ong.
 */
export function clasificar(track, ejes) {
  const clavesArtista = clavesDeArtista(track.artista);
  const tituloNorm = normalizar(track.titulo);

  const porArtista = [];
  const porTitulo = [];

  for (const eje of ejes) {
    if (!eje.activo || eje.sistema) continue;

    const matchArtista = eje.anclas.artistas.some((a) => anclaMatchea(clavesArtista, a));
    if (matchArtista) {
      porArtista.push({ ejeId: eje.id, origen: 'auto', senal: 'artista', score: 1 });
      continue;
    }

    const matchTitulo = eje.anclas.titulos.some((t) => tituloNorm.includes(normalizar(t)));
    if (matchTitulo) {
      porTitulo.push({ ejeId: eje.id, origen: 'auto', senal: 'titulo', score: 0.6 });
    }
  }

  if (porArtista.length > 0) return porArtista;
  if (porTitulo.length > 0) return porTitulo;
  return [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }];
}

/** Mismo separador que separarArtistas en App.jsx — colaboraciones, no bandas con "&" en el nombre. */
function separarArtistasCredito(nombre) {
  return nombre
    .split(/\s*·\s*|\s*,\s*|\s+vs\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Índice artista (minúscula) -> Map(ejeId -> cantidad de tracks), a partir de
 * tracks YA clasificados. Es la misma señal que ya se le muestra al usuario
 * como chip sugerido en "Para clasificar" (App.jsx, sugerenciasPorArtista) —
 * vive acá también para poder aplicarla SOLA, automáticamente, sin esperar
 * un clic.
 *
 * `ejesValidos` (Set de ids con tipo 'gusto' o 'funcional') es obligatorio:
 * sin filtrar por ahí, un track en la playlist "Gym" contaba como si "Gym"
 * fuera un modo, y el bug real que esto causó fue que "Para clasificar"
 * sugería (y esta función después llegó a asignar sola) playlists como si
 * fueran el modo del track — mezclando dos cosas independientes
 * (pertenencia a colección vs. clasificación por modo).
 */
export function indiceSugerenciasPorArtista(tracks, ejesValidos) {
  const indice = new Map();
  for (const t of tracks) {
    for (const nombre of separarArtistasCredito(t.artista)) {
      const clave = nombre.toLowerCase();
      for (const a of t.ejes) {
        if (!ejesValidos.has(a.ejeId)) continue;
        if (!indice.has(clave)) indice.set(clave, new Map());
        const porEje = indice.get(clave);
        porEje.set(a.ejeId, (porEje.get(a.ejeId) ?? 0) + 1);
      }
    }
  }
  return indice;
}

/**
 * Devuelve el ejeId si TODAS las apariciones anteriores de este artista (o
 * sus co-artistas) apuntan al mismo modo — null si hay ambigüedad (dos
 * modos distintos) o si no hay ninguna señal todavía.
 */
export function sugerenciaUnanime(artista, indice) {
  const combinado = new Map();
  for (const nombre of separarArtistasCredito(artista)) {
    const porEje = indice.get(nombre.toLowerCase());
    if (!porEje) continue;
    for (const [ejeId, n] of porEje) combinado.set(ejeId, (combinado.get(ejeId) ?? 0) + n);
  }
  if (combinado.size !== 1) return null;
  const [ejeId] = combinado.keys();
  return ejeId;
}

/**
 * Vocabulario para clasificar por la DESCRIPCIÓN del video de YouTube ya
 * resuelto (gratis vía InnerTube, no cuesta cuota — el video ya está
 * cacheado de todos modos porque hace falta para sonar).
 *
 * Medido en vivo contra 322 tracks reales de "sin-clasificar": los tags de
 * una sola palabra genéricos (house, dance, trap, club, disco, soul, sad,
 * cinematic, score) dan falsos positivos porque los canales-sello tipo
 * "Magic Records"/"TrapWolves" pegan un hashtag-soup de SEO en TODOS sus
 * videos sin relación con el género real de ESE track puntual (ej.
 * "Public Enemy" matcheaba "sad" y "ZenLifeRelax" —meditación— matcheaba
 * "club", ninguno de los dos es lo que dice). Solo sobreviven frases
 * compuestas/de nicho que un canal no pegaría si no aplican de verdad:
 * ahí "phonk"/"drift phonk" fueron 100% consistentes (28/28 en la corrida
 * real). Cualquier tag nuevo que se agregue acá tiene que pasar el mismo
 * filtro antes de sumarse — no basta con que esté en tagsLastfm.
 */
const VOCAB_DESCRIPCION_YOUTUBE = {
  'phonk-gym': ['phonk', 'drift phonk', 'brazilian phonk', 'hard bass', 'hardbass'],
  worship: ['gospel', 'worship music', 'christian music'],
  'covers-piano': ['piano cover', 'lofi instrumental', 'lo-fi instrumental'],
  eurodance: ['eurodance', 'eurotrance'],
  'deep-house': ['deep house', 'tropical house', 'melodic house', 'chillhouse'],
};

/**
 * `texto` = título + descripción del video, ya en minúsculas. Devuelve el
 * primer ejeId cuyo vocabulario matchea, o null. No hay ambigüedad entre
 * ejes acá (a diferencia de clasificar(), que sí acumula varios matches de
 * artista): esta señal es más débil, así que basta la primera que aparezca.
 */
export function clasificarPorDescripcionYoutube(texto) {
  if (!texto) return null;
  for (const [ejeId, frases] of Object.entries(VOCAB_DESCRIPCION_YOUTUBE)) {
    if (frases.some((f) => texto.includes(f))) return ejeId;
  }
  return null;
}

/**
 * Segunda pasada automática, DESPUÉS de clasificar() cada track por
 * separado: un track que quedó en sin-clasificar pero cuyo artista (o
 * co-artista) tiene TODAS sus demás apariciones en un único modo se asigna
 * ahí también — `origen: 'auto'`, `senal: 'artista-unanime'` para
 * distinguirlo de un match directo por ancla. Automática a propósito (no un
 * botón que alguien tiene que acordarse de tocar): el usuario final de la
 * app no va a correr nada a mano, así que lo que se pueda inferir sin
 * ambigüedad tiene que quedar resuelto solo. Muta `tracks` in-place.
 *
 * `ejes` es la lista completa de data/ejes.json — se necesita para saber cuáles
 * son modos de verdad (gusto/funcional) y cuáles son playlists/sistema, que
 * no cuentan como señal (ver indiceSugerenciasPorArtista).
 */
export function propagarSugerenciasUnanimes(tracks, ejes) {
  const ejesValidos = new Set(
    ejes.filter((e) => (e.tipo === 'gusto' || e.tipo === 'funcional') && !e.sistema).map((e) => e.id)
  );
  const indice = indiceSugerenciasPorArtista(tracks, ejesValidos);
  let aplicadas = 0;
  for (const t of tracks) {
    if (!t.ejes.some((a) => a.ejeId === 'sin-clasificar')) continue;
    const ejeId = sugerenciaUnanime(t.artista, indice);
    if (!ejeId) continue;
    t.ejes = t.ejes.filter((a) => a.ejeId !== 'sin-clasificar');
    t.ejes.push({ ejeId, origen: 'auto', senal: 'artista-unanime', score: 0.9 });
    aplicadas++;
  }
  return aplicadas;
}

/**
 * Poda ejes no-sistema (modos y listas, no 'sin-clasificar' ni 'favoritos')
 * que se quedaron sin ningún track — una lista importada vacía, o un modo
 * que perdió sus últimos tracks en una reclasificación, no aporta nada y
 * solo ensucia el Home. Corre DESPUÉS de que `tracks` ya está en su forma
 * final (import completo, con todas las pasadas de clasificación
 * aplicadas), nunca en respuesta a una edición en vivo del usuario — crear
 * una lista nueva la deja en 0 tracks a propósito hasta que se le agregue
 * el primero, y podarla ahí borraría lo que la persona acaba de crear.
 *
 * Devuelve `{ ejes: ejes sin las vacías, podados: [nombres] }`.
 */
export function podarEjesVacios(ejes, tracks) {
  const conTracks = new Set();
  for (const t of tracks) for (const a of t.ejes) conTracks.add(a.ejeId);

  const podados = [];
  const restantes = ejes.filter((e) => {
    if (e.sistema || conTracks.has(e.id)) return true;
    podados.push(e.nombre);
    return false;
  });
  return { ejes: restantes, podados };
}
