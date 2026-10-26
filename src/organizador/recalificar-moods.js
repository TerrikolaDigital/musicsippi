// src/organizador/recalificar-moods.js
// «Recalificar moods»: corrige los estados y géneros que dejó la migración a moods (informe de auditoría de moods,
// reglas R1-R9). Todo puro: recibe datos, devuelve el plan y las canciones ya corregidas; no toca disco ni red.
//
//   recalificarMoods({ tracks, ejes, copiaPrevia?, musicbrainz?, albumes?, vecinos?, accionesUsuario?, bpm? })
//     -> { plan, tracks }
//   formatearRecalificacion(plan)  -> líneas de texto con la tabla por mood
//   accionesDeJournal(cambios)     -> { [trackId]: [ejeId] } de lo que el usuario hizo desde el móvil
//
// Reglas (ver docs de la auditoría):
//   R1  La pertenencia heredada de una lista importada (lo que la migración escribió como manual/usuario) pasa a
//       origen 'lista' con peso 1,5. Solo lo que el usuario hizo de verdad después sigue siendo 'manual'.
//   R2  Matriz estado x género (compatibilidad-estados.js): vetos duros y blandos.
//   R3  Si una lista ESPECÍFICA (Melancholia, Gym/Workout, Inspiración) choca con el género de un artista, manda
//       la lista y se corrige el género. Con una lista AMPLIA (Chill) manda el género.
//   R4  Party y Sunny necesitan dos señales: género de fiesta/feliz y otra (título, artista, tempo, etiquetas).
//   R5  Género por dominancia de la etiqueta de MusicBrainz (>= 34 %), con pop/rock antes que dance en empates.
//   R6  Orden de fuentes: ancla de artista > conocimiento > MB dominante > herencia por artista (>= 60 %) >
//       vecinos; y un artista partido en varios géneros se unifica por mayoría (>= 60 %).
//   R8  Bandas sonoras solo con álbum, compositor, lista fija o decisión del usuario.
// Lo que el usuario hizo DESPUÉS de reorganizar (acciones reales) se respeta siempre.
import {
  ARTISTAS_ANCLA,
  ARTISTAS_FELIZ,
  BPM_FIESTA,
  ESTADOS,
  GENEROS,
  GENEROS_FELIZ,
  GENEROS_FIESTA,
  ID_BSO,
  LISTAS_FIJAS,
  RE_TITULO_FELIZ,
  RE_TITULO_FIESTA,
  artistaBase,
  esBandaSonora,
  esCompositorDeCine,
  generoDeMB,
  generosPorArtista,
  planificarMigracion,
  sinTildes,
} from './migrar-moods.js';
import { apoyaElTitulo, generoPrincipalDe, vetoBlando, vetoDuro } from './compatibilidad-estados.js';

export const SENAL_RECALIFICAR = 'recalificar-moods';
export const SENAL_LISTA = 'lista-importada';
export const PESO_LISTA = 1.5;
export const DOMINANCIA_MB = 0.34;
export const MAYORIA_ARTISTA = 0.6;
export const K_VECINOS_GENERO = 5;
export const MIN_VECINOS_GENERO = 3;
export const COSENO_VECINOS_GENERO = 0.6;

const IDS_GENERO = new Set(GENEROS.map((g) => g.id));
const IDS_ESTADO = new Set(ESTADOS.map((e) => e.id));
const NOMBRE = new Map([...GENEROS, ...ESTADOS].map((m) => [m.id, m.nombre]));
/** Listas con identidad propia (estado cuya lista de origen es concreta): su estado manda sobre el género. */
const ESTADOS_DE_LISTA_ESPECIFICA = new Set(['melancolico', 'con-energia', 'inspirado']);
const SENALES_DEBILES_BSO = new Set(['nombre-lista', 'ia-embeddings', 'descubrimiento']);
/** Géneros que no se tocan al unificar un artista partido (son de formato o temáticos, no de estilo). */
const GENEROS_DE_FORMATO = new Set(['acustico', 'instrumental', 'chillout-lounge', ID_BSO]);
/** En un empate de etiquetas de MusicBrainz, pop y rock van antes que dance (R5). */
const ORDEN_EMPATE = ['pop', 'rock', 'rock-alternativo', 'soul-hip-hop', 'folk-country', 'pop-bailable', 'electronica', 'latino', 'reggaeton', 'salsa', 'tango', 'instrumental', 'acustico', 'chillout-lounge'];
const ARTISTAS_FIESTA = new Set(Object.entries(ARTISTAS_ANCLA).filter(([, g]) => g === 'pop-bailable').map(([a]) => a));

