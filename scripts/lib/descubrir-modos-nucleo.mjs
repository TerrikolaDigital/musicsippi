import { similitudCoseno } from './similitud.mjs';
import { textoDeTrack, generosParaVector, clasificarPorEmbeddings } from './clasificar-embeddings-puro.mjs';

/** tracks: [{id, generos:[termino,...]}] ya combinando MusicBrainz +
 *  YouTube + Deezer para ese track (armado por el llamador, ver Tarea 14).
 *  Devuelve Map<terminoNormalizado, {tracks: Set<trackId>}>. */
export function contarEvidencia(tracks, sinonimos = {}) {
  const evidencia = new Map();
  for (const track of tracks) {
    for (const generoCrudo of track.generos ?? []) {
      const termino = sinonimos[generoCrudo] ?? generoCrudo;
      if (!evidencia.has(termino)) evidencia.set(termino, { tracks: new Set() });
      evidencia.get(termino).tracks.add(track.id);
    }
  }
  return evidencia;
}

// Términos que describen INSTRUMENTACIÓN/estilo de arreglo, no un género de
// banda — nunca pueden fusionarse con otro término distinto durante el
// agrupamiento, aunque el embedding los de por parecidos. Medido con
// embeddings reales: "guitar" tiene 0.51-0.54 de similitud contra "rock",
// "hard rock", "heavy metal", "metal", "thrash metal" — al borde del umbral
// de 0.50, lo bastante cerca para que a veces el algoritmo los junte en el
// mismo grupo y el modo termine llamándose "Guitarra" pero lleno de
// canciones de bandas de metal/rock, sin relación real con los covers
// acústicos de guitarra que sí pertenecen ahí. Mismo riesgo verificado para
// "piano"/"orchestral"/"instrumental" contra "classical"/"jazz"/"electronic"
// (0.50-0.73 de similitud) — por eso la protección cubre a los cinco, no
// solo a "guitar".
const TERMINOS_SIN_FUSION_DE_GENERO = new Set(['guitar', 'piano', 'acoustic', 'orchestral', 'instrumental']);

/**
 * Agrupa terminos de género (frases cortas) por similitud de embedding, no
 * tracks. Cada termino se une al grupo mas parecido si supera el umbral, si
 * no abre un grupo nuevo. Determinístico dado el mismo orden y el mismo
 * embeber. El numero de grupos emerge de los datos.
 *
 * "Mas parecido" = el PEOR parecido contra cualquier miembro del grupo
 * (enlace completo), no contra el promedio del grupo. La diferencia no es
 * cosmética: con el promedio, el centro del grupo DERIVA a medida que entran
 * términos, y cada uno se juzga contra un promedio ya contaminado. Eso
 * encadena: instrumental -> piano -> classical -> orchestral -> symphonic
 * rock -> heavy metal. Cada paso es razonable, los extremos son absurdos.
 *
 * Medido sobre una biblioteca real de 343 términos: con promedio, los 343
 * colapsaban en 15 grupos, y el llamado "Instrumental" se tragaba heavy
 * metal, techno, gospel, opera y christmas music, mientras que "Pop" juntaba
 * 180 términos incluyendo rock, jazz, hip hop y sludge metal. Exigiendo que
 * el término se parezca a TODOS los miembros, los mismos 343 dan 39 grupos
 * que sí son géneros, y cubren 2071 de los 2073 tracks con evidencia: casi
 * no se pierde nada por partir más fino.
 */
export async function agruparTerminos(terminosConFrecuencia, embeberTexto, umbral) {
  const ordenados = [...terminosConFrecuencia].sort((a, b) => b.frecuencia - a.frecuencia);
  const grupos = [];
  for (const item of ordenados) {
    const vector = await embeberTexto(item.termino);
    let mejorGrupo = null;
    let mejorScore = -Infinity;

    // Si es un término de instrumentación, no intenta fusionarse con nada:
    // arma un grupo nuevo "cerrado" donde no puede entrar ningún otro término.
    if (TERMINOS_SIN_FUSION_DE_GENERO.has(item.termino)) {
      grupos.push({ terminos: [item], vectores: [vector], cerrado: true });
      continue;
    }

    // Para términos normales, busca el mejor grupo existente, pero saltea
    // grupos que están cerrados (protegidos por instrumentación).
    for (const grupo of grupos) {
      // Saltar grupos cerrados: otro término no puede fusionarse dentro
      if (grupo.cerrado) continue;

      let peor = Infinity;
      for (const otro of grupo.vectores) {
        const score = similitudCoseno(vector, otro);
        if (score < peor) peor = score;
        // Ya no califica: seguir midiendo contra el resto del grupo no puede
        // subir el mínimo. El valor parcial que queda igual sirve para
        // comparar, porque está por debajo del umbral y nunca puede ganarle
        // a un grupo que sí califica.
        if (peor < umbral) break;
      }
      if (peor > mejorScore) { mejorScore = peor; mejorGrupo = grupo; }
    }
    if (mejorGrupo && mejorScore >= umbral) {
      mejorGrupo.terminos.push(item);
      mejorGrupo.vectores.push(vector);
    } else {
      grupos.push({ terminos: [item], vectores: [vector] });
    }
  }
  return grupos.map((g) => ({ terminos: g.terminos, masaEnTerminos: g.terminos.reduce((acc, t) => acc + t.frecuencia, 0) }));
}

