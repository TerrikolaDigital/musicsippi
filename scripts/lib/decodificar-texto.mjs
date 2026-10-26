/**
 * Decodifica los bytes de un archivo subido por el usuario a texto,
 * detectando si hace falta un fallback de codificación.
 *
 * Pensado para `archivo.arrayBuffer()` de un `<input type="file">` — el
 * caso real que motivó esto es "Cargar tu biblioteca" (CSV exportado desde
 * tunemymusic.com): antes se leía con `archivo.text()`, que SIEMPRE decodifica
 * como UTF-8 sin detectar nada. La gran mayoría de esos CSV son UTF-8 de
 * verdad, pero algunos (exportados por herramientas viejas, o desde ciertas
 * plataformas de origen) vienen en Windows-1252 — un acento ahí es un solo
 * byte que, forzado como UTF-8, es una secuencia inválida. El navegador no
 * lanza un error por eso: silenciosamente lo reemplaza por el carácter de
 * reemplazo U+FFFD, que en muchas fuentes/consolas se ve como un signo de
 * interrogación. Así "De Música Ligera" (importado ya en su momento)
 * apareció en la biblioteca como "De M?sica Ligera", sin ningún aviso.
 *
 * Estrategia: UTF-8 estricto primero (`fatal: true`, tira si encuentra una
 * secuencia inválida) — si eso funciona, es el 99% de los casos y no hace
 * falta adivinar nada más. Si tira, se reintenta con Windows-1252, que
 * puede decodificar CUALQUIER byte sin fallar (es de un solo byte por
 * carácter, cubre los 256 valores) — por eso sirve de red de contención y
 * no de primera opción: si se usara siempre, un CSV genuinamente UTF-8 con
 * tildes se leería mal.
 */
export function decodificarTextoDeArchivo(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}