// Conocimiento musical: artista -> géneros aceptables (el primero es el preferido). Amplía ARTISTAS_ANCLA (R6).
// Es una lista corta de artistas muy conocidos; lo que no está aquí se decide por etiquetas, herencia o vecinos.
const CONOCIDOS = {
  'katy perry': ['pop', 'pop-bailable'], 'billie eilish': ['pop', 'rock-alternativo'], 'ed sheeran': ['pop', 'folk-country'],
  'ariana grande': ['pop', 'pop-bailable'], 'sam smith': ['pop', 'soul-hip-hop'], lorde: ['pop', 'rock-alternativo'],
  'mercedes sosa': ['folk-country', 'latino'], 'robbie williams': ['pop'], seal: ['soul-hip-hop', 'pop'],
  'daryl hall': ['pop', 'soul-hip-hop', 'rock'], 'ludovico einaudi': ['instrumental'], 'tame impala': ['rock-alternativo'],
  sia: ['pop', 'pop-bailable'], 'imagine dragons': ['rock-alternativo', 'rock', 'pop'], 'alanis morissette': ['rock', 'rock-alternativo'],
  nirvana: ['rock-alternativo', 'rock'], blur: ['rock-alternativo'], oasis: ['rock-alternativo', 'rock'], 'r.e.m.': ['rock-alternativo', 'rock'],
  'the verve': ['rock-alternativo'], radiohead: ['rock-alternativo'], coldplay: ['rock-alternativo', 'pop'],
  'red hot chili peppers': ['rock', 'rock-alternativo'], 'amy winehouse': ['soul-hip-hop'], adele: ['soul-hip-hop', 'pop'],
  enigma: ['chillout-lounge', 'electronica'], 'empire of the sun': ['electronica', 'rock-alternativo', 'pop-bailable'],
  'capital cities': ['pop', 'electronica', 'rock-alternativo'], 'rufus du sol': ['electronica'],
  'dua lipa': ['pop-bailable', 'pop'], 'britney spears': ['pop', 'pop-bailable'], 'michael jackson': ['pop', 'soul-hip-hop', 'pop-bailable'],
  'spice girls': ['pop', 'pop-bailable'], 'justin bieber': ['pop', 'pop-bailable'], 'selena gomez': ['pop', 'pop-bailable'],
  'taylor swift': ['pop', 'folk-country'], 'harry styles': ['pop'], rihanna: ['pop', 'soul-hip-hop', 'pop-bailable'],
  'bruno mars': ['pop', 'soul-hip-hop', 'pop-bailable'], bts: ['pop'], drake: ['soul-hip-hop'], 'the weeknd': ['soul-hip-hop', 'pop'],
  "guns n' roses": ['rock'], 'guns n roses': ['rock'], aerosmith: ['rock'], queen: ['rock'], 'ac/dc': ['rock'], metallica: ['rock'], scorpions: ['rock'], 'bon jovi': ['rock'],
  'david guetta': ['electronica', 'pop-bailable'], 'calvin harris': ['electronica', 'pop-bailable'], galantis: ['electronica', 'pop-bailable'],
  'daft punk': ['electronica'], avicii: ['electronica'], kygo: ['electronica'],
  'badly drawn boy': ['folk-country', 'rock-alternativo'], 'the smashing pumpkins': ['rock-alternativo', 'rock'],
  'the killers': ['rock-alternativo', 'rock'], 'the cure': ['rock-alternativo'], 'the xx': ['rock-alternativo'],
  jamiroquai: ['soul-hip-hop', 'pop-bailable'], moby: ['electronica', 'chillout-lounge'], portishead: ['chillout-lounge'],
  'massive attack': ['chillout-lounge'], 'yann tiersen': ['instrumental'], 'elton john': ['pop', 'rock'],
};