export function calcularMasaMinima(totalTracks, umbrales) {
  return Math.min(umbrales.masaMinima, Math.ceil(totalTracks * umbrales.masaMinimaPorcentaje));
}

/** grupos: salida de agruparTerminos, cada uno enriquecido afuera con
 *  `tracksCubiertos` (Set de trackId, union de los tracks de sus términos —
 *  ver Tarea 14 para donde se arma eso con `contarEvidencia`). */
export function filtrarPorMasa(grupos, masaMinima) {
  const modos = [];
  const residuo = [];
  for (const grupo of grupos) {
    const masa = grupo.tracksCubiertos?.size ?? grupo.masaEnTerminos;
    (masa >= masaMinima ? modos : residuo).push(grupo);
  }
  return { modos, residuo };
}

/**
 * Mayúscula al inicio de CADA palabra, no solo de la frase entera —
 * incluido cada lado de un guion ("singer-songwriter" -> "Singer-Songwriter"),
 * que es donde un capitalize ingenuo (solo el primer caracter de todo el
 * string) se nota más: un genero de una sola palabra ("shoegaze" ->
 * "Shoegaze") queda igual de bien de las dos formas, pero uno de varias
 * palabras sin esto quedaba "Festival progressive house" — con pinta de
 * error, porque las entradas curadas en nombresHumanos SÍ usan Title Case
 * ("Deep House", "Bossa Nova") y un término sin curar se veía descuidado al
 * lado, no solo menos conocido.
 */
export function capitalizarCadaPalabra(termino) {
  return termino.replace(/[a-záéíóúñ]+/gi, (palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1));
}

export function nombrarModo(grupo, nombresHumanos) {
  const dominante = [...grupo.terminos].sort((a, b) => b.frecuencia - a.frecuencia)[0].termino;
  if (nombresHumanos[dominante]) return nombresHumanos[dominante];
  return capitalizarCadaPalabra(dominante);
}

export function extraerPatronTitulo(titulo, patrones) {
  const tituloNormalizado = titulo.toLowerCase();
  for (const patron of patrones) {
    if (tituloNormalizado.includes(patron)) return patron;
  }
  return null;
}

export function coincideNombreExacto(nombreBuscado, nombreEncontrado) {
  return nombreBuscado.trim().toLowerCase() === nombreEncontrado.trim().toLowerCase();
}

// Umbral para agrupar TERMINOS de género por similitud de embedding (que tan
// parecidos deben ser dos géneros para fusionarse en el mismo modo
// candidato). Es un umbral conceptualmente distinto del UMBRAL_SCORE de
// clasificar-embeddings.mjs (ese es para clasificar TRACKS contra modos ya
// candidatos, este es para agrupar TERMINOS de vocabulario entre sí) — se
// mantiene como constante propia acá para no insinuar un vínculo que no
// existe entre ambos.
//
// Barrido sobre los 343 términos de una biblioteca real, con enlace completo
// (ver agruparTerminos): 0.48 -> 36 modos, 0.50 -> 39, 0.52 -> 41, 0.55 ->
// 45. Se eligió 0.50 porque desde ahí los grupos ya son géneros de verdad y
// la cobertura es máxima (2071 de 2073 tracks con evidencia); subir más solo
// parte géneros que son el mismo en más pedazos.
const UMBRAL_AGRUPACION_TERMINOS = 0.5;

/**
 * Versión del algoritmo que produce los modos descubiertos.
 *
 * Se sube cuando un cambio acá cambiaría el resultado sobre la MISMA
 * biblioteca. Sirve para que una instalación que ya tiene modos armados con
 * el algoritmo viejo los rehaga una vez sola, en vez de quedarse con ellos
 * para siempre (los re-descubrimientos normales solo miran lo que sigue sin
 * clasificar, así que nunca tocarían un modo ya creado). Ver
 * rehacerModosSiCambioElAlgoritmo en enriquecimiento-automatico.mjs.
 *
 * 1: agrupación por centroide, umbral 0.44.
 * 2: agrupación por enlace completo, umbral 0.50.
 * 3: términos de instrumentación (guitar/piano/acoustic/orchestral/instrumental)
 *    nunca se fusionan con otros términos.
 * 4: fuentes.json suma sinónimos "latin rock"/"latin pop"/"rock espanol" ->
 *    "rock"/"pop" — sin esto, el rock/pop cantado en español terminaba en
 *    el modo "Latino" junto a salsa/vallenato/merengue en vez de en Rock/Pop
 *    (esta versión no cambia código, pero el resultado sobre la misma
 *    biblioteca sí cambia, que es lo que este número rastrea).
 */
