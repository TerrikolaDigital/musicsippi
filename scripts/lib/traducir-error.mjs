/**
 * Los mensajes de error propios (los que arma este código, ej.
 * `json.mensaje ?? json.error`) ya vienen en español porque los escribimos
 * nosotros. Los que NO controlamos — excepciones nativas del navegador
 * (leer un archivo, un JSON.parse que falla, una red caída) — vienen en el
 * idioma del navegador, casi siempre inglés, y se mostraban tal cual en la
 * UI. Esta función reconoce los casos nativos más comunes y los traduce;
 * cualquier otro mensaje (los nuestros, o uno nativo que no reconoce) pasa
 * sin tocar.
 */
export function traducirError(err) {
  const mensaje = err?.message ?? String(err ?? '');

  if (err?.name === 'NotFoundError' || /could not be found/i.test(mensaje)) {
    return 'No se pudo leer el archivo — puede haberse movido, renombrado, o ser demasiado grande para leerlo así. Probá elegirlo de nuevo.';
  }

  if (err instanceof SyntaxError || /JSON/i.test(mensaje)) {
    // Genérico a propósito, no "el archivo no es válido": SyntaxError también
    // sale de un JSON.parse(await r.json()) contra una respuesta del
    // servidor que no llegó a ser JSON — ahí no hay ningún archivo
    // involucrado, y decir "archivo" sería confuso para quien solo estaba
    // navegando un álbum o un artista.
    return 'No se pudo interpretar el contenido (formato inválido).';
  }

  if (/failed to fetch|fetch failed|networkerror/i.test(mensaje)) {
    return 'No se pudo conectar con Musicsippi. Revisá que la app siga abierta e intentá de nuevo.';
  }

  return mensaje;
}
