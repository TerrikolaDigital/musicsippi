// src/movil/importar/flujo-archivos-locales.js
// Lógica sin React de «Desde el móvil»: pedir archivos al plugin y redactar el resumen
// previo y el resultado. El componente solo pinta lo que sale de aquí.
import { pluralCanciones } from '../avisos.js';

export function formatearTamano(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * @param {'archivos'|'carpeta'|'escanear'} modo
 * @param {{seleccionarArchivosLocales: Function, escanearMediaStore: Function}} adaptador
 * @returns {Promise<{estado: 'cancelado'|'sin_permiso'|'vacio'|'listo', archivos?: object[], errores?: object[], bytes?: number}>}
 */
export async function prepararSeleccion(modo, adaptador) {
  const r = modo === 'escanear' ? await adaptador.escanearMediaStore() : await adaptador.seleccionarArchivosLocales({ carpeta: modo === 'carpeta' });
  if (r.permiso === false) return { estado: 'sin_permiso' };
  if (r.cancelado) return { estado: 'cancelado' };
  if (r.archivos.length === 0) return { estado: 'vacio', errores: r.errores };
  return { estado: 'listo', archivos: r.archivos, errores: r.errores, bytes: r.archivos.reduce((s, a) => s + a.tamano, 0) };
}

const plural = (n, uno, varios) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** Líneas del resumen que ve el usuario antes de confirmar. */
export function lineasResumen(prep, listas = []) {
  const lineas = [`${pluralCanciones(prep.archivos.length)} · ${formatearTamano(prep.bytes)}. Se quedan donde están: no se copian ni se duplican.`];
  if (listas.length) lineas.push(`${plural(listas.length, 'lista', 'listas')} para crear: ${listas.map((l) => l.nombre).join(', ')}.`);
  if (prep.errores?.length) lineas.push(`${plural(prep.errores.length, 'archivo no se puede leer y se omitirá', 'archivos no se pueden leer y se omitirán')}.`);
  return lineas;
}

export function textoResultado(r) {
  const partes = [];
  if (r.importados === 0) partes.push('No había nada nuevo que añadir.');
  else {
    const nuevas = r.tracksNuevos === 0 ? 'ya estaban en tu biblioteca' : `${plural(r.tracksNuevos, 'canción nueva', 'canciones nuevas')}`;
    partes.push(`${pluralCanciones(r.importados)} ${r.importados === 1 ? 'enlazada' : 'enlazadas'} con este móvil (${nuevas}). Ya puedes escucharlas; ahora las ordeno en moods.`);
  }
  for (const l of r.listas ?? []) {
    if (l.anadidas === 0) partes.push(`La lista «${l.nombre}» no coincide con ningún archivo elegido: no la he creado.`);
    else if (l.ausentes > 0) partes.push(`Lista «${l.nombre}»: ${pluralCanciones(l.anadidas)}; ${plural(l.ausentes, 'entrada no estaba entre tus archivos', 'entradas no estaban entre tus archivos')}.`);
    else partes.push(`Lista «${l.nombre}»: ${pluralCanciones(l.anadidas)}.`);
  }
  if (r.omitidos?.length) partes.push(`${plural(r.omitidos.length, 'archivo omitido', 'archivos omitidos')} (repetidos o sin datos).`);
  return partes;
}
