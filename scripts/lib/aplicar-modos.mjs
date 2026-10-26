import { normalizar } from './clasificar.mjs';
import { claveNombreModo } from './nombre-modo.mjs';

/**
 * Id estable para un eje nuevo a partir de su nombre humano ("Pop-dance /
 * house festivalero" -> "pop-dance-house-festivalero"). Reusa `normalizar`
 * de clasificar.mjs para la parte de acentos/mayúsculas en vez de duplicar
 * esa lógica, y le suma lo específico de un slug: sin comillas, cualquier
 * corrida de caracteres no alfanuméricos se colapsa a un solo guión, sin
 * guiones sobrantes en las puntas. La unicidad frente a ejes existentes la
 * resuelve `aplicarModosConfirmados` (ver `idUnico` ahí abajo).
 *
 * Movido acá desde vite.config.js junto con el resto de la lógica de
 * POST /api/confirmar-modos — ver aplicarModosConfirmados.
 */
export function slugificar(nombre) {
  return normalizar(nombre)
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Convierte una playlist importada en el modo descubierto del mismo nombre,
 * en el lugar: mismo `id`, `nombre`, `activo`, `orden`, `anclas`, etc., pero
 * `tipo: 'gusto'` y `origen: 'descubierto'`. Sus pertenencias pasan a
 * `origen: 'manual'` (las puso una persona al importar la lista) para que
 * ninguna reorganización automática las quite.
 */
export function convertirListaEnModo(eje, tracks) {
  eje.tipo = 'gusto';
  eje.origen = 'descubierto';
  for (const track of tracks) {
    for (const a of track.ejes ?? []) {
      if (a?.ejeId === eje.id) {
        a.origen = 'manual';
        a.senal = 'usuario';
      }
    }
  }
}

/**
 * Aplica modos confirmados (y transversales activados) a `ejesActuales` y
 * `biblioteca`, mutándolos en el lugar — mismo comportamiento que tenía el
 * cuerpo de POST /api/confirmar-modos en vite.config.js antes de esta
 * extracción: crea un eje nuevo por cada modo confirmado (origen:
 * 'descubierto') y por cada transversal activado (origen: 'transversal'), y
 * reclasifica los tracks correspondientes.
 *
 * Se movió a una función propia para que también la use el enriquecimiento
 * automático en background (scripts/lib/enriquecimiento-automatico.mjs), que
 * auto-confirma sin pasar por la pantalla de revisión (spec: "sin ningún
 * botón manual").
 *
 * `ejesActuales`: objeto completo de ejes.json (con `.ejes`, mutado).
 * `biblioteca`: objeto completo de biblioteca.json (con `.tracks`, mutado).
 * `modosConfirmados`: [{nombre, trackIds}].
 * `transversalesActivados`: [{id, nombre, trackIds}] (default []) — un
 * transversal NO saca 'sin-clasificar' de sus tracks (no es una
 * clasificación real, ver el filtro de `asignarTrack`).
 * `senalPorTrack`: {trackId: senal} (default {}) — con qué evidencia se
 * describió cada track (ver armarEvidenciaPorTrack en generos-por-track.mjs).
 * Queda guardada en el track para poder auditar después por qué terminó en
 * ese modo, y para que un re-descubrimiento con mejor evidencia pueda pisar a
 * una más débil. Es opcional a propósito: quien confirma desde la pantalla de
 * revisión no la calcula, y ahí se cae al genérico 'descubrimiento' de
 * siempre.
 * Devuelve `{ nuevosEjes }`. No escribe nada a disco — eso lo decide el
 * llamador (ver escribirAtomico, Tarea 1).
 */
export function aplicarModosConfirmados(
  ejesActuales,
  biblioteca,
  modosConfirmados,
  transversalesActivados = [],
  senalPorTrack = {}
) {
  const porId = new Map(biblioteca.tracks.map((t) => [t.id, t]));
  const idsExistentes = new Set(ejesActuales.ejes.map((e) => e.id));
  let siguienteOrden = Math.max(0, ...ejesActuales.ejes.map((e) => e.orden ?? 0)) + 1;

  function idUnico(nombre) {
    const base = slugificar(nombre) || 'modo';
    let id = base;
    let sufijo = 2;
    while (idsExistentes.has(id)) id = `${base}-${sufijo++}`;
    idsExistentes.add(id);
    return id;
  }

  /**
   * El modo descubierto que ya representa a `nombre`, si existe.
   *
   * El enriquecimiento automático re-corre el descubrimiento en CADA ciclo
   * (dos veces por ciclo: después de Deezer y después de MusicBrainz) y
   * re-agrupa desde cero lo que sigue sin clasificar. Un género que vuelve a
   * juntar masa suficiente vuelve a salir con el mismo nombre, y sin esto
   * `idUnico` lo tomaba como un choque de ids y creaba "electronic-2",
   * "electronic-3"... una vez por ciclo, para siempre. Medido en una
   * biblioteca real: Electronic, Latin y House duplicados, con conjuntos de
   * canciones DISJUNTOS (0 en común) — la firma exacta de "lo mismo,
   * re-descubierto más tarde".
   *
   * Solo busca entre `origen: 'descubierto'` a propósito: una playlist que
   * importó el usuario o un eje del sistema con el mismo nombre es otra cosa,
   * y volcarle canciones automáticas adentro le arruina una lista suya (ver
   * el test de "Rock"). Esos siguen resolviéndose con el sufijo de `idUnico`.
   */
  function modoDescubiertoConNombre(nombre) {
    const clave = claveNombreModo(nombre);
    if (!clave) return null;
    return ejesActuales.ejes.find((e) => e.origen === 'descubierto' && claveNombreModo(e.nombre ?? '') === clave) ?? null;
  }

  /**
   * Una playlist importada (`tipo: 'playlist'`) con el mismo nombre que el
   * modo descubierto: no se crea un eje aparte (el usuario veria dos
   * "Chill"), la lista se convierte en el modo. Ver convertirListaEnModo.
   */
  function playlistConNombre(nombre) {
    const clave = claveNombreModo(nombre);
    if (!clave) return null;
    return ejesActuales.ejes.find((e) => e.tipo === 'playlist' && claveNombreModo(e.nombre ?? '') === clave) ?? null;
  }

  /**
   * Un mood con «Se rellena sola» desactivado (`autoRellenar === false`) solo recibe lo que pone el usuario:
   * si un modo confirmado coincide por nombre con uno así, se salta (ni se le añaden canciones ni se crea un clon).
   */
  function moodCerradoConNombre(nombre) {
    const clave = claveNombreModo(nombre);
    if (!clave) return false;
    return ejesActuales.ejes.some((e) => e.autoRellenar === false && claveNombreModo(e.nombre ?? '') === clave);
  }

  function asignarTrack(track, ejeId, senal) {
    // Una pertenencia manual (p. ej. la de una lista convertida en modo) no se
    // degrada a automatica; solo se le saca 'sin-clasificar' como a cualquiera.
    if ((track.ejes ?? []).some((a) => a.ejeId === ejeId && a.origen === 'manual')) {
      track.ejes = track.ejes.filter((a) => !(senal !== 'transversal' && a.ejeId === 'sin-clasificar'));
      return;
    }
    // Un transversal no es una clasificación real (ver docstring de arriba):
    // solo se saca 'sin-clasificar' cuando la señal viene de un modo confirmado.
    track.ejes = (track.ejes ?? []).filter(
      (a) => a.ejeId !== ejeId && !(senal !== 'transversal' && a.ejeId === 'sin-clasificar')
    );
    track.ejes.push({ ejeId, origen: 'auto', senal, score: 1 });
  }

  const nuevosEjes = [];
  for (const modo of modosConfirmados) {
    if (!modo || typeof modo.nombre !== 'string' || !modo.nombre.trim() || !Array.isArray(modo.trackIds)) continue;
    if (moodCerradoConNombre(modo.nombre)) continue;
    // Si este modo ya existe (mismo ciclo o uno anterior), se le suman los
    // tracks nuevos en vez de crear un clon. No se cuenta como "nuevo eje":
    // quien llama usa `nuevosEjes` para avisar "descubrimos esto", y no se
    // descubrió nada que no estuviera ya.
    let eje = modoDescubiertoConNombre(modo.nombre);
    if (!eje) {
      eje = playlistConNombre(modo.nombre);
      if (eje) convertirListaEnModo(eje, biblioteca.tracks);
    }
    eje ??= {
      id: idUnico(modo.nombre),
      nombre: modo.nombre.trim(),
      tipo: 'gusto',
      orden: siguienteOrden++,
      activo: true,
      sistema: false,
      padre: null,
      descripcion: '',
      origen: 'descubierto',
      anclas: { artistas: [], titulos: [] },
      tagsLastfm: [],
    };
    if (!ejesActuales.ejes.includes(eje)) {
      ejesActuales.ejes.push(eje);
      nuevosEjes.push(eje);
    }
    for (const trackId of modo.trackIds) {
      const track = porId.get(trackId);
      // Sin evidencia propia, el track llegó acá por propagación del residuo
      // contra los modos candidatos (ver descubrirModos), o sea por similitud
      // de embeddings: ese es su origen real, no 'descubrimiento' a secas.
      if (track) asignarTrack(track, eje.id, senalPorTrack[trackId] ?? 'descubrimiento');
    }
  }

  for (const trans of transversalesActivados) {
    if (!trans || typeof trans.id !== 'string' || !trans.id.trim()) continue;
    if (typeof trans.nombre !== 'string' || !trans.nombre.trim() || !Array.isArray(trans.trackIds)) continue;
    let eje = ejesActuales.ejes.find((e) => e.id === trans.id);
    if (eje?.autoRellenar === false) continue;
    if (!eje) {
      eje = {
        id: trans.id,
        nombre: trans.nombre.trim(),
        tipo: 'funcional',
        orden: siguienteOrden++,
        activo: true,
        sistema: false,
        padre: null,
        descripcion: '',
        origen: 'transversal',
        anclas: { artistas: [], titulos: [] },
        tagsLastfm: [],
      };
      ejesActuales.ejes.push(eje);
      nuevosEjes.push(eje);
      idsExistentes.add(eje.id);
    }
    for (const trackId of trans.trackIds) {
      const track = porId.get(trackId);
      if (track) asignarTrack(track, eje.id, 'transversal');
    }
  }

  return { nuevosEjes };
}
