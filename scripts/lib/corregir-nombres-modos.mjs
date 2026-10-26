/**
 * Corrige la capitalización de los modos descubiertos que ya existen en
 * disco, para las instalaciones que los crearon ANTES de que
 * `nombrarModo` (descubrir-modos.mjs) empezara a poner mayúscula en cada
 * palabra de un término sin curar, no solo en la primera de toda la frase.
 * Antes: "Festival progressive house". Ahora: "Festival Progressive House".
 *
 * Sin esto, el arreglo de `nombrarModo` solo se vería en modos NUEVOS: los
 * que ya están en ejes.json quedarían con el nombre viejo para siempre,
 * porque el re-descubrimiento normal solo mira tracks sin clasificar, nunca
 * revisa el nombre de un modo que ya existe.
 *
 * Solo toca `origen: 'descubierto'` — nunca una playlist ni un modo creado
 * a mano. Y dentro de esos, nunca un nombre que sea EXACTAMENTE uno de los
 * valores curados en `nombresHumanos`: una entrada curada puede tener
 * minúsculas a propósito por gramática española ("Rock en Español", donde
 * "en" no es un descuido) — aplicarle Title Case a ciegas la rompería
 * ("Rock En Español"). Solo se corrige lo que salió del fallback crudo
 * (capitalizar solo la primera letra de toda la frase), que es exactamente
 * lo que `nombrarModo` ya no hace más.
 *
 * Es naturalmente idempotente (aplicar Title Case sobre un nombre que ya
 * está en Title Case no cambia nada), así que no hace falta ninguna marca
 * de "ya corrí esto" — puede llamarse en cada arranque sin costo real
 * cuando no hay nada para corregir.
 */
import { capitalizarCadaPalabra } from './descubrir-modos.mjs';

export function corregirNombresModos(ejesData, nombresHumanos) {
  const nombresCurados = new Set(Object.values(nombresHumanos ?? {}));
  let corregidos = 0;
  for (const eje of ejesData.ejes ?? []) {
    if (eje?.origen !== 'descubierto' || !eje.nombre) continue;
    if (nombresCurados.has(eje.nombre)) continue;
    const corregido = capitalizarCadaPalabra(eje.nombre);
    if (corregido !== eje.nombre) {
      eje.nombre = corregido;
      corregidos++;
    }
  }
  return { corregidos };
}