/** Géneros aceptables de un artista: ancla (identidad clara) o conocimiento. null si no lo conocemos. */
export function generosConocidos(artista) {
  const a = artistaBase(artista);
  const ancla = ARTISTAS_ANCLA[a];
  if (ancla && ancla !== ID_BSO) return [ancla];
  if (ancla === ID_BSO) return null; // los compositores de cine se quedan como están
  const k = CONOCIDOS[a] ?? CONOCIDOS[Object.keys(CONOCIDOS).find((c) => a.startsWith(`${c} `))];
  return k ?? null;
}

/** { generoId: nº de etiquetas de MusicBrainz del artista que apuntan a él }. */
function cuentaMB(genArt, artista) {
  const c = {};
  for (const g of genArt.get(artistaBase(artista)) ?? []) {
    const id = generoDeMB(sinTildes(g));
    if (id) c[id] = (c[id] ?? 0) + 1;
  }
  return c;
}

/** R5: género dominante (>= 34 % de las etiquetas), con pop/rock antes que dance en empates. */
export function generoDominanteMB(cuenta) {
  const total = Object.values(cuenta).reduce((a, n) => a + n, 0);
  if (!total) return null;
  const orden = (id) => (ORDEN_EMPATE.indexOf(id) === -1 ? 99 : ORDEN_EMPATE.indexOf(id));
  const [id, n] = Object.entries(cuenta).sort((a, z) => z[1] - a[1] || orden(a[0]) - orden(z[0]))[0];
  return n / total >= DOMINANCIA_MB ? id : null;
}

/** Acciones del usuario anotadas en el registro de cambios del móvil: { [trackId]: [ejeId] }. */
export function accionesDeJournal(cambios) {
  const r = {};
  for (const c of cambios ?? []) {
    if (c?.endpoint !== 'asignar' && c?.endpoint !== 'quitar-modo') continue;
    const { trackId, ejeId } = c.cuerpo ?? {};
    if (!trackId || !ejeId) continue;
    (r[trackId] ??= []).push(ejeId);
  }
  return r;
}

/** Qué moods eran «manuales» en la copia previa (= pertenencia a una lista importada) y datos viejos útiles. */
function leerCopiaPrevia(copiaPrevia) {
  if (!copiaPrevia?.tracks?.length) return null;
  const plan = planificarMigracion({ tracks: copiaPrevia.tracks, ejes: copiaPrevia.ejes ?? [] });
  const heredados = new Map(plan.asignaciones.filter((a) => a.manual.length).map((a) => [a.id, new Set(a.manual)]));
  const bsoViejo = new Map();
  const danceViejo = new Set();
  const fijas = new Set(LISTAS_FIJAS);
  const enFija = new Set();
  for (const t of copiaPrevia.tracks) {
    for (const x of t.ejes ?? []) {
      if (x.ejeId === 'soundtracks' || x.ejeId === ID_BSO) bsoViejo.set(t.id, x);
      if (x.ejeId === 'dance' && x.origen === 'manual') danceViejo.add(t.id);
      if (fijas.has(x.ejeId)) enFija.add(t.id);
    }
  }
  return { heredados, bsoViejo, danceViejo, enFija };
}

const esMood = (id) => IDS_GENERO.has(id) || IDS_ESTADO.has(id);

/**
 * Calcula la recalificación. No muta lo recibido.
 * @param {object} p
 * @param {Array} p.tracks canciones ya migradas a moods (con `ejes`)
 * @param {Array} [p.ejes] ejes actuales (para saber qué listas fijas hay)
 * @param {{tracks:Array, ejes?:Array}|null} [p.copiaPrevia] biblioteca y ejes de ANTES de reorganizar: sin ella no se
 *   puede distinguir una lista importada de una decisión real, así que R1 y R8 no actúan y todo lo manual se respeta
 * @param {object|null} [p.musicbrainz] forma de metadata-musicbrainz.json ({tracks, artistas})
 * @param {Record<string,string>} [p.albumes] trackId -> álbum (además del de MusicBrainz)
 * @param {{vecinosDe:Function}|null} [p.vecinos] índice de vecinos por embeddings (crearIndiceVecinos)
 * @param {Record<string,string[]>} [p.accionesUsuario] trackId -> moods que el usuario tocó después de reorganizar
 * @param {Record<string,number>} [p.bpm] tempo si se conoce
 * @param {boolean} [p.fiestaEstricta] Party exige además una segunda señal propia (título, artista, tempo, etiquetas)
 * @returns {{plan:object, tracks:Array}}
 */
