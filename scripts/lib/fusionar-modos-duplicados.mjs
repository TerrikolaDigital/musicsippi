/**
 * Núcleo de la migración que fusiona modos con el mismo nombre ("Chill" y
 * "Chill" -> un solo "Chill"). Lo usa scripts/fusionar-modos-duplicados.mjs.
 *
 * Dos casos:
 *  - 'lista': un eje importado (tipo 'playlist') y un modo descubierto. La
 *    lista se convierte en el modo y conserva su id.
 *  - 'descubierto': dos modos descubiertos (p. ej. «Soundtrack» y
 *    «Soundtracks», creado por una app antigua que no fundía singular/plural).
 *    Se conserva el que tenga más canciones; ante empate, el id sin sufijo
 *    numérico («chill» antes que «chill-2»); el resto se elimina.
 */
import { convertirListaEnModo } from './aplicar-modos.mjs';
import { claveNombreModo } from './nombre-modo.mjs';

/**
 * Mueve las pertenencias, historial y últimos modos del eje `perdedor` al
 * `ganador` y quita el perdedor de `ejesData`. Muta sus argumentos.
 */
export function fusionarEje(ganador, perdedor, ejesData, biblioteca, historial, ultimosModos) {
  let movidas = 0;
  let yaEnLista = 0;
  for (const track of biblioteca.tracks ?? []) {
    const asigs = track.ejes ?? [];
    const deDup = asigs.find((a) => a?.ejeId === perdedor.id);
    if (!deDup) continue;
    if (asigs.some((a) => a?.ejeId === ganador.id)) yaEnLista++;
    else {
      movidas++;
      asigs.push({ ...deDup, ejeId: ganador.id });
    }
    track.ejes = asigs.filter((a) => a?.ejeId !== perdedor.id);
  }
  for (const h of historial) {
    if (h?.ejeId === perdedor.id) {
      h.ejeId = ganador.id;
      if (h.ejeNombre) h.ejeNombre = ganador.nombre;
    }
  }
  const vistos = new Set();
  const unicos = ultimosModos.map((id) => (id === perdedor.id ? ganador.id : id)).filter((id) => !vistos.has(id) && vistos.add(id));
  ultimosModos.splice(0, ultimosModos.length, ...unicos);
  ejesData.ejes = ejesData.ejes.filter((e) => e !== perdedor);
  return { movidas, yaEnLista };
}

/**
 * Muta `ejesData`, `biblioteca`, `historial` (array) y `ultimosModos` (array
 * de ids). Devuelve
 * [{tipo, lista, duplicado, nombre, movidas, yaEnLista}]: `lista` es el id del
 * eje que queda (en el caso 'descubierto', el conservado).
 */
export function fusionarModosDuplicados(ejesData, biblioteca, historial = [], ultimosModos = []) {
  const ejes = ejesData.ejes ?? [];
  const resultado = [];

  const pares = [];
  for (const lista of ejes.filter((e) => e.tipo === 'playlist')) {
    const clave = claveNombreModo(lista.nombre ?? '');
    if (!clave) continue;
    const dup = ejes.find((e) => e !== lista && e.origen === 'descubierto' && claveNombreModo(e.nombre ?? '') === clave);
    if (dup) pares.push({ lista, dup });
  }
  for (const { lista, dup } of pares) {
    convertirListaEnModo(lista, biblioteca.tracks ?? []);
    const r = fusionarEje(lista, dup, ejesData, biblioteca, historial, ultimosModos);
    resultado.push({ tipo: 'lista', lista: lista.id, duplicado: dup.id, nombre: lista.nombre, ...r });
  }

  // Modos descubiertos entre sí (incluidas las listas convertidas arriba).
  const grupos = new Map();
  for (const e of ejesData.ejes ?? []) {
    if (e.origen !== 'descubierto') continue;
    const clave = claveNombreModo(e.nombre ?? '');
    if (!clave) continue;
    grupos.set(clave, [...(grupos.get(clave) ?? []), e]);
  }
  const canciones = (eje) => (biblioteca.tracks ?? []).filter((t) => (t.ejes ?? []).some((a) => a?.ejeId === eje.id)).length;
  const sinSufijo = (eje) => (/-\d+$/.test(eje.id) ? 0 : 1);
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const conteos = new Map(grupo.map((e) => [e, canciones(e)]));
    const [ganador, ...perdedores] = [...grupo].sort(
      (a, b) => conteos.get(b) - conteos.get(a) || sinSufijo(b) - sinSufijo(a) || (a.orden ?? 0) - (b.orden ?? 0)
    );
    for (const perdedor of perdedores) {
      const r = fusionarEje(ganador, perdedor, ejesData, biblioteca, historial, ultimosModos);
      resultado.push({ tipo: 'descubierto', lista: ganador.id, duplicado: perdedor.id, nombre: ganador.nombre, ...r });
    }
  }
  return resultado;
}
