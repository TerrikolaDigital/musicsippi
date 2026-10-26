// src/organizador/migrar-moods.js
// Migración a la taxonomía de moods (informe docs/revision-usabilidad-y-moods-2026-10-19.md, apartado B):
// 14 géneros + 6 estados + las listas fijas del usuario. Todo puro: no toca disco ni red.
//   planificarMigracion({ tracks, ejes, musicbrainz?, bpm? }) -> plan (no cambia nada)
//   formatearSimulacion(plan)                                  -> líneas de texto con los recuentos
//   aplicarPlan(ejesData, tracks, plan)                        -> copias nuevas ya migradas (nadie lo ejecuta aún)
// `tracks`: biblioteca.tracks. `ejes`: ejes.json -> ejes. `musicbrainz`: metadata-musicbrainz.json (opcional,
// etiquetas de género del ARTISTA). `bpm`: { [trackId]: número } si algún día hay tempo (Deezer hoy no lo da).

const UMBRAL = 2; // puntuación mínima para pertenecer a un mood

// ---------------------------------------------------------------------------------------------
// Taxonomía
// ---------------------------------------------------------------------------------------------

/** Géneros: cómo suena. Cada canción tiene a lo sumo uno principal (salvo `multiple`: Bandas sonoras se suma al principal). `reusa`: id de eje actual que se conserva. */
export const GENEROS = [
  { id: 'pop', nombre: 'Pop', descripcion: 'Pop de radio, actual y clásico.' },
  { id: 'pop-bailable', nombre: 'Pop bailable', descripcion: 'Pop pensado para bailar: dance-pop, disco, eurodance.' },
  { id: 'electronica', nombre: 'Electrónica', descripcion: 'Música hecha con sintetizadores y ritmo de baile (house, techno, trance).' },
  { id: 'rock', nombre: 'Rock', descripcion: 'Rock clásico, duro y metal.' },
  { id: 'rock-alternativo', nombre: 'Rock alternativo', descripcion: 'Rock alternativo, indie, grunge, britpop y new wave.' },
  { id: 'rock-espanol', nombre: 'Rock en español', descripcion: 'Rock hecho en español.' },
  { id: 'salsa', nombre: 'Salsa', descripcion: 'Salsa, timba y son cubano.' },
  { id: 'reggaeton', nombre: 'Reggaetón', descripcion: 'Reggaetón, trap latino, urbano latino y dembow.' },
  { id: 'latino', nombre: 'Latino', descripcion: 'Bachata, merengue, cumbia, pop latino, vallenato y bolero.' },
  { id: 'tango', nombre: 'Tango', descripcion: 'Tango y su fusión con electrónica.' },
  { id: 'soul-hip-hop', nombre: 'Soul y hip hop', descripcion: 'Soul, rap, funk y ritmo y blues moderno.' },
  { id: 'folk-country', nombre: 'Folk y country', descripcion: 'Cantautores, folk y country.' },
  { id: 'instrumental', nombre: 'Instrumental', descripcion: 'Música sin voz: piano, cuerdas, clásica, bandas sonoras instrumentales y lofi.' },
  { id: 'acustico', nombre: 'Acústico', descripcion: 'Versiones acústicas y guitarra sin amplificar.' },
  { id: 'bandas-sonoras', nombre: 'Bandas sonoras', descripcion: 'Música de películas y series (bandas sonoras originales). Es temática: una canción puede estar aquí y en su género.', reusa: 'soundtracks', multiple: true },
  { id: 'chillout-lounge', nombre: 'Chillout y lounge', descripcion: 'Electrónica relajada: downtempo, lounge, ambient, estilo Ibiza.' },
];

/** Estados: cómo te sientes o qué haces. Una canción puede estar en varios. `chipId`: el chip de «¿Cómo te sientes?». */
export const ESTADOS = [
  { id: 'tranquilo', nombre: 'Zen', chipId: 'tranquilo', descripcion: 'Calma y paz interior: para relajarte, estudiar o trabajar sin distraerte.' },
  { id: 'con-energia', nombre: 'Power', chipId: 'energia', descripcion: 'Energía para moverte: para entrenar y activarte.' },
  { id: 'de-fiesta', nombre: 'Party', chipId: 'fiesta', descripcion: 'Fiesta y baile: para bailar y juntarse.' },
  { id: 'melancolico', nombre: 'Blue', chipId: 'melancolico', descripcion: 'Melancolía e introspección: para un rato triste o nostálgico.', reusa: 'melancholia' },
  { id: 'feliz', nombre: 'Sunny', chipId: 'feliz', descripcion: 'Buen rollo y alegría: para animarte.' },
  { id: 'inspirado', nombre: 'Dream', chipId: 'inspirado', descripcion: 'Imaginación e inspiración: para crear o soñar despierto.', reusa: 'inspiracion' },
];