export function recalificarMoods({ tracks, ejes = [], copiaPrevia = null, musicbrainz = null, albumes = {}, vecinos = null, accionesUsuario = {}, bpm = null, fiestaEstricta = false }) {
  const avisos = [];
  const copia = leerCopiaPrevia(copiaPrevia);
  if (!copia) avisos.push('Sin copia previa a la reorganización: no se distingue lo heredado de una lista de lo que hiciste tú; todo lo manual se respeta y no se tocan Bandas sonoras.');
  const genArt = generosPorArtista(tracks, musicbrainz);
  const idsFijos = new Set([...LISTAS_FIJAS, ...ejes.filter((e) => e.familia === 'fijo').map((e) => e.id)]);
  const nombres = new Map(ejes.map((e) => [e.id, e.nombre]));
  const nombreDe = (id) => NOMBRE.get(id) ?? nombres.get(id) ?? id;

  const hizoElUsuario = (t, ejeId) => (accionesUsuario[t.id] ?? []).includes(ejeId);
  const heredado = (t, x) => x.origen === 'manual' && !hizoElUsuario(t, x.ejeId) && !!copia?.heredados.get(t.id)?.has(x.ejeId);
  const real = (t, x) => x.ejeId !== 'favoritos' && (hizoElUsuario(t, x.ejeId) || (x.origen === 'manual' && !heredado(t, x)));
  const deLista = (t, x) => x.origen === 'lista' || heredado(t, x);

  const filas = tracks.map((t) => {
    const g0 = generoPrincipalDe(t, IDS_GENERO);
    const gx = g0 ? t.ejes.find((x) => x.ejeId === g0) : null;
    return { t, g0, g: g0, bloqueado: !!gx && real(t, gx), motivoGenero: null, quitar: new Map(), tieneBSOQuitado: false };
  });
  const setGenero = (f, nuevo, motivo) => {
    if (!nuevo || nuevo === f.g) return;
    f.g = nuevo;
    f.motivoGenero = motivo;
  };

  // --- Géneros ------------------------------------------------------------------------------------------------
  // Pasada 1: ancla / conocimiento (R6) y, si no hay género, etiquetas dominantes de MusicBrainz (R5).
  for (const f of filas) {
    if (f.bloqueado || esCompositorDeCine(f.t.artista)) continue; // el compositor de cine ya es Bandas sonoras
    const ok = generosConocidos(f.t.artista);
    if (ok) {
      if (!f.g || !ok.includes(f.g)) setGenero(f, ok[0], 'artista-conocido');
    } else if (!f.g) {
      setGenero(f, generoDominanteMB(cuentaMB(genArt, f.t.artista)), 'etiquetas-musicbrainz');
    }
  }
  const votosDeArtista = (excluir = null) => {
    const m = new Map();
    for (const f of filas) {
      if (!f.g || (excluir && excluir(f))) continue;
      const k = artistaBase(f.t.artista);
      const v = m.get(k) ?? {};
      v[f.g] = (v[f.g] ?? 0) + 1;
      m.set(k, v);
    }
    return m;
  };
  const mayoria = (v) => {
    const total = Object.values(v).reduce((a, n) => a + n, 0);
    const [id, n] = Object.entries(v).sort((a, z) => z[1] - a[1])[0];
    return { id, n, total };
  };
  // Pasada 2: herencia por artista para lo que sigue sin género (>= 2 canciones y >= 60 % de acuerdo).
  const votos = votosDeArtista();
  for (const f of filas) {
    if (f.g || f.bloqueado) continue;
    const v = votos.get(artistaBase(f.t.artista));
    if (!v) continue;
    const m = mayoria(v);
    if (m.total >= 2 && m.n / m.total >= MAYORIA_ARTISTA) setGenero(f, m.id, 'herencia-artista');
  }
  // Pasada 3: artista partido en varios géneros -> mayoría (>= 60 %). No toca géneros de formato ni lo decidido por conocimiento.
  const votosPartido = votosDeArtista((f) => GENEROS_DE_FORMATO.has(f.g));
  for (const f of filas) {
    if (!f.g || f.bloqueado || GENEROS_DE_FORMATO.has(f.g) || generosConocidos(f.t.artista)) continue; // lo que dice el conocimiento no se unifica
    const v = votosPartido.get(artistaBase(f.t.artista));
    if (!v || Object.keys(v).length < 2) continue;
    const m = mayoria(v);
    if (m.id !== f.g && m.n / m.total >= MAYORIA_ARTISTA) setGenero(f, m.id, 'artista-partido');
  }
  // Pasada 4 (R3): una lista específica de estado manda sobre el género del artista; se baja el género.
  for (const f of filas) {
    if (f.bloqueado || !f.g) continue;
    const decisivos = f.t.ejes.filter((x) => ESTADOS_DE_LISTA_ESPECIFICA.has(x.ejeId) && (real(f.t, x) || deLista(f.t, x)));
    if (!decisivos.some((x) => vetoDuro(x.ejeId, f.g))) continue;
    const compatible = (g) => !decisivos.some((x) => vetoDuro(x.ejeId, g));
    const titulo = f.t.titulo ?? '';
    const candidatos = [...(generosConocidos(f.t.artista) ?? []), generoDominanteMB(cuentaMB(genArt, f.t.artista)), /acoustic|ac[uú]stic|unplugged/i.test(titulo) ? 'acustico' : null, 'pop'];
    const nuevo = candidatos.find((g) => g && IDS_GENERO.has(g) && g !== ID_BSO && compatible(g));
    setGenero(f, nuevo, 'genero-bajado-por-estado');
  }
  // Pasada 5: sin género y en una lista de entrenar -> Electrónica, solo si >= 3 de 5 vecinos (coseno >= 0,6) lo son.
  if (vecinos) {
    const generoFinal = new Map(filas.map((f) => [f.t.id, f.g]));
    for (const f of filas) {
      if (f.g || f.bloqueado) continue;
      const enEntrenar = f.t.ejes.some((x) => x.ejeId === 'con-energia' && (deLista(f.t, x) || real(f.t, x)));
      if (!enEntrenar) continue;
      const cerca = vecinos.vecinosDe(f.t.id, K_VECINOS_GENERO).filter((v) => v.s >= COSENO_VECINOS_GENERO);
      if (cerca.filter((v) => generoFinal.get(v.id) === 'electronica').length >= MIN_VECINOS_GENERO) setGenero(f, 'electronica', 'vecinos-electronica');
    }
  }

  // --- Estados y Bandas sonoras --------------------------------------------------------------------------------
  const motivoSalida = (f, ejeId, motivo) => f.quitar.set(ejeId, motivo);
  for (const f of filas) {
    const { t } = f;
    const titulo = t.titulo ?? '';
    for (const x of t.ejes) {
      if (real(t, x)) continue;
      if (IDS_ESTADO.has(x.ejeId)) {
        if (f.g && vetoDuro(x.ejeId, f.g)) {
          motivoSalida(f, x.ejeId, `veto-duro`);
          continue;
        }
        if (f.g && vetoBlando(x.ejeId, f.g) && deLista(t, x) && !apoyaElTitulo(x.ejeId, titulo)) {
          motivoSalida(f, x.ejeId, 'veto-blando');
          continue;
        }
        const sembrada = x.origen === 'auto' && x.senal === 'migracion-moods';
        if (sembrada && x.ejeId === 'de-fiesta') {
          const extras = [];
          if (RE_TITULO_FIESTA.test(titulo)) extras.push('titulo');
          if (ARTISTAS_FIESTA.has(artistaBase(t.artista))) extras.push('artista');
          const c = cuentaMB(genArt, t.artista);
          if ((c['pop-bailable'] ?? 0) + (c.electronica ?? 0) >= 2) extras.push('etiquetas');
          if (Number.isFinite(bpm?.[t.id]) && bpm[t.id] >= BPM_FIESTA) extras.push('bpm');
          if (copia?.danceViejo.has(t.id)) extras.push('lista-dance');
          const generoOk = f.g && GENEROS_FIESTA.has(f.g);
          const porTitulo = f.g && !generoOk && GENEROS_FELIZ.has(f.g) && extras.includes('titulo');
          if (!generoOk && !porTitulo) motivoSalida(f, x.ejeId, 'party-sin-genero-de-fiesta');
          else if (fiestaEstricta && generoOk && extras.length === 0) motivoSalida(f, x.ejeId, 'party-una-senal');
        } else if (sembrada && x.ejeId === 'feliz') {
          const apoyo = ARTISTAS_FELIZ.has(artistaBase(t.artista)) || RE_TITULO_FELIZ.test(titulo);
          if (!(f.g && GENEROS_FELIZ.has(f.g) && apoyo)) motivoSalida(f, x.ejeId, 'sunny-una-senal');
        }
      } else if (x.ejeId === ID_BSO) {
        // R8: sin copia no se sabe de dónde vino; con copia, solo cae la que entró por una señal débil del eje antiguo.
        const viejo = copia?.bsoViejo.get(t.id);
        const debil = viejo && viejo.origen !== 'manual' && SENALES_DEBILES_BSO.has(viejo.senal);
        const album = albumes[t.id] ?? musicbrainz?.tracks?.[t.id]?.album;
        const evidencia = x.origen === 'manual' || deLista(t, x) || esBandaSonora(t.artista, album) || copia?.enFija.has(t.id) || t.ejes.some((y) => idsFijos.has(y.ejeId));
        if (debil && !evidencia && x.origen === 'auto') motivoSalida(f, x.ejeId, 'bso-sin-evidencia');
      }
    }
  }

  // --- Construir las canciones nuevas y el plan --------------------------------------------------------------
  const moodsDe = (t) => new Set((t.ejes ?? []).map((x) => x.ejeId).filter((id) => esMood(id) || idsFijos.has(id)));
  const cambios = [];
  const nuevas = [];
  let aLista = 0;
  const porMotivo = {};
  for (const f of filas) {
    const { t } = f;
    const cambiaGenero = f.g !== f.g0;
    let colocado = false;
    const ejesN = [];
    const nuevoGenero = () => ({ ejeId: f.g, origen: 'auto', senal: SENAL_RECALIFICAR, score: 1 });
    let aListaTrack = 0;
    for (const x of t.ejes) {
      if (cambiaGenero && x.ejeId === f.g0) {
        if (f.g) {
          ejesN.push(nuevoGenero());
          colocado = true;
        }
        continue;
      }
      if (f.quitar.has(x.ejeId)) continue;
      if (esMood(x.ejeId) && heredado(t, x)) {
        ejesN.push({ ...x, origen: 'lista', senal: SENAL_LISTA, score: PESO_LISTA });
        aListaTrack += 1;
      } else ejesN.push(x);
    }
    if (cambiaGenero && f.g && !colocado) ejesN.push(nuevoGenero());
    const tieneMood = ejesN.some((x) => x.ejeId && x.ejeId !== 'sin-clasificar' && x.ejeId !== 'favoritos');
    if (tieneMood) {
      const i = ejesN.findIndex((x) => x.ejeId === 'sin-clasificar');
      if (i !== -1 && (f.quitar.size || cambiaGenero)) ejesN.splice(i, 1);
    } else if (!ejesN.some((x) => x.ejeId === 'sin-clasificar')) ejesN.push({ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 });

    const antes = moodsDe(t);
    const nueva = { ...t, ejes: ejesN };
    const despues = moodsDe(nueva);
    const sale = [...antes].filter((id) => !despues.has(id)).map((ejeId) => ({ ejeId, motivo: ejeId === f.g0 ? f.motivoGenero ?? 'cambio-de-genero' : (f.quitar.get(ejeId) ?? 'cambio') }));
    const entra = [...despues].filter((id) => !antes.has(id)).map((ejeId) => ({ ejeId, motivo: f.motivoGenero ?? 'cambio-de-genero' }));
    aLista += aListaTrack;
    if (aListaTrack || sale.length || entra.length) nuevas.push(nueva);
    else nuevas.push(t);
    if (sale.length || entra.length) {
      for (const s of sale) porMotivo[s.motivo] = (porMotivo[s.motivo] ?? 0) + 1;
      cambios.push({ id: t.id, artista: t.artista, titulo: t.titulo, sale, entra, genero: cambiaGenero ? { de: f.g0, a: f.g } : null });
    }
  }

  // --- Recuentos por mood -------------------------------------------------------------------------------------
  const lista = [...ESTADOS.map((m) => ({ id: m.id, familia: 'estado' })), ...GENEROS.map((m) => ({ id: m.id, familia: 'genero' })), ...[...idsFijos].filter((id) => ejes.some((e) => e.id === id)).map((id) => ({ id, familia: 'fijo' }))];
  const porMood = {};
  for (const m of lista) porMood[m.id] = { nombre: nombreDe(m.id), familia: m.familia, antes: 0, despues: 0, entran: 0, salen: 0 };
  const cuenta = (ts, campo) => {
    for (const t of ts) for (const id of new Set((t.ejes ?? []).map((x) => x.ejeId))) if (porMood[id]) porMood[id][campo] += 1;
  };
  cuenta(tracks, 'antes');
  cuenta(nuevas, 'despues');
  for (const c of cambios) {
    for (const s of c.sale) if (porMood[s.ejeId]) porMood[s.ejeId].salen += 1;
    for (const e of c.entra) if (porMood[e.ejeId]) porMood[e.ejeId].entran += 1;
  }
  const sinGenero = (ts) => ts.filter((t) => !generoPrincipalDe(t, IDS_GENERO) && !(t.ejes ?? []).some((x) => x.ejeId === ID_BSO)).length;
  const plan = {
    version: 1,
    avisos,
    cambios,
    resumen: {
      total: tracks.length,
      cambian: cambios.length,
      pierdenEstado: cambios.filter((c) => c.sale.some((s) => IDS_ESTADO.has(s.ejeId))).length,
      cambianGenero: cambios.filter((c) => c.genero).length,
      sinGeneroAntes: sinGenero(tracks),
      sinGeneroDespues: sinGenero(nuevas),
      aLista,
      porMotivo,
      porMood,
    },
  };
  return { plan, tracks: nuevas };
}