export const VERSION_AGRUPACION = 4;

/**
 * descubrirModos sin fs ni modelo propio: el llamador da las dependencias.
 * deps.prepararVectores(tracks, textoDe): deja calculado el vector de cada track
 * (reutilizando los que no cambiaron); deps.vectorDe(trackId) lo devuelve.
 * deps.ejes (opcional): los ejes, para sumar al texto del vector los moods de
 * género de cada canción (ver generosParaVector).
 * Ver el comentario de descubrirModos (descubrir-modos.mjs) para el resto.
 */
export async function descubrirModosNucleo(tracks, generosPorTrack, fuentes, deps, totalTracksReal = tracks.length) {
  const tracksConGeneros = tracks
    .filter((t) => (generosPorTrack.get(t.id) ?? []).length > 0)
    .map((t) => ({ id: t.id, generos: generosPorTrack.get(t.id) }));

  const evidencia = contarEvidencia(tracksConGeneros, fuentes.vocabulario.sinonimos);
  const terminosConFrecuencia = [...evidencia.entries()].map(([termino, { tracks: ts }]) => ({ termino, frecuencia: ts.size }));

  const grupos = await agruparTerminos(terminosConFrecuencia, deps.embeberTermino, UMBRAL_AGRUPACION_TERMINOS);
  for (const grupo of grupos) {
    const tracksCubiertos = new Set();
    for (const { termino } of grupo.terminos) {
      for (const trackId of evidencia.get(termino).tracks) tracksCubiertos.add(trackId);
    }
    grupo.tracksCubiertos = tracksCubiertos;
  }

  const masaMinima = calcularMasaMinima(totalTracksReal, fuentes.umbrales);
  const { modos: gruposModo, residuo } = filtrarPorMasa(grupos, masaMinima);

  const modosCandidatos = gruposModo.map((grupo) => ({
    nombre: nombrarModo(grupo, fuentes.vocabulario.nombresHumanos),
    terminos: grupo.terminos.map((t) => t.termino),
    trackIds: [...grupo.tracksCubiertos],
  }));

  // Propagar contra los modos candidatos, vía similitud de embeddings, a
  // dos poblaciones que de otro modo quedan sin ningún modo:
  //
  //  1. Tracks sin NINGUNA evidencia de género (sinEvidencia de siempre).
  //  2. Tracks cuya evidencia SÍ existe, pero formó un grupo de términos
  //     que no llegó a la masa mínima (`residuo`, ver filtrarPorMasa) — un
  //     género real y específico ("sludge metal", "trip hop"), solo que
  //     con pocas canciones propias para calificar como modo por sí solo.
  //     Antes esta segunda población no se intentaba encajar en nada: ni
  //     entraba a `modosCandidatos` ni pasaba por acá, así que quedaban
  //     "Sin clasificar" aunque hubiera un modo más amplio (p.ej. "Rock")
  //     donde encajaran razonablemente. Es la misma comparación con el
  //     mismo umbral que ya se usaba para la población 1 — no es un
  //     mecanismo nuevo, es dejar de dejar afuera a quien también podría
  //     usarlo.
  const idsSinMasa = new Set();
  for (const grupo of residuo) for (const trackId of grupo.tracksCubiertos) idsSinMasa.add(trackId);
  const sinEvidencia = tracks.filter((t) => !(generosPorTrack.get(t.id)?.length) || idsSinMasa.has(t.id));

  const ejesPorId = new Map((deps.ejes ?? []).map((e) => [e.id, e]));
  await deps.prepararVectores(tracks, (t) => textoDeTrack(t, { generos: generosParaVector(t, generosPorTrack.get(t.id) ?? [], ejesPorId) }));

  // ejeId es el INDICE en modosCandidatos, no el nombre: dos modos candidatos
  // distintos pueden terminar con el mismo nombre humano (p.ej. dos grupos de
  // términos separados que mapean al mismo nombresHumanos), y usar el nombre
  // como id rompería el lookup posterior — find() se quedaría siempre con el
  // primero. El índice es único por construcción.
  const embModos = [];
  for (let i = 0; i < modosCandidatos.length; i++) {
    const modo = modosCandidatos[i];
    const textoModo = `${modo.nombre}. Géneros: ${modo.terminos.join(', ')}.`;
    embModos.push({ ejeId: i, emb: await deps.embeber(textoModo) });
  }

  const residuoSinModo = [];
  for (const track of sinEvidencia) {
    const vector = deps.vectorDe(track.id);
    const sugerencia = vector ? clasificarPorEmbeddings(vector, embModos) : null;
    if (sugerencia) {
      modosCandidatos[sugerencia.ejeId].trackIds.push(track.id);
    } else {
      residuoSinModo.push(track);
    }
  }

  return { modosCandidatos, residuoSinModo, gruposSinMasa: residuo };
}