/** Listas con identidad propia del usuario: se conservan tal cual y no se rellenan solas. */
export const LISTAS_FIJAS = [
  'devil-wears-prada-2006-soundtrack',
  'one-day-siempre-el-mismo-dia-soundtrack-de-la-serie-de-netflix',
  'nilda-chiaraviglio',
  'liked-from-radio',
];

/** Eje (por id o por nombre) que es una actividad de entrenar: Gym, Gimnasio, Workout… -> Power. */
const RE_ACTIVIDAD_ENERGIA = /\b(gym|gimnasio|workout|entrenamiento|entrenar|fitness)\b/;
export const esActividadEnergia = (e) => RE_ACTIVIDAD_ENERGIA.test(`${String(e?.id ?? '').replace(/-/g, ' ')} ${String(e?.nombre ?? '')}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());

const IDS_TAXONOMIA = new Set([...GENEROS, ...ESTADOS].map((m) => m.id));

/** Ejes que nunca se migran (marca de la canción o bandeja del sistema). */
const INTOCABLES = ['favoritos', 'sin-clasificar'];

// Etiquetas de género de MusicBrainz -> género (la primera regla que case).
export const REGLAS_MB = [
  [/tango/, 'tango'],
  [/salsa|timba|son cubano|mambo|boogaloo/, 'salsa'],
  [/reggaeton|urbano|latin trap|trap latino|dembow|latin urban/, 'reggaeton'],
  [/latin|cumbia|bachata|merengue|vallenato|bolero|samba|mpb/, 'latino'],
  [/dance-pop|eurodance|disco|^dance$|teen pop|bubblegum|europop|synth-pop|electropop|dance/, 'pop-bailable'],
  [/house|edm|techno|trance|electro|electronic|drum and bass|uk garage|phonk|dubstep|big beat/, 'electronica'],
  [/jazz|bossa|swing|bebop|lounge|ambient|chillout|downtempo|trip hop/, 'chillout-lounge'],
  [/hip hop|rap|r&b|soul|funk|motown|gospel/, 'soul-hip-hop'],
  [/acoustic/, 'acustico'],
  [/folk|country|singer-songwriter|bluegrass/, 'folk-country'],
  [/film score|cinematic|video game score|classical|orchestral|piano|chamber|opera|baroque|romantic|neoclassical/, 'instrumental'],
  [/new wave|post-punk|indie|alternative|britpop|grunge|shoegaze|dream pop|neo-psychedelia|art rock|post-grunge|jangle|punk|emo/, 'rock-alternativo'],
  [/rock|metal|blues|glam|hard/, 'rock'],
  [/pop/, 'pop'],
];
export const generoDeMB = (g) => {
  for (const [re, id] of REGLAS_MB) if (re.test(g)) return id;
  return null;
};

// Artistas con identidad clara. Son las «correcciones» del informe (B.3): ganan sobre la lista de origen.
export const ARTISTAS_ANCLA = {
  'soda stereo': 'rock-espanol',
  'gustavo cerati': 'rock-espanol',
  'cafe tacvba': 'rock-espanol',
  caifanes: 'rock-espanol',
  'jarabe de palo': 'rock-espanol',
  'leon larregui': 'rock-espanol',
  shakira: 'latino',
  'marc anthony': 'salsa',
  'hector lavoe': 'salsa',
  'celia cruz': 'salsa',
  'ruben blades': 'salsa',
  'grupo niche': 'salsa',
  'willie colon': 'salsa',
  'gilberto santa rosa': 'salsa',
  'joe arroyo': 'salsa',
  'bad bunny': 'reggaeton',
  'daddy yankee': 'reggaeton',
  'j balvin': 'reggaeton',
  'karol g': 'reggaeton',
  ozuna: 'reggaeton',
  feid: 'reggaeton',
  'rauw alejandro': 'reggaeton',
  'don omar': 'reggaeton',
  'wisin y yandel': 'reggaeton',
  wisin: 'reggaeton',
  bajofondo: 'tango',
  'bajofondo tango club': 'tango',
  campo: 'tango',
  'gotan project': 'tango',
  'astor piazzolla': 'tango',
  'carlos gardel': 'tango',
  'otros aires': 'tango',
  tanghetto: 'tango',
  // Compositores de cine: para ellos Bandas sonoras es también el género principal.
  'ramin djawadi': 'bandas-sonoras',
  'hans zimmer': 'bandas-sonoras',
  'john williams': 'bandas-sonoras',
  'ennio morricone': 'bandas-sonoras',
  'howard shore': 'bandas-sonoras',
  'danny elfman': 'bandas-sonoras',
  'alexandre desplat': 'bandas-sonoras',
  'michael giacchino': 'bandas-sonoras',
  'james horner': 'bandas-sonoras',
  'alan silvestri': 'bandas-sonoras',
  madonna: 'pop-bailable',
  'kylie minogue': 'pop-bailable',
  'donna summer': 'pop-bailable',
  'lady gaga': 'pop-bailable',
};

// Evidencia de ejes actuales -> [familia, mood, peso base]. G = género, E = estado.
const EVIDENCIA = {
  acustico: ['G', 'acustico', 1],
  'alternative-rock': ['G', 'rock-alternativo', 1],
  'new-wave': ['G', 'rock-alternativo', 1],
  'bajofondo-tango-club': ['G', 'tango', 1],
  tango: ['G', 'tango', 1],
  dance: ['G', 'pop-bailable', 1],
  'dance-pop': ['G', 'pop-bailable', 1],
  edm: ['G', 'electronica', 1],
  house: ['G', 'electronica', 1],
  pop: ['G', 'pop', 1],
  'today-s-top-hits': ['G', 'pop', 0.5],
  rock: ['G', 'rock', 1],
  'rock-espanol': ['G', 'rock-espanol', 1],
  piano: ['G', 'instrumental', 1],
  lofi: ['G', 'instrumental', 1], // y además suma a Zen (ver puntuar)
  concentrado: ['E', 'tranquilo', 1], // el antiguo estado Concentrado se absorbe en Zen
  instrumental: ['G', 'instrumental', 0.8],
  'instrumental-popular-songs-2026': ['G', 'instrumental', 0.8],
  lounge: ['G', 'chillout-lounge', 1],
  'lounge-music-2026-soft-house-ibiza-chill-lounge-hits': ['G', 'chillout-lounge', 0.7],
  chill: ['E', 'tranquilo', 1],
  inspiracion: ['E', 'inspirado', 1],
  gimnasio: ['E', 'con-energia', 1],
  gym: ['E', 'con-energia', 1],
  'workout-music-2026-gym-workout-songs-power-music': ['E', 'con-energia', 1],
  melancholia: ['E', 'melancolico', 1],
};
// «Bandas sonoras» (antes el eje «Soundtracks») ya no es un género exclusivo sino un mood temático que se suma al
// género real de la canción (decisión del usuario). Por eso NO está en EVIDENCIA: se decide aparte, en `esBandaSonora`
// y en `vieneDeBSO`, y no compite por el género principal (salvo los compositores de cine, en ARTISTAS_ANCLA).
export const ID_BSO = 'bandas-sonoras';
const EJES_BSO_ORIGEN = new Set(['soundtracks', ID_BSO]);
/** Álbum de banda sonora: «Soundtrack», «Music from the … Series», «Original Score», «Motion Picture», «OST». */
export const RE_ALBUM_BSO = /soundtrack|music from the .*(series|film|movie|motion picture)|original (motion picture |tv |series |television )?score|motion picture|\bost\b|original series/i;

const PESO_SENAL = { usuario: 3, lista: 1.5, 'migracion-moods': 3, 'patron-titulo': 2.5, 'genero-musicbrainz': 1.5, 'artista-unanime': 1, 'ia-embeddings': 1, 'nombre-lista': 1, descubrimiento: 1, ninguna: 0 };
const pesoDe = (x) => (x.origen === 'manual' ? PESO_SENAL.usuario : x.origen === 'lista' ? PESO_SENAL.lista : (PESO_SENAL[x.senal] ?? 1));

// Siembra inicial de los dos estados que hoy nacen vacíos. Sin tempo ni valencia en los datos, se usa:
// género (señal principal, solo música con voz y pulso), título con señal clara y artistas ancla.
export const GENEROS_FIESTA = new Set(['pop-bailable', 'latino', 'salsa', 'reggaeton', 'electronica']);
export const GENEROS_FELIZ = new Set(['pop', 'pop-bailable', 'latino', 'salsa', 'reggaeton', 'soul-hip-hop']);
const NO_SEMBRAR = new Set(['instrumental', 'acustico', 'chillout-lounge', 'folk-country', 'bandas-sonoras']);
export const BPM_FIESTA = 118;
export const RE_TITULO_FIESTA = /\b(party|fiesta|club|baile|bailar|bailando|perreo|dance floor|dancefloor|dancing|tonight|saturday night|friday night|weekend)\b/i;
export const RE_TITULO_FELIZ = /\b(happy|happiness|sunshine|sunny|good vibes|good life|feel good|feeling good|joy|smile|summer|verano|wonderful|beautiful day|celebrate|celebration|alegr[ií]a|feliz|fun|walking on)\b/i;
export const ARTISTAS_FELIZ = new Set(['pharrell williams', 'jamiroquai', 'earth wind & fire', 'earth, wind & fire', 'jackson 5', 'the jackson 5', 'abba', 'bruno mars', 'justin timberlake', 'mika', 'katy perry', 'spice girls', 'jennifer lopez', 'kylie minogue', 'britney spears', 'sweet female attitude']);

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

export const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const artistaBase = (s) => sinTildes(s).split(/,| · | feat\.? | & /)[0].trim();
const nombreDe = (id) => [...GENEROS, ...ESTADOS].find((m) => m.id === id)?.nombre ?? id;
const esGenero = (id) => GENEROS.some((g) => g.id === id);

/** Compositor de cine (artista ancla de Bandas sonoras). */
export const esCompositorDeCine = (artista) => ARTISTAS_ANCLA[artistaBase(artista)] === ID_BSO;

/** Reglas automáticas (2) y (3): álbum de banda sonora o compositor de cine. Son las que aplica también el móvil. */
export const esBandaSonora = (artista, album) => esCompositorDeCine(artista) || RE_ALBUM_BSO.test(album ?? '');

/** Regla (1): el usuario la puso, o venía de su playlist/eje «Soundtracks» (el origen se respeta aunque sea nombre-lista). */
const vieneDeBSO = (t) => (t.ejes ?? []).some((x) => EJES_BSO_ORIGEN.has(x.ejeId));

/** Géneros de MusicBrainz por artista (nombre base) usando cualquier canción del artista que los tenga. */
export function generosPorArtista(tracks, musicbrainz) {
  const res = new Map();
  if (!musicbrainz?.tracks || !musicbrainz?.artistas) return res;
  for (const t of tracks) {
    const m = musicbrainz.tracks[t.id];
    const a = m && musicbrainz.artistas[m.artistaMbid];
    if (!a?.generos?.length) continue;
    const k = artistaBase(t.artista);
    if (!res.has(k)) res.set(k, new Set());
    for (const g of a.generos) res.get(k).add(g);
  }
  return res;
}

/** Puntuación de una canción por mood: { [moodId]: { p, manual } }. */
function puntuar(t, genArt, actividad = new Set()) {
  const s = {};
  const sumar = (id, w, manual = false) => {
    if (!w) return;
    s[id] ??= { p: 0, manual: false };
    s[id].p += w;
    if (manual) s[id].manual = true;
  };
  const k = artistaBase(t.artista);
  if (ARTISTAS_ANCLA[k]) sumar(ARTISTAS_ANCLA[k], 6);
  const cuenta = {};
  for (const g of genArt.get(k) ?? []) {
    const id = generoDeMB(sinTildes(g));
    if (id) cuenta[id] = (cuenta[id] ?? 0) + 1;
  }
  const total = Object.values(cuenta).reduce((a, c) => a + c, 0);
  for (const [id, c] of Object.entries(cuenta)) sumar(id, Math.min(3, ((3 * c) / total) * 1.2));
  const anclaT = ARTISTAS_ANCLA[k];
  for (const x of t.ejes ?? []) {
    if (EJES_BSO_ORIGEN.has(x.ejeId)) continue; // Bandas sonoras no decide el género (ver vieneDeBSO)
    // El id o el nombre del eje pueden ser otros en el móvil (p. ej. «Gym» con id distinto): se reconoce por ambos.
    const d = EVIDENCIA[x.ejeId] ?? (actividad.has(x.ejeId) ? ['E', 'con-energia', 1] : null) ?? (IDS_TAXONOMIA.has(x.ejeId) ? [null, x.ejeId, 1] : null); // ya migrada: cuenta lo que dice
    if (!d) continue;
    let w = pesoDe(x) * d[2];
    // Estar en una lista de entrenar (Gym, Gimnasio, Workout) ya es la señal: no hace falta sumar otra (en el móvil
    // suele quedar una sola lista, y con peso 1 no llegaba al umbral).
    if (d[1] === 'con-energia' && w > 0) w = Math.max(w, UMBRAL);
    if (x.origen !== 'manual' && esGenero(d[1])) {
      // El nombre de la lista de origen no prueba el género (una lista «Tango» con pop dentro).
      if (x.senal === 'nombre-lista') w = 0;
      // Una pista de IA solo se conserva si el género real (artista ancla o MusicBrainz) no la contradice.
      else if (x.senal === 'ia-embeddings' && ((anclaT && anclaT !== d[1]) || (Object.keys(cuenta).length > 0 && !cuenta[d[1]]))) w = 0;
    }
    sumar(d[1], w, x.origen === 'manual');
    if (x.ejeId === 'lofi') sumar('tranquilo', pesoDe(x), x.origen === 'manual'); // lofi = estudiar/relajarse
  }
  // Si el título dice «acoustic» (incluido «Acoustic Instrumental», guitarra), manda sobre Instrumental.
  if (/acoustic|ac[uú]stic|unplugged/i.test(t.titulo ?? '')) sumar('acustico', 6);
  return s;
}

function generoPrincipal(s) {
  let mejor = null;
  for (const g of GENEROS) {
    const v = s[g.id]?.p ?? 0;
    if (v >= UMBRAL && (!mejor || v > mejor.v)) mejor = { id: g.id, v };
  }
  return mejor;
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

/** Objeto-eje nuevo (forma de ejes.json) de un mood de la taxonomía. */
function ejeDeMood(m, familia, orden, previo) {
  return {
    ...(previo ?? {}),
    id: m.id,
    nombre: m.nombre,
    tipo: previo?.tipo === 'playlist' ? 'gusto' : (previo?.tipo ?? 'gusto'), // `tipo` queda por compatibilidad
    orden,
    activo: true,
    sistema: false,
    padre: null,
    descripcion: m.descripcion,
    anclas: previo?.anclas ?? { artistas: [], titulos: [] },
    tagsLastfm: previo?.tagsLastfm ?? [],
    origen: 'descubierto', // así el organizador sigue pudiendo rellenarlo
    familia,
    autoRellenar: true,
    ...(m.chipId ? { chipId: m.chipId } : {}),
  };
}

/**
 * Calcula el plan de migración sin tocar nada.
 * @returns plan: { moods, ejesEliminados, ejesConservados, asignaciones, correcciones, siembra, recuentos }
 */
export function planificarMigracion({ tracks, ejes, musicbrainz = null, bpm = null }) {
  const genArt = generosPorArtista(tracks, musicbrainz);
  const actividad = new Set(ejes.filter(esActividadEnergia).map((e) => e.id));
  const filas = tracks.map((t) => ({ t, s: puntuar(t, genArt, actividad), bso: vieneDeBSO(t) || esBandaSonora(t.artista, musicbrainz?.tracks?.[t.id]?.album), genero: null, estados: new Set(), siembra: {} }));

  // 1) Género principal por puntuación; 2) herencia por artista (>= 2 canciones y >= 60 % de acuerdo).
  for (const f of filas) f.genero = generoPrincipal(f.s)?.id ?? null;
  const votos = new Map();
  for (const f of filas) {
    if (!f.genero) continue;
    const k = artistaBase(f.t.artista);
    const v = votos.get(k) ?? {};
    v[f.genero] = (v[f.genero] ?? 0) + 1;
    votos.set(k, v);
  }
  for (const f of filas) {
    if (f.genero) continue;
    const v = votos.get(artistaBase(f.t.artista));
    if (!v) continue;
    const total = Object.values(v).reduce((a, c) => a + c, 0);
    const [id, c] = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    if (total >= 2 && c / total >= 0.6) f.genero = id;
  }

  // 3) Estados por evidencia (chill, lofi, gimnasio…).
  for (const f of filas) for (const e of ESTADOS) if ((f.s[e.id]?.p ?? 0) >= UMBRAL) f.estados.add(e.id);

  // 4) Siembra de «Party» y «Sunny» (solo si no estaban ya por evidencia).
  const siembra = { 'de-fiesta': { genero: 0, titulo: 0, bpm: 0, artista: 0 }, feliz: { titulo: 0, artista: 0 } };
  for (const f of filas) {
    const g = f.genero;
    const apto = g && !NO_SEMBRAR.has(g) && !f.estados.has('melancolico') && !f.estados.has('tranquilo');
    if (!apto) continue;
    const titulo = f.t.titulo ?? '';
    const tempo = bpm?.[f.t.id];
    if (GENEROS_FIESTA.has(g) && !f.estados.has('de-fiesta')) {
      const razon = Number.isFinite(tempo) ? (tempo >= BPM_FIESTA ? 'bpm' : null) : g === 'electronica' ? (RE_TITULO_FIESTA.test(titulo) ? 'titulo' : null) : 'genero';
      if (razon) {
        f.estados.add('de-fiesta');
        f.siembra['de-fiesta'] = razon;
        siembra['de-fiesta'][razon] += 1;
      }
    } else if (!GENEROS_FIESTA.has(g) && RE_TITULO_FIESTA.test(titulo) && GENEROS_FELIZ.has(g)) {
      f.estados.add('de-fiesta');
      f.siembra['de-fiesta'] = 'titulo';
      siembra['de-fiesta'].titulo += 1;
    }
    if (GENEROS_FELIZ.has(g) && !f.estados.has('feliz')) {
      const razon = ARTISTAS_FELIZ.has(artistaBase(f.t.artista)) ? 'artista' : RE_TITULO_FELIZ.test(titulo) ? 'titulo' : null;
      if (razon) {
        f.estados.add('feliz');
        f.siembra.feliz = razon;
        siembra.feliz[razon] += 1;
      }
    }
  }

  // 5) Moods finales (objetos-eje) y ejes que desaparecen.
  const porId = new Map(ejes.map((e) => [e.id, e]));
  const moods = [];
  ESTADOS.forEach((m, i) => moods.push(ejeDeMood(m, 'estado', 10 + i, m.reusa ? porId.get(m.reusa) : null)));
  GENEROS.forEach((m, i) => moods.push(ejeDeMood(m, 'genero', 30 + i, porId.get(m.reusa ?? m.id) ?? porId.get(m.id))));
  const idsMood = new Set(moods.map((m) => m.id));
  const fijos = LISTAS_FIJAS.filter((id) => porId.has(id));
  const conservados = [...INTOCABLES, ...fijos].filter((id) => porId.has(id));
  const ejesFijos = fijos.map((id) => ({ ...porId.get(id), familia: 'fijo', autoRellenar: false }));
  const ejesEliminados = ejes.map((e) => e.id).filter((id) => !idsMood.has(id) && !conservados.includes(id));

  // 6) Asignaciones por canción y correcciones.
  const asignaciones = [];
  const correcciones = new Map();
  let sinMood = 0;
  for (const f of filas) {
    const antes = (f.t.ejes ?? []).map((x) => x.ejeId);
    const fijosT = antes.filter((id) => fijos.includes(id));
    const estados = ESTADOS.map((e) => e.id).filter((id) => f.estados.has(id));
    const manual = new Set(Object.entries(f.s).filter(([, v]) => v.manual).map(([id]) => id));
    if ((f.t.ejes ?? []).some((x) => EJES_BSO_ORIGEN.has(x.ejeId) && x.origen === 'manual')) manual.add(ID_BSO);
    // Bandas sonoras como mood añadido: solo si no es ya el género principal.
    const bso = f.bso && f.genero !== ID_BSO;
    if (!f.genero && !bso && estados.length === 0 && fijosT.length === 0) sinMood += 1;
    asignaciones.push({ id: f.t.id, genero: f.genero, bso, estados, fijos: fijosT, antes, manual: [...manual], siembra: f.siembra });
    const k = artistaBase(f.t.artista);
    const destino = ARTISTAS_ANCLA[k];
    if (destino && f.genero === destino) {
      // Cuenta como corrección si estaba en un modo actual cuyo género por nombre era otro.
      const viejos = antes.map((id) => EVIDENCIA[id]).filter((d) => d && d[0] === 'G' && d[1] !== destino);
      if (viejos.length) {
        const de = antes.filter((id) => EVIDENCIA[id]?.[0] === 'G' && EVIDENCIA[id][1] !== destino);
        const clave = `${f.t.artista}|${de[0]}`;
        const c = correcciones.get(clave) ?? { artista: f.t.artista, de: de[0], a: destino, n: 0 };
        c.n += 1;
        correcciones.set(clave, c);
      }
    }
  }

  const porMood = {};
  for (const m of [...ESTADOS.map((x) => ({ ...x, familia: 'estado' })), ...GENEROS.map((x) => ({ ...x, familia: 'genero' }))]) {
    porMood[m.id] = { nombre: m.nombre, familia: m.familia, n: 0 };
  }
  for (const id of fijos) porMood[id] = { nombre: porId.get(id).nombre, familia: 'fijo', n: 0 };
  const bandasSonoras = { total: 0, soloBso: 0, conOtroGenero: 0 };
  for (const a of asignaciones) {
    if (a.genero) porMood[a.genero].n += 1;
    if (a.bso) porMood[ID_BSO].n += 1;
    if (a.genero === ID_BSO || a.bso) {
      bandasSonoras.total += 1;
      if (a.bso && a.genero) bandasSonoras.conOtroGenero += 1;
      else bandasSonoras.soloBso += 1;
    }
    for (const id of a.estados) porMood[id].n += 1;
    for (const id of a.fijos) porMood[id].n += 1;
  }

  return {
    version: 1,
    moods: [...moods, ...ejesFijos],
    ejesEliminados,
    ejesConservados: conservados,
    nombresAntes: Object.fromEntries(ejes.map((e) => [e.id, e.nombre])),
    asignaciones,
    correcciones: [...correcciones.values()].sort((a, b) => b.n - a.n),
    siembra,
    recuentos: { total: tracks.length, conAlgunMood: tracks.length - sinMood, sinMood, porMood, bandasSonoras },
  };
}

// ---------------------------------------------------------------------------------------------
// Simulación (texto) y aplicación (pura)
// ---------------------------------------------------------------------------------------------

/** Líneas legibles con los recuentos del plan: lo que verá el usuario antes de aprobar nada. */
export function formatearSimulacion(plan) {
  const r = plan.recuentos;
  const L = [];
  const fila = (id) => {
    const m = r.porMood[id];
    return `  ${m.nombre.padEnd(22)} ${String(m.n).padStart(5)}`;
  };
  L.push(`Canciones: ${r.total} · con algún mood: ${r.conAlgunMood} (${((100 * r.conAlgunMood) / (r.total || 1)).toFixed(1)} %) · sin ninguno: ${r.sinMood}`);
  L.push('', 'ESTADOS (una canción puede estar en varios)');
  for (const e of ESTADOS) L.push(fila(e.id));
  L.push('', 'GÉNEROS (uno principal por canción; Bandas sonoras se suma al suyo)');
  for (const g of GENEROS) L.push(fila(g.id));
  const b = r.bandasSonoras;
  if (b) L.push(`  Bandas sonoras en total: ${b.total} (solo Bandas sonoras ${b.soloBso}, además con otro género ${b.conOtroGenero})`);
  L.push('', 'LISTAS FIJAS (se conservan, no se rellenan solas)');
  for (const id of plan.moods.filter((m) => m.familia === 'fijo').map((m) => m.id)) L.push(fila(id));
  L.push('', 'SIEMBRA INICIAL (sin tempo ni ánimo en los datos: género, título y artista)');
  const sf = plan.siembra['de-fiesta'];
  L.push(`  Party: ${r.porMood['de-fiesta'].n} (por género ${sf.genero}, por tempo ${sf.bpm}, por título ${sf.titulo})`);
  const sh = plan.siembra.feliz;
  L.push(`  Sunny: ${r.porMood.feliz.n} (por título ${sh.titulo}, por artista ${sh.artista})`);
  L.push('', 'CORRECCIONES POR ARTISTA (modo actual -> género)');
  if (plan.correcciones.length === 0) L.push('  (ninguna)');
  for (const c of plan.correcciones) L.push(`  ${c.artista}: ${plan.nombresAntes?.[c.de] ?? c.de} -> ${nombreDe(c.a)} (${c.n})`);
  L.push('', `Ejes que desaparecen (${plan.ejesEliminados.length}): ${plan.ejesEliminados.join(', ') || '(ninguno)'}`);
  L.push(`Ejes que se conservan: ${plan.ejesConservados.join(', ')}`);
  return L;
}

/**
 * Aplica el plan a copias de los datos (no muta lo recibido). Devuelve { ejesData, tracks }.
 * Favoritas, sin-clasificar y las listas fijas se mantienen; el resto de ejes viejos desaparece de las canciones.
 */
export function aplicarPlan(ejesData, tracks, plan) {
  const porCancion = new Map(plan.asignaciones.map((a) => [a.id, a]));
  const quedan = new Set([...plan.ejesConservados]);
  const nuevos = tracks.map((t) => {
    const a = porCancion.get(t.id);
    if (!a) return t;
    const conservadas = (t.ejes ?? []).filter((x) => quedan.has(x.ejeId) && x.ejeId !== 'sin-clasificar');
    const nuevas = [];
    const meter = (ejeId) => {
      const manual = a.manual.includes(ejeId);
      nuevas.push({ ejeId, origen: manual ? 'manual' : 'auto', senal: manual ? 'usuario' : 'migracion-moods', score: 1 });
    };
    if (a.genero) meter(a.genero);
    if (a.bso) meter(ID_BSO);
    for (const id of a.estados) meter(id);
    const ejes = [...conservadas, ...nuevas];
    if (!a.genero && a.estados.length === 0 && a.fijos.length === 0) {
      ejes.push(...(t.ejes ?? []).filter((x) => x.ejeId === 'sin-clasificar'));
      if (!ejes.some((x) => x.ejeId === 'sin-clasificar')) ejes.push({ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 });
    }
    return { ...t, ejes };
  });
  const sistema = ejesData.ejes.filter((e) => plan.ejesConservados.includes(e.id) && !plan.moods.some((m) => m.id === e.id));
  return {
    ejesData: { ...ejesData, ejes: [...sistema, ...plan.moods] },
    tracks: nuevos,
  };
}

export { esGenero };

// ---------------------------------------------------------------------------------------------
// Versión de esquema (PC y móvil no pueden mezclarse si uno está migrado y el otro no)
// ---------------------------------------------------------------------------------------------

/** 0 = taxonomía antigua; 1 = moods (estados + géneros + listas). Se guarda como `esquemaMoods`. */
export const VERSION_ESQUEMA_MOODS = 1;

/** Versión de esquema de unos ejes: la marca guardada, o 1 si algún eje ya trae `familia` (migrado). */
export function esquemaDeEjes(ejes, marca = 0) {
  const porFamilia = (ejes ?? []).some((e) => e?.familia === 'estado' || e?.familia === 'genero' || e?.familia === 'fijo');
  return Math.max(Number(marca) || 0, porFamilia ? VERSION_ESQUEMA_MOODS : 0);
}

/** ¿Pueden sincronizarse? { ok } o { ok:false, motivo } con el texto para el usuario. */
export function esquemasCompatibles(local, remoto) {
  if (local === remoto) return { ok: true };
  if (local > remoto) {
    return { ok: false, motivo: 'Este móvil ya está reorganizado en moods y el PC todavía no. Reorganiza el PC con scripts/aplicar-migracion-moods.mjs (con la app de escritorio cerrada) y vuelve a sincronizar.' };
  }
  return { ok: false, motivo: 'El PC ya está reorganizado en moods y este móvil todavía no. Abre Ajustes › Reorganizar en moods antes de sincronizar.' };
}

/** ¿Se debe fusionar la biblioteca que trae el build? No si pisaría un móvil ya reorganizado con datos antiguos. */
export function puedeFusionarSemilla(esquemaLocal, esquemaSemilla) {
  return esquemaSemilla >= esquemaLocal;
}

const CAMBIOS_DE_MOODS = new Set(['ejes', 'confirmar-modos', 'asignar', 'quitar-modo', 'coleccion', 'unir-modos']);
/**
 * Registro de cambios del móvil tras reorganizar: los que hablan de moods con ids antiguos se descartan
 * (reenviarlos al PC resucitaría los moods viejos); el resto (altas, me gusta, correcciones) se conserva.
 */
export function filtrarCambiosTrasMigracion(cambios) {
  const quedan = [];
  const descartados = [];
  for (const c of cambios ?? []) (CAMBIOS_DE_MOODS.has(c.endpoint) ? descartados : quedan).push(c);
  return { quedan, descartados };
}

/** Datos con forma de metadata-musicbrainz a partir de lo que tiene el móvil (store `generos` + metadata de álbum). */
export function musicbrainzDeMovil({ tracks, generos = [], metadata = null }) {
  const porId = new Map(generos.map((r) => [r.trackId, r]));
  const res = { tracks: {}, artistas: {} };
  for (const t of tracks) {
    const r = porId.get(t.id);
    const g = [...(r?.generosMB ?? []), ...(r?.evidenciaPC?.senal === 'genero-musicbrainz' ? (r.evidenciaPC.generos ?? []) : [])];
    const album = metadata?.tracks?.[t.id]?.album ?? null;
    if (g.length === 0 && !album) continue;
    const mbid = `movil:${t.id}`;
    res.tracks[t.id] = { artistaMbid: mbid, album };
    res.artistas[mbid] = { generos: [...new Set(g)] };
  }
  return res;
}