/** Líneas legibles: tabla por mood (antes, entran, salen, después) y motivos. */
export function formatearRecalificacion(plan) {
  const r = plan.resumen;
  const L = [];
  L.push(`Canciones: ${r.total} · cambian: ${r.cambian} (pierden algún estado ${r.pierdenEstado}, cambian de género ${r.cambianGenero}) · pasan a «lista» (R1): ${r.aLista}`);
  L.push(`Sin género: ${r.sinGeneroAntes} -> ${r.sinGeneroDespues}`);
  const fila = (id) => {
    const m = r.porMood[id];
    return `  ${m.nombre.padEnd(22)} ${String(m.antes).padStart(5)} ${String(m.entran).padStart(7)} ${String(m.salen).padStart(6)} ${String(m.despues).padStart(8)}`;
  };
  const cab = `  ${'Mood'.padEnd(22)} ${'antes'.padStart(5)} ${'entran'.padStart(7)} ${'salen'.padStart(6)} ${'después'.padStart(8)}`;
  L.push('', 'ESTADOS', cab);
  for (const e of ESTADOS) L.push(fila(e.id));
  L.push('', 'GÉNEROS', cab);
  for (const g of GENEROS) L.push(fila(g.id));
  const fijos = Object.entries(r.porMood).filter(([, m]) => m.familia === 'fijo');
  if (fijos.length) {
    L.push('', 'LISTAS FIJAS', cab);
    for (const [id] of fijos) L.push(fila(id));
  }
  L.push('', 'MOTIVOS (salidas)');
  for (const [m, n] of Object.entries(r.porMotivo).sort((a, z) => z[1] - a[1])) L.push(`  ${m.padEnd(30)} ${n}`);
  for (const a of plan.avisos) L.push('', `AVISO: ${a}`);
  return L;
}

/** Texto en castellano de un motivo (para la pantalla Revisar). */
export const MOTIVOS_TEXTO = {
  'veto-duro': 'No encaja con su género',
  'veto-blando': 'Poco compatible con su género',
  'party-sin-genero-de-fiesta': 'Su género no es de fiesta',
  'party-una-senal': 'Solo había una señal de fiesta',
  'sunny-una-senal': 'Solo había una señal de buen rollo',
  'bso-sin-evidencia': 'Sin álbum, compositor ni lista de banda sonora',
  'artista-conocido': 'Género corregido por el artista',
  'etiquetas-musicbrainz': 'Género por las etiquetas del artista',
  'herencia-artista': 'Género como el resto del artista',
  'artista-partido': 'Mismo género que el resto del artista',
  'genero-bajado-por-estado': 'Género ajustado a su estado',
  'vecinos-electronica': 'Suena como otras de Electrónica',
  'cambio-de-genero': 'Cambio de género',
};
